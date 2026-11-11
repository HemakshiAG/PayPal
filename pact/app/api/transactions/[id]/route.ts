import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveDemoAccountByEmail } from "@/lib/auth/demo-accounts";
import {
  ensureDemoParticipantAccess,
  hasUsableServiceRoleKey,
} from "@/lib/auth/demo-provision";
import { mapRawAgreementVersion } from "@/lib/agreement/mapper";
import type { MilestoneStatus, PaymentMilestone, PaymentRecord } from "@/types/payment";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const sessionClient = await createClient();

    const {
      data: { user },
      error: authError,
    } = await sessionClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const demoAccount = resolveDemoAccountByEmail(user.email);
    if (demoAccount) {
      await ensureDemoParticipantAccess(sessionClient, user, id);
    }

    const supabase =
      demoAccount && hasUsableServiceRoleKey()
        ? createAdminClient()
        : sessionClient;

    const [{ data: tx, error: txError }, { data: participant }] =
      await Promise.all([
        supabase.from("transactions").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("transaction_participants")
          .select("role")
          .eq("transaction_id", id)
          .eq("user_id", user.id)
          .maybeSingle(),
      ]);

    if (txError || !tx) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    if (!participant && tx.creator_id !== user.id && !demoAccount) {
      return NextResponse.json(
        { error: "Forbidden: You are not a participant in this transaction" },
        { status: 403 }
      );
    }

    const [{ data: rawVersions }, { data: rawMilestones }, { data: rawRecords }] =
      await Promise.all([
        supabase
          .from("agreement_versions")
          .select(
            `
            *,
            agreement_approvals (
              id,
              agreement_version_id,
              transaction_id,
              user_id,
              role,
              content_hash,
              approved_at,
              profiles (
                full_name,
                avatar_url
              )
            )
          `
          )
          .eq("transaction_id", id)
          .order("version_number", { ascending: false }),
        supabase
          .from("payment_milestones")
          .select("*")
          .eq("transaction_id", id)
          .order("sequence_order", { ascending: true }),
        supabase
          .from("payment_records")
          .select("*")
          .eq("transaction_id", id)
          .order("created_at", { ascending: false }),
      ]);

    const agreementVersions = (
      (rawVersions as Array<Record<string, unknown>>) || []
    ).map((v) => mapRawAgreementVersion(v));

    const paymentRecords: PaymentRecord[] = (
      (rawRecords as Array<Record<string, unknown>>) || []
    ).map((r) => ({
      id: String(r.id || ""),
      milestoneId: String(r.milestone_id || ""),
      transactionId: String(r.transaction_id || id),
      payerId: String(r.payer_id || ""),
      paypalOrderId: String(r.paypal_order_id || ""),
      paypalCaptureId: (r.paypal_capture_id as string | null) ?? null,
      amount: Number(r.amount) || 0,
      currency: String(r.currency || tx.currency || "USD"),
      status: String(r.status || "CREATED"),
      rawResponse: (r.raw_response as Record<string, unknown>) || {},
      createdAt: String(r.created_at || ""),
    }));

    const milestones: PaymentMilestone[] = (
      (rawMilestones as Array<Record<string, unknown>>) || []
    ).map((m) => {
      const milestoneId = String(m.id || "");
      return {
        id: milestoneId,
        transactionId: String(m.transaction_id || id),
        agreementVersionId: String(m.agreement_version_id || ""),
        title: String(m.title || "Escrow Milestone"),
        description: (m.description as string | null) ?? null,
        amount: Number(m.amount) || 0,
        currency: String(m.currency || tx.currency || "USD"),
        sequenceOrder: Number(m.sequence_order) || 1,
        status:
          (String(m.status || "pending").toLowerCase() as MilestoneStatus) ||
          "pending",
        dueDate: (m.due_date as string | null) ?? null,
        createdAt: String(m.created_at || ""),
        updatedAt: String(m.updated_at || ""),
        latestPaymentRecord:
          paymentRecords.find((rec) => rec.milestoneId === milestoneId) || null,
      };
    });

    return NextResponse.json({
      success: true,
      transaction: {
        id: tx.id,
        title: tx.title,
        description: tx.description,
        category: tx.category,
        status: tx.status,
        inviteCode: tx.invite_code,
        totalAmount: Number(tx.total_amount) || 0,
        currency: tx.currency || "USD",
        createdAt: tx.created_at,
      },
      agreementVersions,
      milestones,
      paymentRecords,
    });
  } catch (err) {
    console.error("[api/transactions/[id]] Error fetching latest state:", err);
    return NextResponse.json(
      { error: "Failed to fetch transaction payments state" },
      { status: 500 }
    );
  }
}

