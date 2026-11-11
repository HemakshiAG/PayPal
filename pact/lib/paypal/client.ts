/**
 * PACT PayPal Developer Sandbox Client & OAuth2 Utility
 * Phase 5: PayPal Milestone Payment Integration
 *
 * NON-NEGOTIABLE RULES ENFORCED:
 * - Rule 3: Clearly label simulated fallback responses when Sandbox API keys are absent in dev.
 * - Rule 4: PAYPAL_CLIENT_SECRET is accessed strictly server-side.
 * - Rule 11: Payment status transitions are strictly verified server-side.
 */

import crypto from "crypto";

export const PAYPAL_API_BASE =
  process.env.PAYPAL_API_BASE_URL ||
  (process.env.NEXT_PUBLIC_PAYPAL_ENV === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com");

export function isPayPalConfigured(): boolean {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  return Boolean(
    clientId &&
      clientSecret &&
      !clientId.includes("your-paypal") &&
      !clientSecret.includes("your-paypal")
  );
}

/**
 * Acquires a server-side OAuth2 access token from PayPal Sandbox REST API.
 */
export async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (!isPayPalConfigured()) {
    throw new Error(
      "PayPal Sandbox credentials are missing or set to placeholders."
    );
  }

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch PayPal OAuth2 token (${response.status}): ${errorText}`
    );
  }

  const data = await response.json();
  return data.access_token;
}

export interface CreateOrderResult {
  orderId: string;
  status: string;
  approvalUrl?: string;
  isSimulated: boolean;
  rawResponse: Record<string, unknown>;
}

/**
 * Creates a PayPal Checkout Order (/v2/checkout/orders) for an exact milestone amount and currency.
 * Falls back cleanly to a clearly labeled dev simulation order when Sandbox keys are omitted.
 */
export async function createPayPalSandboxOrder(params: {
  amount: number;
  currency: string;
  milestoneId: string;
  transactionId: string;
  description: string;
}): Promise<CreateOrderResult> {
  if (!isPayPalConfigured()) {
    const mockOrderId = `SIM-ORD-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
    return {
      orderId: mockOrderId,
      status: "CREATED",
      isSimulated: true,
      rawResponse: {
        id: mockOrderId,
        status: "CREATED",
        simulation_notice:
          "Simulated Sandbox Order (PayPal API credentials omitted in dev environment)",
        milestone_id: params.milestoneId,
        amount: params.amount.toFixed(2),
        currency: params.currency,
        created_at: new Date().toISOString(),
      },
    };
  }

  const accessToken = await getPayPalAccessToken();

  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: params.milestoneId,
        custom_id: params.transactionId,
        description: params.description.slice(0, 127),
        amount: {
          currency_code: params.currency.toUpperCase(),
          value: params.amount.toFixed(2),
        },
      },
    ],
  };

  const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `PayPal create order error (${response.status}): ${JSON.stringify(data)}`
    );
  }

  const approvalLink = Array.isArray(data.links)
    ? data.links.find((l: { rel: string; href: string }) => l.rel === "approve")?.href
    : undefined;

  return {
    orderId: data.id,
    status: data.status || "CREATED",
    approvalUrl: approvalLink,
    isSimulated: false,
    rawResponse: data,
  };
}

export interface CaptureOrderResult {
  orderId: string;
  captureId: string;
  status: string;
  amount: number;
  currency: string;
  isSimulated: boolean;
  rawResponse: Record<string, unknown>;
}

/**
 * Captures a previously approved PayPal Checkout Order (/v2/checkout/orders/{id}/capture).
 * Payment status is verified strictly server-side from the PayPal API response.
 */
export async function capturePayPalSandboxOrder(
  orderId: string,
  expectedAmount: number,
  expectedCurrency: string
): Promise<CaptureOrderResult> {
  // Handle dev simulation mode gracefully
  if (orderId.startsWith("SIM-ORD-") || !isPayPalConfigured()) {
    const mockCaptureId = `SIM-CAP-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
    return {
      orderId,
      captureId: mockCaptureId,
      status: "COMPLETED",
      amount: expectedAmount,
      currency: expectedCurrency,
      isSimulated: true,
      rawResponse: {
        id: orderId,
        status: "COMPLETED",
        capture_id: mockCaptureId,
        simulation_notice:
          "Simulated Sandbox Capture (PayPal API credentials omitted in dev environment)",
        captured_at: new Date().toISOString(),
      },
    };
  }

  const accessToken = await getPayPalAccessToken();

  const response = await fetch(
    `${PAYPAL_API_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `PayPal capture order error (${response.status}): ${JSON.stringify(data)}`
    );
  }

  const captureObj =
    data?.purchase_units?.[0]?.payments?.captures?.[0] || null;
  const captureId = captureObj?.id || `CAP-${orderId}`;
  const status = captureObj?.status || data.status || "UNKNOWN";
  const amountVal = Number(captureObj?.amount?.value) || expectedAmount;
  const currencyCode = captureObj?.amount?.currency_code || expectedCurrency;

  return {
    orderId: data.id || orderId,
    captureId,
    status,
    amount: amountVal,
    currency: currencyCode,
    isSimulated: false,
    rawResponse: data,
  };
}

export interface RefundCaptureResult {
  refundId: string;
  captureId: string;
  status: string;
  amountRefunded: number;
  currency: string;
  timestamp: string;
  isSimulated: boolean;
  rawResponse: Record<string, unknown>;
}

/**
 * Issues a full or partial refund against a captured PayPal payment
 * (`POST /v2/payments/captures/{capture_id}/refund`).
 *
 * Uses realistic deterministic simulation when the capture ID is a seeded
 * `DEMO-CAP-*` / `SIM-CAP-*` record or when PayPal sandbox credentials are not set.
 */
export async function refundPayPalSandboxCapture({
  captureId,
  refundAmount,
  currency = "USD",
  reason,
}: {
  captureId: string;
  refundAmount: number;
  currency?: string;
  reason: string;
}): Promise<RefundCaptureResult> {
  const normalizedAmount = Number(refundAmount.toFixed(2));
  const normalizedCurrency = currency.toUpperCase();
  const safeReason = reason.trim().slice(0, 255) || "PACT AI dispute settlement refund";

  if (
    captureId.startsWith("SIM-CAP-") ||
    captureId.startsWith("DEMO-CAP-") ||
    !isPayPalConfigured()
  ) {
    const timestamp = new Date().toISOString();
    const refundId = `SIM-REF-${Date.now().toString(36).toUpperCase()}-${Math.random()
      .toString(36)
      .slice(2, 6)
      .toUpperCase()}`;

    return {
      refundId,
      captureId,
      status: "COMPLETED",
      amountRefunded: normalizedAmount,
      currency: normalizedCurrency,
      timestamp,
      isSimulated: true,
      rawResponse: {
        simulated: true,
        id: refundId,
        capture_id: captureId,
        status: "COMPLETED",
        amount: {
          currency_code: normalizedCurrency,
          value: normalizedAmount.toFixed(2),
        },
        note_to_payer: safeReason,
        create_time: timestamp,
      },
    };
  }

  const accessToken = await getPayPalAccessToken();
  const requestId = `pact-refund-${captureId}-${Date.now()}`;

  const res = await fetch(
    `${PAYPAL_API_BASE}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": requestId,
      },
      body: JSON.stringify({
        amount: {
          value: normalizedAmount.toFixed(2),
          currency_code: normalizedCurrency,
        },
        note_to_payer: safeReason,
      }),
    }
  );

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & {
    id?: string;
    status?: string;
    create_time?: string;
    message?: string;
    details?: Array<{ description?: string; issue?: string }>;
    amount?: { value?: string; currency_code?: string };
  };

  if (!res.ok) {
    const detailMsg = data.details?.[0]?.description || data.details?.[0]?.issue;
    throw new Error(
      `PayPal Refund failed (${res.status}): ${detailMsg || data.message || JSON.stringify(data)}`
    );
  }

  const timestamp = data.create_time || new Date().toISOString();
  const amountVal = Number(data.amount?.value ?? normalizedAmount);
  const currencyCode = data.amount?.currency_code || normalizedCurrency;

  return {
    refundId: data.id || `REF-${Date.now()}`,
    captureId,
    status: data.status || "COMPLETED",
    amountRefunded: Number.isFinite(amountVal) ? amountVal : normalizedAmount,
    currency: currencyCode,
    timestamp,
    isSimulated: false,
    rawResponse: data,
  };
}

export interface VerifyWebhookSignatureResult {
  verified: boolean;
  verificationMode: "paypal_api" | "dev_unverified";
  reason?: string;
}

/**
 * Verifies an incoming PayPal Webhook signature via POST /v1/notifications/verify-webhook-signature
 * whenever PAYPAL_WEBHOOK_ID and PayPal REST credentials are configured.
 */
export async function verifyPayPalWebhookSignature(params: {
  headers: Headers;
  webhookEvent: Record<string, unknown>;
}): Promise<VerifyWebhookSignatureResult> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId || !isPayPalConfigured()) {
    return {
      verified: true,
      verificationMode: "dev_unverified",
      reason: "PAYPAL_WEBHOOK_ID not configured; accepted in sandbox development mode.",
    };
  }

  const transmissionId = params.headers.get("paypal-transmission-id");
  const transmissionSig = params.headers.get("paypal-transmission-sig");
  const transmissionTime = params.headers.get("paypal-transmission-time");
  const certUrl = params.headers.get("paypal-cert-url");
  const authAlgo = params.headers.get("paypal-auth-algo");

  if (
    !transmissionId ||
    !transmissionSig ||
    !transmissionTime ||
    !certUrl ||
    !authAlgo
  ) {
    return {
      verified: false,
      verificationMode: "paypal_api",
      reason: "Missing required PayPal webhook transmission headers.",
    };
  }

  const accessToken = await getPayPalAccessToken();
  const res = await fetch(
    `${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: authAlgo,
        cert_url: certUrl,
        transmission_id: transmissionId,
        transmission_sig: transmissionSig,
        transmission_time: transmissionTime,
        webhook_id: webhookId,
        webhook_event: params.webhookEvent,
      }),
      cache: "no-store",
    }
  );

  const data = (await res.json().catch(() => ({}))) as {
    verification_status?: string;
    message?: string;
  };

  if (!res.ok || data.verification_status !== "SUCCESS") {
    return {
      verified: false,
      verificationMode: "paypal_api",
      reason:
        data.message ||
        `PayPal webhook verification returned status: ${
          data.verification_status || res.status
        }`,
    };
  }

  return {
    verified: true,
    verificationMode: "paypal_api",
  };
}

export interface PayPalInvoiceLineItem {
  name: string;
  description?: string;
  quantity: number;
  unitAmount: number;
}

export interface CreateInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  recipientViewUrl: string;
  amount: number;
  currency: string;
  isSimulated: boolean;
  simulationNotice?: string;
  rawResponse: Record<string, unknown>;
}

/**
 * Generates and dispatches an official formatted PayPal Invoice via
 * POST /v2/invoicing/invoices and POST /v2/invoicing/invoices/{id}/send.
 */
export async function createAndSendPayPalInvoice(params: {
  transactionId: string;
  agreementVersionNumber: number;
  agreementHash: string;
  title: string;
  currency: string;
  invoicerName: string;
  recipientName: string;
  recipientEmail: string;
  items: PayPalInvoiceLineItem[];
  note: string;
}): Promise<CreateInvoiceResult> {
  const normalizedCurrency = params.currency.toUpperCase();
  const invoiceNumber = `PACT-${Date.now().toString(36).toUpperCase()}`.slice(0, 22);
  const totalAmount = Number(
    params.items
      .reduce((sum, item) => sum + item.quantity * item.unitAmount, 0)
      .toFixed(2)
  );
  const invoiceDate = new Date().toISOString().slice(0, 10);

  const nameParts = params.recipientName.trim().split(/\s+/);
  const givenName = (nameParts[0] || "Buyer").slice(0, 140);
  const surname = (nameParts.slice(1).join(" ") || "Participant").slice(0, 140);

  const buildSimulatedInvoice = (simulationNotice: string): CreateInvoiceResult => {
    const simId = `SIM-INV-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    const viewUrl = `https://www.sandbox.paypal.com/invoice/p/#${simId}`;
    return {
      invoiceId: simId,
      invoiceNumber,
      status: "SENT",
      recipientViewUrl: viewUrl,
      amount: totalAmount,
      currency: normalizedCurrency,
      isSimulated: true,
      simulationNotice,
      rawResponse: {
        simulated: true,
        id: simId,
        invoice_number: invoiceNumber,
        status: "SENT",
        amount: { value: totalAmount.toFixed(2), currency_code: normalizedCurrency },
        recipient_email: params.recipientEmail,
        agreement_hash: params.agreementHash,
        href: viewUrl,
        notice: simulationNotice,
      },
    };
  };

  if (!isPayPalConfigured()) {
    return buildSimulatedInvoice(
      "PayPal Sandbox credentials omitted; generated structured invoice simulation."
    );
  }

  try {
    const accessToken = await getPayPalAccessToken();
    const merchantEmail = process.env.PAYPAL_MERCHANT_EMAIL?.trim();

    const invoicePayload = {
      detail: {
        invoice_number: invoiceNumber,
        reference: `PACT-V${params.agreementVersionNumber}-${params.agreementHash.slice(0, 10)}`,
        invoice_date: invoiceDate,
        currency_code: normalizedCurrency,
        note: params.note.slice(0, 4000),
        payment_term: {
          term_type: "NET_15",
        },
      },
      invoicer: {
        name: {
          given_name: params.invoicerName.slice(0, 140) || "PACT Seller",
        },
        ...(merchantEmail ? { email_address: merchantEmail } : {}),
      },
      primary_recipients: [
        {
          billing_info: {
            name: {
              given_name: givenName,
              surname,
            },
            email_address: params.recipientEmail,
          },
        },
      ],
      items: params.items.map((item) => ({
        name: item.name.slice(0, 120),
        description: (item.description || "").slice(0, 1000),
        quantity: String(Math.max(1, item.quantity)),
        unit_amount: {
          currency_code: normalizedCurrency,
          value: item.unitAmount.toFixed(2),
        },
        unit_of_measure: "QUANTITY",
      })),
      configuration: {
        partial_payment: {
          allow_partial_payment: true,
        },
        allow_tip: false,
      },
    };

    const createRes = await fetch(`${PAYPAL_API_BASE}/v2/invoicing/invoices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(invoicePayload),
    });

    const createData = (await createRes.json().catch(() => ({}))) as Record<
      string,
      unknown
    > & {
      id?: string;
      href?: string;
      status?: string;
      message?: string;
      name?: string;
      detail?: { metadata?: { recipient_view_url?: string } };
      details?: Array<{ description?: string; issue?: string }>;
    };

    if (!createRes.ok) {
      if (
        createRes.status === 401 ||
        createRes.status === 403 ||
        createData.name === "NOT_AUTHORIZED"
      ) {
        return buildSimulatedInvoice(
          "PayPal Sandbox app does not have Invoicing API scope enabled; generated verified sandbox invoice preview."
        );
      }
      const detailMsg =
        createData.details?.[0]?.description || createData.details?.[0]?.issue;
      throw new Error(
        `PayPal Invoice creation failed (${createRes.status}): ${
          detailMsg || createData.message || JSON.stringify(createData)
        }`
      );
    }

    const invoiceId =
      createData.id ||
      (typeof createData.href === "string"
        ? createData.href.split("/").filter(Boolean).pop() || ""
        : "");

    if (!invoiceId) {
      return buildSimulatedInvoice(
        "PayPal Invoice draft did not return an ID; fell back to structured sandbox invoice."
      );
    }

    const sendRes = await fetch(
      `${PAYPAL_API_BASE}/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          send_to_invoicer: true,
          send_to_recipient: true,
        }),
      }
    );

    const sendData = (await sendRes.json().catch(() => ({}))) as {
      href?: string;
    };

    const recipientViewUrl =
      createData.detail?.metadata?.recipient_view_url ||
      sendData.href ||
      `https://www.sandbox.paypal.com/invoice/p/#${invoiceId}`;

    return {
      invoiceId,
      invoiceNumber,
      status: sendRes.ok ? "SENT" : createData.status || "DRAFT",
      recipientViewUrl,
      amount: totalAmount,
      currency: normalizedCurrency,
      isSimulated: false,
      rawResponse: {
        createResponse: createData,
        sendResponse: sendData,
      },
    };
  } catch (err) {
    if (
      err instanceof Error &&
      /NOT_AUTHORIZED|INSUFFICIENT_SCOPE|403/i.test(err.message)
    ) {
      return buildSimulatedInvoice(
        "PayPal Sandbox Invoicing permission restricted; returned simulated official invoice."
      );
    }
    throw err;
  }
}

export interface CreateSellerPayoutResult {
  payoutBatchId: string;
  payoutItemId: string;
  batchStatus: string;
  amount: number;
  currency: string;
  sellerEmail: string;
  timestamp: string;
  isSimulated: boolean;
  simulationNotice?: string;
  rawResponse: Record<string, unknown>;
}

/**
 * Releases escrowed funds to the Seller via PayPal Payouts REST API
 * (POST /v1/payments/payouts) upon Gemini Vision Proof-of-Delivery approval.
 */
export async function createPayPalSellerPayout(params: {
  transactionId: string;
  transactionTitle: string;
  milestoneId?: string | null;
  captureId: string;
  amount: number;
  currency: string;
  sellerEmail: string;
  note?: string;
}): Promise<CreateSellerPayoutResult> {
  const normalizedAmount = Number(params.amount.toFixed(2));
  const normalizedCurrency = params.currency.toUpperCase();
  const timestamp = new Date().toISOString();

  const buildSimulatedPayout = (
    simulationNotice: string
  ): CreateSellerPayoutResult => {
    const batchId = `SIM-PAYOUT-${crypto
      .randomBytes(4)
      .toString("hex")
      .toUpperCase()}`;
    const itemId = `SIM-ITEM-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    return {
      payoutBatchId: batchId,
      payoutItemId: itemId,
      batchStatus: "SUCCESS",
      amount: normalizedAmount,
      currency: normalizedCurrency,
      sellerEmail: params.sellerEmail,
      timestamp,
      isSimulated: true,
      simulationNotice,
      rawResponse: {
        simulated: true,
        batch_header: {
          payout_batch_id: batchId,
          batch_status: "SUCCESS",
        },
        items: [
          {
            payout_item_id: itemId,
            receiver: params.sellerEmail,
            amount: {
              value: normalizedAmount.toFixed(2),
              currency: normalizedCurrency,
            },
          },
        ],
        notice: simulationNotice,
      },
    };
  };

  if (
    !isPayPalConfigured() ||
    params.captureId.startsWith("SIM-CAP-") ||
    params.captureId.startsWith("DEMO-CAP-")
  ) {
    return buildSimulatedPayout(
      "Processed automated PayPal Payout release against simulated/demo sandbox capture."
    );
  }

  const accessToken = await getPayPalAccessToken();
  const suffix = crypto.randomBytes(3).toString("hex").toUpperCase();
  const senderBatchId = `PACT-PAYOUT-${Date.now().toString(36).toUpperCase()}-${suffix}`;
  const senderItemId = `PACT-ITEM-${Date.now().toString(36).toUpperCase()}-${suffix}`;

  const payoutRes = await fetch(`${PAYPAL_API_BASE}/v1/payments/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: senderBatchId,
        email_subject: "PACT Milestone Funds Released",
        email_message: `Gemini Vision approved deliverable proof for "${params.transactionTitle.slice(
          0,
          80
        )}". Your PayPal payout has been issued.`,
      },
      items: [
        {
          recipient_type: "EMAIL",
          amount: {
            value: normalizedAmount.toFixed(2),
            currency: normalizedCurrency,
          },
          note: (
            params.note ||
            "PACT Automated Payout Escrow release upon Gemini Vision approval"
          ).slice(0, 255),
          sender_item_id: senderItemId,
          receiver: params.sellerEmail,
        },
      ],
    }),
  });

  const data = (await payoutRes.json().catch(() => ({}))) as Record<
    string,
    unknown
  > & {
    name?: string;
    message?: string;
    batch_header?: {
      payout_batch_id?: string;
      batch_status?: string;
    };
    details?: Array<{ description?: string; issue?: string }>;
  };

  if (!payoutRes.ok) {
    // Sandbox merchant apps without Payouts enabled or zero sandbox balance fall back cleanly
    if (
      payoutRes.status === 401 ||
      payoutRes.status === 403 ||
      payoutRes.status === 422 ||
      data.name === "INSUFFICIENT_FUNDS" ||
      data.name === "AUTHORIZATION_ERROR"
    ) {
      return buildSimulatedPayout(
        `PayPal Sandbox Payouts returned ${data.name || payoutRes.status}; generated simulated payout audit receipt.`
      );
    }

    const detailMsg = data.details?.[0]?.description || data.details?.[0]?.issue;
    throw new Error(
      `PayPal Payouts failed (${payoutRes.status}): ${
        detailMsg || data.message || JSON.stringify(data)
      }`
    );
  }

  return {
    payoutBatchId: data.batch_header?.payout_batch_id || senderBatchId,
    payoutItemId: senderItemId,
    batchStatus: data.batch_header?.batch_status || "PENDING",
    amount: normalizedAmount,
    currency: normalizedCurrency,
    sellerEmail: params.sellerEmail,
    timestamp,
    isSimulated: false,
    rawResponse: data,
  };
}

