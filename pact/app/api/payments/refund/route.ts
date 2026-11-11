import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refundPaymentSchema } from "@/validations/payment";
import { refundPayPalSandboxCapture } from "@/lib/paypal/client";
import { logTransactionEvent } from "@/lib/ledger/events";

interface RecordedRefundEntry {
  refundId?: string;
  amountRefunded?: number;
  currency?: string;
  reason?: string;
  timestamp?: string;
  isSimulated?: boolean;
}

function getPriorRefundedAmount(rawResponse: Record<string, unknown>): number {
  const refundsList = Array.isArray(rawResponse.refunds)
    ? (rawResponse.refunds as RecordedRefundEntry[])
    : [];

  if (refundsList.length > 0) {
    return refundsList.reduce(
      (sum, entry) => sum + (Number(entry.amountRefunded) || 0),
      0
    );
  }

  const singleRefund = rawResponse.refund as RecordedRefundEntry | undefined;
  return Number(singleRefund?.amountRefunded) || 0;
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = (await req.json()) as Record<string, unknown>;
    const normalizedBody = {
      captureId: rawBody.captureId ?? rawBody.capture_id,
      refundAmount:
        typeof rawBody.refundAmount === "string"
          ? Number(rawBody.refundAmount)
          : rawBody.refundAmount ??
            (typeof rawBody.refund_amount === "string"
              ? Number(rawBody.refund_amount)
              : rawBody.refund_amount),
      reason: rawBody.reason,
      transactionId: rawBody.transactionId ?? rawBody.transaction_id,
      paymentRecordId: rawBody.paymentRecordId ?? rawBody.payment_record_id,
      currency: rawBody.currency,
      aiMediation: rawBody.aiMediation ?? rawBody.ai_mediation,
    };

    const validated = refundPaymentSchema.safeParse(normalizedBody);
    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues?.[0]?.message || "Invalid refund payload" },
        { status: 400 }
      );
    }

    const {
      captureId,
      refundAmount,
      reason,
      transactionId,
      paymentRecordId,
      currency,
      aiMediation,
    } = validated.data;

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Locate target captured payment record
    let recordQuery = supabase.from("payment_records").select("*");
    recordQuery = paymentRecordId
      ? recordQuery.eq("id", paymentRecordId)
      : recordQuery.eq("paypal_capture_id", captureId);

    const { data: paymentRecord, error: recordError } = await recordQuery.maybeSingle();

    if (recordError || !paymentRecord) {
      return NextResponse.json(
        { error: "Captured PayPal payment record not found." },
        { status: 404 }
      );
    }

    if (transactionId && paymentRecord.transaction_id !== transactionId) {
      return NextResponse.json(
        { error: "Capture ID does not belong to the specified transaction." },
        { status: 400 }
      );
    }

    const targetTransactionId = paymentRecord.transaction_id as string;

    // Verify user is an authorized participant or transaction creator
    const [{ data: participant }, { data: tx }] = await Promise.all([
      supabase
        .from("transaction_participants")
        .select("role")
        .eq("transaction_id", targetTransactionId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("transactions")
        .select("id, creator_id, currency, total_amount")
        .eq("id", targetTransactionId)
        .maybeSingle(),
    ]);

    if (!tx || (!participant && tx.creator_id !== user.id)) {
      return NextResponse.json(
        { error: "Forbidden: Not an authorized transaction participant" },
        { status: 403 }
      );
    }

    if (
      paymentRecord.status !== "COMPLETED" &&
      paymentRecord.status !== "PARTIALLY_REFUNDED"
    ) {
      return NextResponse.json(
        {
          error: `Only captured payments can be refunded (current status: ${paymentRecord.status}).`,
        },
        { status: 400 }
      );
    }

    const existingRaw =
      paymentRecord.raw_response &&
      typeof paymentRecord.raw_response === "object" &&
      !Array.isArray(paymentRecord.raw_response)
        ? (paymentRecord.raw_response as Record<string, unknown>)
        : {};

    const priorRefunded = getPriorRefundedAmount(existingRaw);
    const capturedAmount = Number(paymentRecord.amount);
    const remainingRefundable = Number(
      Math.max(0, capturedAmount - priorRefunded).toFixed(2)
    );

    if (remainingRefundable <= 0) {
      return NextResponse.json(
        { error: "This PayPal capture has already been fully refunded." },
        { status: 400 }
      );
    }

    if (refundAmount > remainingRefundable + 0.001) {
      return NextResponse.json(
        {
          error: `Refund amount (${refundAmount.toFixed(
            2
          )}) exceeds remaining refundable capture balance (${remainingRefundable.toFixed(
            2
          )}).`,
        },
        { status: 400 }
      );
    }

    const resolvedCaptureId =
      (paymentRecord.paypal_capture_id as string | null) || captureId;
    const resolvedCurrency = (
      currency ||
      (paymentRecord.currency as string | null) ||
      (tx.currency as string | null) ||
      "USD"
    ).toUpperCase();

    // Execute PayPal Sandbox Capture Refund via OAuth2 Bearer API
    const refundResult = await refundPayPalSandboxCapture({
      captureId: resolvedCaptureId,
      refundAmount,
      currency: resolvedCurrency,
      reason,
    });

    const priorRefunds = Array.isArray(existingRaw.refunds)
      ? (existingRaw.refunds as RecordedRefundEntry[])
      : [];
    const newTotalRefunded = Number(
      (priorRefunded + refundResult.amountRefunded).toFixed(2)
    );
    const nextPaymentStatus = "PARTIALLY_REFUNDED";

    const updatedRawResponse: Record<string, unknown> = {
      ...existingRaw,
      refund: {
        refundId: refundResult.refundId,
        captureId: resolvedCaptureId,
        amountRefunded: refundResult.amountRefunded,
        currency: refundResult.currency,
        status: refundResult.status,
        reason,
        timestamp: refundResult.timestamp,
        isSimulated: refundResult.isSimulated,
        paypalResponse: refundResult.rawResponse,
      },
      refunds: [
        ...priorRefunds,
        {
          refundId: refundResult.refundId,
          amountRefunded: refundResult.amountRefunded,
          currency: refundResult.currency,
          reason,
          timestamp: refundResult.timestamp,
          isSimulated: refundResult.isSimulated,
        },
      ],
      aiMediation: aiMediation ?? existingRaw.aiMediation ?? null,
    };

    const { data: updatedRecord, error: updateRecordError } = await supabase
      .from("payment_records")
      .update({
        status: nextPaymentStatus,
        raw_response: updatedRawResponse,
      })
      .eq("id", paymentRecord.id)
      .select()
      .single();

    if (updateRecordError) {
      throw new Error(
        `Refund processed (${refundResult.refundId}) but failed to update payment record: ${updateRecordError.message}`
      );
    }

    if (paymentRecord.milestone_id && newTotalRefunded >= capturedAmount - 0.01) {
      await supabase
        .from("payment_milestones")
        .update({ status: "refunded" })
        .eq("id", paymentRecord.milestone_id);
    }

    // Append immutable dispute_resolved event to tamper-evident Evidence Vault
    const ledgerEvent = await logTransactionEvent(
      targetTransactionId,
      "dispute_resolved",
      user.id,
      {
        captureId: resolvedCaptureId,
        paymentRecordId: paymentRecord.id,
        milestoneId: paymentRecord.milestone_id,
        refundId: refundResult.refundId,
        amountRefunded: refundResult.amountRefunded,
        currency: refundResult.currency,
        paymentStatus: nextPaymentStatus,
        reason,
        headline: aiMediation?.headline ?? null,
        deficitPercent: aiMediation?.deficitPercent ?? null,
        rationale: aiMediation?.rationale ?? null,
        claimNotes: aiMediation?.claimNotes ?? null,
        provider: aiMediation?.provider ?? null,
        refundTimestamp: refundResult.timestamp,
        isSimulated: refundResult.isSimulated,
      },
      supabase
    );

    return NextResponse.json({
      success: true,
      refundId: refundResult.refundId,
      amountRefunded: refundResult.amountRefunded,
      timestamp: refundResult.timestamp,
      status: nextPaymentStatus,
      currency: refundResult.currency,
      captureId: resolvedCaptureId,
      isSimulated: refundResult.isSimulated,
      ledgerEventId: ledgerEvent?.id ?? null,
      paymentRecord: updatedRecord,
    });
  } catch (err) {
    console.error("Error in /api/payments/refund:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Internal server error processing PayPal refund",
      },
      { status: 500 }
    );
  }
}

