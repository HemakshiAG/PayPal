/**
 * PACT Evidence Vault, Hash-Chained Ledger & Drift Detection Types
 * Phase 6: Tamper-Evident Evidence Vault, Drift Detection & Dispute Intelligence
 */

export type TransactionEventType =
  | "term_confirmed"
  | "term_rejected"
  | "scenario_resolved"
  | "agreement_compiled"
  | "agreement_approved"
  | "agreement_locked"
  | "passkey_verified"
  | "proof_verified"
  | "proof_rejected"
  | "payment_captured"
  | "dispute_resolved"
  | "paypal_invoice_created"
  | "paypal_payout_released"
  | "paypal_webhook_captured"
  | "paypal_webhook_refunded"
  | "paypal_webhook_dispute"
  | "drift_detected"
  | "drift_amended"
  | "drift_dismissed";

export interface TransactionEvent {
  id: string;
  transactionId: string;
  eventType: TransactionEventType | string;
  actorId: string;
  actorName?: string | null;
  actorRole?: "buyer" | "seller" | "system" | "observer";
  timestamp: string;
  eventPayload: Record<string, unknown>;
  previousEventHash: string;
  eventHash: string;
}

export interface LedgerIntegrityReport {
  is_valid: boolean;
  total_events: number;
  tampered_event_id: string | null;
  checked_at: string;
  genesis_hash: string;
  latest_event_hash: string | null;
}

export type DriftAlertStatus = "open" | "amended" | "dismissed";

export interface DriftAlert {
  id: string;
  transactionId: string;
  activeVersionId: string;
  activeVersionNumber?: number | null;
  sourceMessageId: string | null;
  termKey: string;
  originalValue: string;
  proposedValue: string;
  confidenceScore: number;
  status: DriftAlertStatus;
  createdAt: string;
}

export interface ProofOfAgreementPackage {
  exportedAt: string;
  pactPlatformVersion: string;
  transaction: {
    id: string;
    title: string;
    category: string | null;
    status: string;
    totalAmount: number;
    currency: string;
    createdAt: string;
  };
  participants: {
    buyer: { id: string; name: string } | null;
    seller: { id: string; name: string } | null;
  };
  activeAgreementVersion: {
    id: string;
    versionNumber: number;
    contentHash: string;
    status: string;
    createdAt: string;
    sectionsCount: number;
    approvals: Array<{
      role: "buyer" | "seller";
      userId: string;
      contentHash: string;
      approvedAt: string;
    }>;
  } | null;
  integrityReport: LedgerIntegrityReport;
  milestones: Array<{
    id: string;
    title: string;
    amount: number;
    currency: string;
    status: string;
    paypalCaptureId: string | null;
  }>;
  driftAlerts: DriftAlert[];
  eventLedger: TransactionEvent[];
  complianceNotice: string;
}

