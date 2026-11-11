import type { SupabaseClient } from "@supabase/supabase-js";
import { createPayPalSellerPayout } from "@/lib/paypal/client";
import { resolveTransactionParticipantContact } from "@/lib/paypal/participants";
import { logTransactionEvent } from "@/lib/ledger/events";
import { broadcastWorkspaceStatusUpdate } from "@/lib/realtime/broadcast";

export interface ExecutedPayoutReceipt {
  executed: boolean;
  payoutBatchId?: string;
  payoutItemId?: string;
  batchStatus?: string;
  amount?: number;
  currency?: string;
  sellerEmail?: string;
  captureId?: string;
  milestoneId?: string | null;
  milestoneTitle?: string;
  isSimulated?: boolean;
  releasedAt?: string;
  ledgerEventId?: string | null;
  simulationNotice?: string;
  skippedReason?: string;
}

function getNetReleasableCaptureAmount(
  capturedAmount: number,
  rawResponse: unknown
): number {
  if (!rawResponse || typeof rawResponse !== "object" || Array.isArray(rawResponse)) {
    return Number(capturedAmount.toFixed(2));
  }
  const obj = rawResponse as Record<string, unknown>;
  let refunded = 0;

  if (Array.isArray(obj.refunds)) {
    refunded = (obj.refunds as Array<{ amountRefunded?: number }>).reduce(
      (sum, entry) => sum + (Number(entry.amountRefunded) || 0),
      0
    );
  } else if (obj.refund && typeof obj.refund === "object") {
    refunded = Number((obj.refund as { amountRefunded?: number }).amountRefunded) || 0;
  }

  return Number(Math.max(0, capturedAmount - refunded).toFixed(2));
}

function hasExistingPayout(rawResponse: unknown): boolean {
  if (!rawResponse || typeof rawResponse !== "object" || Array.isArray(rawResponse)) {
    return false;
  }
  const obj = rawResponse as Record<string, unknown>;
  const payout = obj.payout as { payoutBatchId?: string } | undefined;
  return Boolean(payout?.payoutBatchId);
}

/**
 * Releases captured escrowed funds to the Seller's PayPal account via POST /v1/payments/payouts.
 * Used identically by POST /api/payments/payout and Gemini Vision Proof-of-Delivery auto-release.
 */
export async function executeSellerMilestonePayout(params: {
  supabase: SupabaseClient;
  actorUserId: string;
  transactionId: string;
  milestoneId?: string | null;
  captureId?: string | null;
  recipientEmail?: string;
  triggerSource: "gemini_vision_approval" | "manual_payout_api";
}): Promise<ExecutedPayoutReceipt> {
  const {
    supabase,
    actorUserId,
    transactionId,
    milestoneId,
    captureId,
    recipientEmail,
    triggerSource,
  } = params;

  const [{ data: tx }, { data: milestones }, { data: paymentRecords }] =
    await Promise.all([
      supabase
        .from("transactions")
        .select("id, title, currency")
        .eq("id", transactionId)
        .maybeSingle(),
      supabase
        .from("payment_milestones")
        .select("id, title, amount, currency, status, sequence_order")
        .eq("transaction_id", transactionId)
        .order("sequence_order", { ascending: true }),
      supabase
        .from("payment_records")
        .select("*")
        .eq("transaction_id", transactionId)
        .order("created_at", { ascending: false }),
    ]);

  if (!tx) {
    return {
      executed: false,
      skippedReason: "Transaction not found.",
    };
  }

  const capturedRecords = (paymentRecords || []).filter(
    (rec) =>
      Boolean(rec.paypal_capture_id) &&
      (rec.status === "COMPLETED" || rec.status === "PARTIALLY_REFUNDED")
  );

  // Locate target captured record not yet disbursed via Payouts API
  const candidateRecord =
    (captureId
      ? capturedRecords.find((rec) => rec.paypal_capture_id === captureId)
      : undefined) ||
    (milestoneId
      ? capturedRecords.find(
          (rec) => rec.milestone_id === milestoneId && !hasExistingPayout(rec.raw_response)
        )
      : undefined) ||
    capturedRecords.find((rec) => !hasExistingPayout(rec.raw_response));

  if (!candidateRecord || !candidateRecord.paypal_capture_id) {
    return {
      executed: false,
      skippedReason:
        "Visual proof approved. No unreleased PayPal capture currently held for payout.",
    };
  }

  if (hasExistingPayout(candidateRecord.raw_response)) {
    return {
      executed: false,
      skippedReason: "Seller payout has already been dispatched for this capture.",
    };
  }

  const netAmount = getNetReleasableCaptureAmount(
    Number(candidateRecord.amount),
    candidateRecord.raw_response
  );

  if (netAmount <= 0) {
    return {
      executed: false,
      skippedReason: "Remaining releasable capture balance is zero after refunds.",
    };
  }

  const sellerContact = await resolveTransactionParticipantContact({
    supabase,
    transactionId,
    role: "seller",
    fallbackEmail: recipientEmail || "seller@pact.demo",
  });
  const targetEmail = recipientEmail?.trim() || sellerContact.email;
  const currency = (
    (candidateRecord.currency as string | null) ||
    (tx.currency as string | null) ||
    "USD"
  ).toUpperCase();

  const linkedMilestone = (milestones || []).find(
    (m) => m.id === candidateRecord.milestone_id
  );
  const milestoneTitle =
    (linkedMilestone?.title as string | undefined) || "Verified Milestone Escrow";

  const payoutResult = await createPayPalSellerPayout({
    transactionId,
    transactionTitle: (tx.title as string) || "PACT Commercial Order",
    milestoneId: candidateRecord.milestone_id as string | null,
    captureId: candidateRecord.paypal_capture_id as string,
    amount: netAmount,
    currency,
    sellerEmail: targetEmail,
    note: `PACT Automated Payout Escrow release (${triggerSource}) for ${milestoneTitle}`,
  });

  const existingRaw =
    candidateRecord.raw_response &&
    typeof candidateRecord.raw_response === "object" &&
    !Array.isArray(candidateRecord.raw_response)
      ? (candidateRecord.raw_response as Record<string, unknown>)
      : {};

  await supabase
    .from("payment_records")
    .update({
      raw_response: {
        ...existingRaw,
        payout: {
          payoutBatchId: payoutResult.payoutBatchId,
          payoutItemId: payoutResult.payoutItemId,
          batchStatus: payoutResult.batchStatus,
          amount: payoutResult.amount,
          currency: payoutResult.currency,
          sellerEmail: payoutResult.sellerEmail,
          triggerSource,
          releasedAt: payoutResult.timestamp,
          isSimulated: payoutResult.isSimulated,
          paypalResponse: payoutResult.rawResponse,
        },
      },
    })
    .eq("id", candidateRecord.id);

  if (candidateRecord.milestone_id && linkedMilestone?.status !== "paid") {
    await supabase
      .from("payment_milestones")
      .update({ status: "paid" })
      .eq("id", candidateRecord.milestone_id);
  }

  const ledgerEvent = await logTransactionEvent(
    transactionId,
    "paypal_payout_released",
    actorUserId,
    {
      payoutBatchId: payoutResult.payoutBatchId,
      payoutItemId: payoutResult.payoutItemId,
      batchStatus: payoutResult.batchStatus,
      amount: payoutResult.amount,
      currency: payoutResult.currency,
      sellerEmail: payoutResult.sellerEmail,
      captureId: candidateRecord.paypal_capture_id,
      paymentRecordId: candidateRecord.id,
      milestoneId: candidateRecord.milestone_id,
      milestoneTitle,
      triggerSource,
      releasedAt: payoutResult.timestamp,
      isSimulated: payoutResult.isSimulated,
    },
    supabase
  );

  await broadcastWorkspaceStatusUpdate(
    {
      transactionId,
      eventType: "paypal_payout_released",
      milestoneId: candidateRecord.milestone_id as string | null,
      paymentRecordId: candidateRecord.id as string,
      status: payoutResult.batchStatus,
      summary: `Automated PayPal Payout (${payoutResult.currency} ${payoutResult.amount.toFixed(
        2
      )}) dispatched to ${payoutResult.sellerEmail} (Batch: ${payoutResult.payoutBatchId}).`,
      metadata: {
        payoutBatchId: payoutResult.payoutBatchId,
        sellerEmail: payoutResult.sellerEmail,
        amount: payoutResult.amount,
        currency: payoutResult.currency,
      },
    },
    supabase
  );

  return {
    executed: true,
    payoutBatchId: payoutResult.payoutBatchId,
    payoutItemId: payoutResult.payoutItemId,
    batchStatus: payoutResult.batchStatus,
    amount: payoutResult.amount,
    currency: payoutResult.currency,
    sellerEmail: payoutResult.sellerEmail,
    captureId: candidateRecord.paypal_capture_id as string,
    milestoneId: (candidateRecord.milestone_id as string | null) ?? null,
    milestoneTitle,
    isSimulated: payoutResult.isSimulated,
    releasedAt: payoutResult.timestamp,
    ledgerEventId: ledgerEvent?.id ?? null,
    simulationNotice: payoutResult.simulationNotice,
  };
}

