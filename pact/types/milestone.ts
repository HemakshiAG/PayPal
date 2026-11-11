/**
 * Milestone and Payment Coordination Domain Types
 * Enforces Non-Negotiable Rules:
 * - Rule 11: Payment status must come from verified PayPal server-side events, not frontend success messages.
 * - Rule 12: Never claim that ordinary PayPal milestone payments are escrow. PACT coordinates milestone disbursements.
 */

export type MilestoneLifecycleStatus =
  | "pending_funding"    // Awaiting buyer funding milestone via PayPal
  | "funded"             // PayPal capture/order confirmed by server webhook
  | "in_progress"        // Seller actively working on deliverable
  | "submitted"          // Seller submitted deliverables/evidence
  | "approved"           // Buyer approved completed deliverable
  | "released"           // Milestone payment disbursed to seller
  | "disputed";          // Either party initiated complication resolution

export interface Milestone {
  id: string;
  transactionId: string;
  agreementVersionId: string;
  orderIndex: number;
  title: string;
  description: string;
  amount: number;
  currency: string;
  status: MilestoneLifecycleStatus;

  /** PayPal Integration Data (server-verified) */
  paypalOrderId?: string;
  paypalCaptureId?: string;
  paypalTransactionId?: string;
  fundedAt?: string;
  releasedAt?: string;

  /** Deliverable evidence link */
  evidenceIds: string[];

  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

