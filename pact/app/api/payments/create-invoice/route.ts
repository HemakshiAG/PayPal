import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createInvoiceSchema } from "@/validations/payment";
import {
  createAndSendPayPalInvoice,
  type PayPalInvoiceLineItem,
} from "@/lib/paypal/client";
import { resolveTransactionParticipantContact } from "@/lib/paypal/participants";
import { logTransactionEvent } from "@/lib/ledger/events";
import { broadcastWorkspaceStatusUpdate } from "@/lib/realtime/broadcast";

export async function POST(req: NextRequest) {
  try {
    const rawBody = (await req.json()) as Record<string, unknown>;
    const normalized = {
      transactionId: rawBody.transactionId ?? rawBody.transaction_id,
      agreementVersionId:
        rawBody.agreementVersionId ?? rawBody.agreement_version_id,
    };

    const validated = createInvoiceSchema.safeParse(normalized);
    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues?.[0]?.message || "Invalid invoice request" },
        { status: 400 }
      );
    }

    const { transactionId, agreementVersionId } = validated.data;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify participant / creator authorization
    const [{ data: participant }, { data: tx, error: txError }] = await Promise.all([
      supabase
        .from("transaction_participants")
        .select("role")
        .eq("transaction_id", transactionId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("transactions")
        .select("id, creator_id, title, description, category, total_amount, currency")
        .eq("id", transactionId)
        .maybeSingle(),
    ]);

    if (txError || !tx || (!participant && tx.creator_id !== user.id)) {
      return NextResponse.json(
        { error: "Forbidden: Not an authorized transaction participant" },
        { status: 403 }
      );
    }

    const [{ data: agreements }, { data: confirmedTerms }, { data: milestones }] =
      await Promise.all([
        supabase
          .from("agreement_versions")
          .select(
            "id, version_number, content_hash, title, sections, status, is_mutually_approved"
          )
          .eq("transaction_id", transactionId)
          .order("version_number", { ascending: false }),
        supabase
          .from("extracted_terms")
          .select("term_key, term_value, category")
          .eq("transaction_id", transactionId)
          .eq("status", "confirmed"),
        supabase
          .from("payment_milestones")
          .select("title, description, amount")
          .eq("transaction_id", transactionId)
          .order("sequence_order", { ascending: true }),
      ]);

    const targetAgreement =
      (agreementVersionId
        ? (agreements || []).find((a) => a.id === agreementVersionId)
        : undefined) ||
      (agreements || []).find((a) => a.is_mutually_approved || a.status === "active") ||
      (agreements || [])[0];

    if (!targetAgreement) {
      return NextResponse.json(
        { error: "No compiled agreement version found to invoice." },
        { status: 400 }
      );
    }

    const { data: approvals } = await supabase
      .from("agreement_approvals")
      .select("role")
      .eq("agreement_version_id", targetAgreement.id);

    const hasBuyerApproval = Boolean(approvals?.some((a) => a.role === "buyer"));
    const hasSellerApproval = Boolean(approvals?.some((a) => a.role === "seller"));
    const isLocked =
      Boolean(targetAgreement.is_mutually_approved) ||
      targetAgreement.status === "active" ||
      (hasBuyerApproval && hasSellerApproval);

    if (!isLocked) {
      return NextResponse.json(
        {
          error:
            "Agreement must be mutually signed and SHA-256 locked before generating an official PayPal Invoice.",
        },
        { status: 400 }
      );
    }

    const [buyerContact, sellerContact] = await Promise.all([
      resolveTransactionParticipantContact({
        supabase,
        transactionId,
        role: "buyer",
        fallbackEmail: user.email || "buyer@pact.demo",
      }),
      resolveTransactionParticipantContact({
        supabase,
        transactionId,
        role: "seller",
        fallbackEmail: "seller@pact.demo",
      }),
    ]);

    const totalAmount = Number(tx.total_amount || 0);
    const currency = ((tx.currency as string | null) || "USD").toUpperCase();

    const termsSummary = (confirmedTerms || [])
      .slice(0, 6)
      .map((t) => `${t.term_key}: ${t.term_value}`)
      .join(" | ");

    let lineItems: PayPalInvoiceLineItem[] = [];
    if (milestones && milestones.length > 0) {
      lineItems = milestones.map((m) => ({
        name: String(m.title || tx.title),
        description: String(m.description || termsSummary || tx.description || ""),
        quantity: 1,
        unitAmount: Number(m.amount || 0),
      }));
    } else {
      lineItems = [
        {
          name: String(tx.title || "PACT Locked Commercial Order"),
          description: termsSummary || String(tx.description || "Locked agreement deliverables"),
          quantity: 1,
          unitAmount: totalAmount > 0 ? totalAmount : 100,
        },
      ];
    }

    const invoiceNote = [
      `Official PACT Invoice generated from SHA-256 Locked Agreement v${targetAgreement.version_number}.0`,
      `Fingerprint: ${String(targetAgreement.content_hash).slice(0, 32)}...`,
      termsSummary ? `Contract Specs: ${termsSummary}` : "",
    ]
      .filter(Boolean)
      .join(" — ");

    const invoiceResult = await createAndSendPayPalInvoice({
      transactionId,
      agreementVersionNumber: Number(targetAgreement.version_number),
      agreementHash: String(targetAgreement.content_hash),
      title: String(tx.title),
      currency,
      invoicerName: sellerContact.name,
      recipientName: buyerContact.name,
      recipientEmail: buyerContact.email,
      items: lineItems,
      note: invoiceNote,
    });

    const ledgerEvent = await logTransactionEvent(
      transactionId,
      "paypal_invoice_created",
      user.id,
      {
        invoiceId: invoiceResult.invoiceId,
        invoiceNumber: invoiceResult.invoiceNumber,
        status: invoiceResult.status,
        amount: invoiceResult.amount,
        currency: invoiceResult.currency,
        recipientViewUrl: invoiceResult.recipientViewUrl,
        agreementVersionId: targetAgreement.id,
        agreementVersionNumber: targetAgreement.version_number,
        agreementHash: targetAgreement.content_hash,
        isSimulated: invoiceResult.isSimulated,
        lineItemCount: lineItems.length,
      },
      supabase
    );

    await broadcastWorkspaceStatusUpdate(
      {
        transactionId,
        eventType: "paypal_invoice_created",
        status: invoiceResult.status,
        summary: `Official PayPal Invoice ${invoiceResult.invoiceNumber} (${invoiceResult.currency} ${invoiceResult.amount.toFixed(
          2
        )}) generated from Locked Agreement v${targetAgreement.version_number}.0.`,
        metadata: {
          invoiceId: invoiceResult.invoiceId,
          invoiceNumber: invoiceResult.invoiceNumber,
          recipientViewUrl: invoiceResult.recipientViewUrl,
        },
      },
      supabase
    );

    return NextResponse.json({
      success: true,
      invoice: {
        invoiceId: invoiceResult.invoiceId,
        invoiceNumber: invoiceResult.invoiceNumber,
        status: invoiceResult.status,
        recipientViewUrl: invoiceResult.recipientViewUrl,
        amount: invoiceResult.amount,
        currency: invoiceResult.currency,
        isSimulated: invoiceResult.isSimulated,
        simulationNotice: invoiceResult.simulationNotice,
        ledgerEventId: ledgerEvent?.id ?? null,
      },
    });
  } catch (err) {
    console.error("[create-invoice] Error generating PayPal invoice:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Internal server error creating PayPal invoice",
      },
      { status: 500 }
    );
  }
}

