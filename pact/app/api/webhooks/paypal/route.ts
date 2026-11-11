import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { verifyPayPalWebhookSignature } from "@/lib/paypal/client";
import { logTransactionEvent } from "@/lib/ledger/events";
import { broadcastWorkspaceStatusUpdate } from "@/lib/realtime/broadcast";

interface PayPalWebhookEvent {
  id?: string;
  event_type?: string;
  create_time?: string;
  summary?: string;
  resource?: Record<string, unknown>;
}

async function resolveWebhookSupabase(): Promise<SupabaseClient> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return createAdminClient();
  }
  return await createClient();
}

function extractCaptureIdFromLinks(resource: Record<string, unknown>): string | null {
  const links = resource.links;
  if (!Array.isArray(links)) return null;
  for (const link of links) {
    if (link && typeof link === "object") {
      const l = link as { rel?: string; href?: string };
      if (l.rel === "up" && typeof l.href === "string" && l.href.includes("/captures/")) {
        const segment = l.href.split("/captures/")[1]?.split("/")[0];
        if (segment) return segment;
      }
    }
  }
  return null;
}

async function findPaymentRecordForWebhook(
  supabase: SupabaseClient,
  lookup: { captureId?: string | null; orderId?: string | null; transactionId?: string | null }
) {
  if (lookup.captureId) {
    const { data } = await supabase
      .from("payment_records")
      .select("*")
      .eq("paypal_capture_id", lookup.captureId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (lookup.orderId) {
    const { data } = await supabase
      .from("payment_records")
      .select("*")
      .eq("paypal_order_id", lookup.orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  if (lookup.transactionId) {
    const { data } = await supabase
      .from("payment_records")
      .select("*")
      .eq("transaction_id", lookup.transactionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data;
  }

  return null;
}

function getObjectRecord(val: unknown): Record<string, unknown> {
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val as Record<string, unknown>;
  }
  return {};
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let event: PayPalWebhookEvent;
    try {
      event = JSON.parse(rawBody) as PayPalWebhookEvent;
    } catch {
      return NextResponse.json({ error: "Invalid JSON webhook payload" }, { status: 400 });
    }

    const sigCheck = await verifyPayPalWebhookSignature({
      headers: req.headers,
      webhookEvent: event as unknown as Record<string, unknown>,
    });

    if (!sigCheck.verified) {
      return NextResponse.json(
        { error: sigCheck.reason || "Invalid PayPal webhook signature" },
        { status: 401 }
      );
    }

    const eventType = String(event.event_type || "");
    const resource = getObjectRecord(event.resource);
    const supabase = await resolveWebhookSupabase();

    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      const supplementary = getObjectRecord(resource.supplementary_data);
      const relatedIds = getObjectRecord(supplementary.related_ids);
      const captureId = typeof resource.id === "string" ? resource.id : null;
      const orderId = typeof relatedIds.order_id === "string" ? relatedIds.order_id : null;
      const customTxId =
        typeof resource.custom_id === "string" ? resource.custom_id : null;

      const record = await findPaymentRecordForWebhook(supabase, {
        captureId,
        orderId,
        transactionId: customTxId,
      });

      if (!record) {
        return NextResponse.json({
          received: true,
          handled: false,
          eventType,
          reason: "No matching PACT payment record found for capture webhook.",
        });
      }

      const transactionId = record.transaction_id as string;
      const prevRaw = getObjectRecord(record.raw_response);
      const amountObj = getObjectRecord(resource.amount);
      const capturedValue = Number(amountObj.value ?? record.amount);
      const currency = String(
        amountObj.currency_code ?? record.currency ?? "USD"
      ).toUpperCase();

      await supabase
        .from("payment_records")
        .update({
          paypal_capture_id: captureId || (record.paypal_capture_id as string | null),
          status: "COMPLETED",
          raw_response: {
            ...prevRaw,
            webhookCompleted: {
              webhookEventId: event.id ?? null,
              captureId,
              orderId,
              receivedAt: new Date().toISOString(),
              resource,
            },
          },
        })
        .eq("id", record.id);

      let milestoneTitle = "Milestone Disbursement";
      if (record.milestone_id) {
        const { data: updatedMilestone } = await supabase
          .from("payment_milestones")
          .update({ status: "paid" })
          .eq("id", record.milestone_id)
          .select("title")
          .maybeSingle();
        if (updatedMilestone?.title) {
          milestoneTitle = updatedMilestone.title as string;
        }
      }

      const { data: allMilestones } = await supabase
        .from("payment_milestones")
        .select("status")
        .eq("transaction_id", transactionId);

      const allPaid =
        Boolean(allMilestones?.length) &&
        allMilestones!.every((m) => m.status === "paid");

      if (allPaid) {
        await supabase
          .from("transactions")
          .update({ status: "completed" })
          .eq("id", transactionId);
      }

      await logTransactionEvent(
        transactionId,
        "paypal_webhook_captured",
        record.payer_id as string,
        {
          webhookEventId: event.id ?? null,
          eventType,
          verificationMode: sigCheck.verificationMode,
          captureId,
          orderId,
          milestoneId: record.milestone_id,
          milestoneTitle,
          amount: capturedValue,
          currency,
        },
        supabase
      );

      await broadcastWorkspaceStatusUpdate(
        {
          transactionId,
          eventType: "PAYMENT.CAPTURE.COMPLETED",
          milestoneId: record.milestone_id as string | null,
          paymentRecordId: record.id as string,
          status: "paid",
          summary: `PayPal Webhook: Payment capture completed (${currency} ${capturedValue.toFixed(
            2
          )}) for ${milestoneTitle}.`,
          metadata: { captureId, orderId, amount: capturedValue, currency },
        },
        supabase
      );

      return NextResponse.json({
        received: true,
        handled: true,
        eventType,
        transactionId,
        milestoneId: record.milestone_id,
        captureId,
        verificationMode: sigCheck.verificationMode,
      });
    }

    if (eventType === "PAYMENT.CAPTURE.REFUNDED") {
      const supplementary = getObjectRecord(resource.supplementary_data);
      const relatedIds = getObjectRecord(supplementary.related_ids);
      const refundId = typeof resource.id === "string" ? resource.id : null;
      const captureId =
        (typeof relatedIds.capture_id === "string" ? relatedIds.capture_id : null) ||
        extractCaptureIdFromLinks(resource);
      const customTxId =
        typeof resource.custom_id === "string" ? resource.custom_id : null;

      const record = await findPaymentRecordForWebhook(supabase, {
        captureId,
        transactionId: customTxId,
      });

      if (!record) {
        return NextResponse.json({
          received: true,
          handled: false,
          eventType,
          reason: "No matching PACT payment record found for refund webhook.",
        });
      }

      const transactionId = record.transaction_id as string;
      const prevRaw = getObjectRecord(record.raw_response);
      const amountObj = getObjectRecord(resource.amount);
      const refundedAmount = Number(amountObj.value ?? record.amount);
      const currency = String(
        amountObj.currency_code ?? record.currency ?? "USD"
      ).toUpperCase();
      const capturedTotal = Number(record.amount);
      const nextPaymentStatus =
        refundedAmount > 0 && refundedAmount < capturedTotal - 0.01
          ? "PARTIALLY_REFUNDED"
          : "REFUNDED";

      await supabase
        .from("payment_records")
        .update({
          status: nextPaymentStatus,
          raw_response: {
            ...prevRaw,
            webhookRefund: {
              webhookEventId: event.id ?? null,
              refundId,
              captureId,
              amountRefunded: refundedAmount,
              currency,
              receivedAt: new Date().toISOString(),
              resource,
            },
          },
        })
        .eq("id", record.id);

      if (record.milestone_id && nextPaymentStatus === "REFUNDED") {
        await supabase
          .from("payment_milestones")
          .update({ status: "refunded" })
          .eq("id", record.milestone_id);
      }

      await logTransactionEvent(
        transactionId,
        "paypal_webhook_refunded",
        record.payer_id as string,
        {
          webhookEventId: event.id ?? null,
          eventType,
          verificationMode: sigCheck.verificationMode,
          refundId,
          captureId,
          paymentStatus: nextPaymentStatus,
          amountRefunded: refundedAmount,
          currency,
        },
        supabase
      );

      await broadcastWorkspaceStatusUpdate(
        {
          transactionId,
          eventType: "PAYMENT.CAPTURE.REFUNDED",
          milestoneId: record.milestone_id as string | null,
          paymentRecordId: record.id as string,
          status: nextPaymentStatus,
          summary: `PayPal Webhook: Refund confirmed (${currency} ${refundedAmount.toFixed(
            2
          )}) — Status: ${nextPaymentStatus}.`,
          metadata: { refundId, captureId, amountRefunded: refundedAmount, currency },
        },
        supabase
      );

      return NextResponse.json({
        received: true,
        handled: true,
        eventType,
        transactionId,
        milestoneId: record.milestone_id,
        status: nextPaymentStatus,
        verificationMode: sigCheck.verificationMode,
      });
    }

    if (eventType === "CUSTOMER.DISPUTE.CREATED") {
      const disputeId =
        typeof resource.dispute_id === "string"
          ? resource.dispute_id
          : typeof resource.id === "string"
          ? resource.id
          : `DISPUTE-${Date.now()}`;
      const reason =
        typeof resource.reason === "string" ? resource.reason : "MERCHANDISE_OR_SERVICE_ISSUE";
      const disputeAmountObj = getObjectRecord(resource.dispute_amount);
      const disputeAmount = Number(disputeAmountObj.value || 0);
      const disputedTxList = Array.isArray(resource.disputed_transactions)
        ? (resource.disputed_transactions as Array<Record<string, unknown>>)
        : [];
      const firstDisputedTx = disputedTxList[0] || {};
      const captureId =
        (typeof firstDisputedTx.seller_transaction_id === "string"
          ? firstDisputedTx.seller_transaction_id
          : null) ||
        (typeof firstDisputedTx.buyer_transaction_id === "string"
          ? firstDisputedTx.buyer_transaction_id
          : null);
      const customTxId =
        typeof firstDisputedTx.custom === "string"
          ? firstDisputedTx.custom
          : typeof resource.custom_id === "string"
          ? resource.custom_id
          : null;

      const record = await findPaymentRecordForWebhook(supabase, {
        captureId,
        transactionId: customTxId,
      });

      if (!record) {
        return NextResponse.json({
          received: true,
          handled: false,
          eventType,
          reason: "No matching PACT payment record found for dispute webhook.",
        });
      }

      const transactionId = record.transaction_id as string;
      const prevRaw = getObjectRecord(record.raw_response);
      const currency = String(
        disputeAmountObj.currency_code ?? record.currency ?? "USD"
      ).toUpperCase();

      await supabase
        .from("payment_records")
        .update({
          status: "DISPUTED",
          raw_response: {
            ...prevRaw,
            webhookDispute: {
              webhookEventId: event.id ?? null,
              disputeId,
              reason,
              disputeState: resource.status ?? "OPEN",
              disputeAmount,
              currency,
              receivedAt: new Date().toISOString(),
              resource,
            },
          },
        })
        .eq("id", record.id);

      if (record.milestone_id) {
        await supabase
          .from("payment_milestones")
          .update({ status: "disputed" })
          .eq("id", record.milestone_id);
      }

      await supabase
        .from("transactions")
        .update({ status: "disputed" })
        .eq("id", transactionId);

      await logTransactionEvent(
        transactionId,
        "paypal_webhook_dispute",
        record.payer_id as string,
        {
          webhookEventId: event.id ?? null,
          eventType,
          verificationMode: sigCheck.verificationMode,
          disputeId,
          reason,
          captureId,
          milestoneId: record.milestone_id,
          disputeAmount,
          currency,
        },
        supabase
      );

      await broadcastWorkspaceStatusUpdate(
        {
          transactionId,
          eventType: "CUSTOMER.DISPUTE.CREATED",
          milestoneId: record.milestone_id as string | null,
          paymentRecordId: record.id as string,
          status: "disputed",
          summary: `PayPal Webhook Alert: Customer dispute ${disputeId} opened (${reason}). Milestone locked as disputed.`,
          metadata: { disputeId, reason, captureId, disputeAmount, currency },
        },
        supabase
      );

      return NextResponse.json({
        received: true,
        handled: true,
        eventType,
        transactionId,
        milestoneId: record.milestone_id,
        disputeId,
        status: "disputed",
        verificationMode: sigCheck.verificationMode,
      });
    }

    return NextResponse.json({
      received: true,
      handled: false,
      eventType,
      verificationMode: sigCheck.verificationMode,
    });
  } catch (err) {
    console.error("[webhooks/paypal] Error processing PayPal webhook:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to process PayPal webhook",
      },
      { status: 500 }
    );
  }
}

