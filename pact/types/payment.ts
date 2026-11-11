/**
 * Payment and PayPal Sandbox Domain Types
 * Phase 5: PayPal Milestone Payment Integration
 *
 * NON-NEGOTIABLE RULES ENFORCED:
 * - Rule 11: Payment status must come from verified PayPal server-side events.
 * - Rule 12: Ordinary PayPal milestone payments do not constitute escrow.
 */

export type MilestoneStatus =
  | "pending"
  | "processing"
  | "paid"
  | "refunded"
  | "disputed";

export interface PaymentMilestone {
  id: string;
  transactionId: string;
  agreementVersionId: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  sequenceOrder: number;
  status: MilestoneStatus;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  latestPaymentRecord?: PaymentRecord | null;
}

export interface PaymentRecord {
  id: string;
  milestoneId: string;
  transactionId: string;
  payerId: string;
  paypalOrderId: string;
  paypalCaptureId: string | null;
  amount: number;
  currency: string;
  status: string;
  rawResponse: Record<string, unknown>;
  createdAt: string;
}

export interface PayPalOrderPayload {
  orderId: string;
  milestoneId: string;
  transactionId: string;
  amount: number;
  currency: string;
  status: string;
  isSimulated: boolean;
}

export interface PayPalCapturePayload {
  orderId: string;
  captureId: string;
  milestoneId: string;
  status: string;
  amount: number;
  currency: string;
  isSimulated: boolean;
}

export interface FinancialSummary {
  totalAgreementAmount: number;
  paidToDate: number;
  remainingBalance: number;
  currency: string;
  paidCount: number;
  totalMilestones: number;
  activeAgreementVersionNumber: number | null;
}

// Existing Service Compatibility Interfaces
export interface CreatePayPalOrderParams {
  transactionId: string;
  milestoneId: string;
  amount: number;
  currency: string;
  description: string;
  sellerPaypalEmail?: string;
}

export interface PayPalOrderResponse {
  orderId: string;
  status:
    | "CREATED"
    | "SAVED"
    | "APPROVED"
    | "VOIDED"
    | "COMPLETED"
    | "PAYER_ACTION_REQUIRED";
  approvalUrl?: string;
}

export interface PayPalCaptureResponse {
  captureId: string;
  status:
    | "COMPLETED"
    | "DECLINED"
    | "PARTIALLY_REFUNDED"
    | "PENDING"
    | "REFUNDED"
    | "FAILED";
  orderId: string;
  amount: {
    currencyCode: string;
    value: string;
  };
  sellerProtectionStatus?: string;
  finalCapture: boolean;
}

export interface VerifiedWebhookEvent {
  id: string;
  eventType: string;
  resourceType: string;
  summary: string;
  verifiedAt: string;
  rawPayload: Record<string, unknown>;
}
