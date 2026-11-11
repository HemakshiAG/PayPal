import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { mediateDisputeWithAI } from "@/services/ai/mediator";
import type { TargetCaptureInfo } from "@/types/dispute";

const mediateDisputeRequestSchema = z.object({
  transactionId: z.string().uuid("Invalid transaction ID format"),
  claimNotes: z.string().max(1500).optional(),
  captureId: z.string().min(3).max(120).optional(),
});

function computePriorRefunded(rawResponse: unknown): number {
  if (!rawResponse || typeof rawResponse !== "object" || Array.isArray(rawResponse)) {
    return 0;
  }
  const obj = rawResponse as Record<string, unknown>;
  if (Array.isArray(obj.refunds)) {
    return (obj.refunds as Array<{ amountRefunded?: number }>).reduce(
      (sum, entry) => sum + (Number(entry.amountRefunded) || 0),
      0
    );
  }
  const single = obj.refund as { amountRefunded?: number } | undefined;
  return Number(single?.amountRefunded) || 0;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = (await req.json()) as Record<string, unknown>;
    const normalized = {
      transactionId: rawBody.transactionId ?? rawBody.transaction_id,
      claimNotes: rawBody.claimNotes ?? rawBody.claim_notes,
      captureId: rawBody.captureId ?? rawBody.capture_id,
    };

    const validated = mediateDisputeRequestSchema.safeParse(normalized);
    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues?.[0]?.message || "Invalid mediation request" },
        { status: 400 }
      );
    }

    const { transactionId, claimNotes, captureId } = validated.data;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify participant / creator permission
    const [{ data: participant }, { data: tx, error: txError }] = await Promise.all([
      supabase
        .from("transaction_participants")
        .select("role")
        .eq("transaction_id", transactionId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("transactions")
        .select("id, title, description, category, total_amount, currency, status, creator_id")
        .eq("id", transactionId)
        .maybeSingle(),
    ]);

    if (txError || !tx || (!participant && tx.creator_id !== user.id)) {
      return NextResponse.json(
        { error: "Forbidden: Not an authorized transaction participant" },
        { status: 403 }
      );
    }

    // Load locked/latest agreement, confirmed terms, chat logs, proof events, milestones, and payment captures
    const [
      { data: agreements },
      { data: terms },
      { data: messages },
      { data: proofEvents },
      { data: milestones },
      { data: paymentRecords },
    ] = await Promise.all([
      supabase
        .from("agreement_versions")
        .select("id, version_number, content_hash, title, sections, is_mutually_approved")
        .eq("transaction_id", transactionId)
        .order("version_number", { ascending: false }),
      supabase
        .from("extracted_terms")
        .select("term_key, term_value, category, status")
        .eq("transaction_id", transactionId)
        .eq("status", "confirmed"),
      supabase
        .from("messages")
        .select("id, sender_id, content, created_at")
        .eq("transaction_id", transactionId)
        .order("created_at", { ascending: true }),
      supabase
        .from("transaction_events")
        .select("event_type, timestamp, event_payload")
        .eq("transaction_id", transactionId)
        .in("event_type", ["proof_verified", "proof_rejected"])
        .order("timestamp", { ascending: true }),
      supabase
        .from("payment_milestones")
        .select("id, title")
        .eq("transaction_id", transactionId),
      supabase
        .from("payment_records")
        .select("*")
        .eq("transaction_id", transactionId)
        .order("created_at", { ascending: false }),
    ]);

    const eligibleRecords = (paymentRecords || []).filter(
      (r) =>
        Boolean(r.paypal_capture_id) &&
        (r.status === "COMPLETED" || r.status === "PARTIALLY_REFUNDED")
    );

    const selectedRecord = captureId
      ? eligibleRecords.find((r) => r.paypal_capture_id === captureId)
      : eligibleRecords.find((r) => {
          const prior = computePriorRefunded(r.raw_response);
          return Number(r.amount) - prior > 0.01;
        }) || eligibleRecords[0];

    if (!selectedRecord || !selectedRecord.paypal_capture_id) {
      return NextResponse.json(
        {
          error:
            "No refundable PayPal capture found on this transaction. Capture at least one milestone payment before launching refund mediation.",
        },
        { status: 400 }
      );
    }

    const milestoneMap = new Map<string, string>(
      (milestones || []).map((m) => [m.id as string, m.title as string])
    );

    const capturedAmount = Number(selectedRecord.amount);
    const priorRefundedAmount = Number(
      computePriorRefunded(selectedRecord.raw_response).toFixed(2)
    );
    const maxRefundableAmount = Number(
      Math.max(0, capturedAmount - priorRefundedAmount).toFixed(2)
    );

    const targetCapture: TargetCaptureInfo = {
      paymentRecordId: selectedRecord.id as string,
      captureId: selectedRecord.paypal_capture_id as string,
      milestoneId: (selectedRecord.milestone_id as string | null) ?? null,
      milestoneTitle:
        (selectedRecord.milestone_id &&
          milestoneMap.get(selectedRecord.milestone_id as string)) ||
        "Captured Milestone Payment",
      capturedAmount,
      priorRefundedAmount,
      maxRefundableAmount,
      currency: ((selectedRecord.currency as string | null) || tx.currency || "USD").toUpperCase(),
      status: selectedRecord.status as string,
    };

    if (maxRefundableAmount <= 0) {
      return NextResponse.json(
        { error: "All captured PayPal balances on this milestone have already been refunded." },
        { status: 400 }
      );
    }

    const activeAgreement =
      (agreements || []).find((a) => a.is_mutually_approved) ||
      (agreements || [])[0] ||
      null;

    const mediation = await mediateDisputeWithAI({
      transaction: {
        id: tx.id as string,
        title: tx.title as string,
        description: (tx.description as string | null) ?? null,
        category: (tx.category as string | null) ?? null,
        totalAmount: Number(tx.total_amount || 0),
        currency: ((tx.currency as string | null) || "USD").toUpperCase(),
        status: tx.status as string,
      },
      lockedAgreement: activeAgreement
        ? {
            id: activeAgreement.id as string,
            versionNumber: Number(activeAgreement.version_number),
            contentHash: activeAgreement.content_hash as string,
            title: (activeAgreement.title as string | undefined) ?? undefined,
            sections: activeAgreement.sections,
          }
        : null,
      confirmedTerms: (terms || []).map((t) => ({
        termKey: t.term_key as string,
        termValue: t.term_value as string,
        category: (t.category as string | null) ?? null,
      })),
      messages: (messages || []).map((m) => ({
        id: m.id as string,
        senderId: m.sender_id as string,
        content: m.content as string,
        createdAt: m.created_at as string,
      })),
      proofEvents: (proofEvents || []).map((ev) => ({
        eventType: ev.event_type as string,
        timestamp: ev.timestamp as string,
        payload:
          ev.event_payload && typeof ev.event_payload === "object"
            ? (ev.event_payload as Record<string, unknown>)
            : {},
      })),
      targetCapture,
      claimNotes,
    });

    return NextResponse.json({
      mediation,
      targetCapture,
    });
  } catch (err) {
    console.error("Error in /api/ai/mediate-dispute:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Internal server error during AI dispute mediation",
      },
      { status: 500 }
    );
  }
}

