/**
 * PACT PayPal Developer Sandbox Payment Service
 *
 * NON-NEGOTIABLE SAFETY CONSTRAINTS:
 * - Rule 11: Payment status must come from verified PayPal server-side events, not a frontend success message.
 * - Rule 12: Never claim that ordinary PayPal milestone payments are escrow. PACT coordinates conditional milestone disbursements.
 * - Rule 4: Never expose PAYPAL_CLIENT_SECRET in frontend code.
 */

import {
  CreatePayPalOrderParams,
  PayPalOrderResponse,
  PayPalCaptureResponse,
  VerifiedWebhookEvent,
} from "@/types/payment";

export interface IPayPalService {
  createMilestoneOrder(params: CreatePayPalOrderParams): Promise<PayPalOrderResponse>;
  captureMilestoneOrder(orderId: string): Promise<PayPalCaptureResponse>;
  verifyWebhookSignature(headers: Record<string, string>, body: string): Promise<VerifiedWebhookEvent | null>;
}

export class PayPalService implements IPayPalService {
  private readonly clientId: string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly webhookId: string | undefined;
  private readonly apiBase: string;

  /**
   * Required legal and technical clarity statement
   */
  public static readonly ESCROW_DISCLAIMER =
    "PACT coordinates staged milestone disbursements via PayPal. Standard PayPal milestone payments do not constitute a legal escrow account or escrow agency.";

  constructor() {
    this.clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    this.webhookId = process.env.PAYPAL_WEBHOOK_ID;
    this.apiBase = process.env.PAYPAL_API_BASE_URL || "https://api-m.sandbox.paypal.com";
  }

  isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  /**
   * Retrieves an OAuth2 bearer token from PayPal Sandbox
   */
  private async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error("PayPal Sandbox credentials not configured. Please set NEXT_PUBLIC_PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.");
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const response = await fetch(`${this.apiBase}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      throw new Error(`PayPal auth failed with status ${response.status}`);
    }

    const data = await response.json();
    return data.access_token;
  }

  async createMilestoneOrder(_params: CreatePayPalOrderParams): Promise<PayPalOrderResponse> {
    if (!this.isConfigured()) {
      throw new Error("PayPal credentials not configured.");
    }
    // Sandbox order creation executed server-side in Phase 3
    throw new Error("createMilestoneOrder to be connected in Phase 3.");
  }

  async captureMilestoneOrder(_orderId: string): Promise<PayPalCaptureResponse> {
    if (!this.isConfigured()) {
      throw new Error("PayPal credentials not configured.");
    }
    // Server-side order capture executed in Phase 3
    throw new Error("captureMilestoneOrder to be connected in Phase 3.");
  }

  async verifyWebhookSignature(
    _headers: Record<string, string>,
    _body: string
  ): Promise<VerifiedWebhookEvent | null> {
    if (!this.isConfigured() || !this.webhookId) {
      return null;
    }
    // Strict server-side webhook signature verification
    return null;
  }
}

export const paypalService = new PayPalService();
