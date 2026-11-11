export interface VisualProofSpecCheck {
  spec: string;
  passed: boolean;
  notes: string;
}

export interface VisualProofResult {
  isApproved: boolean;
  matchConfidence: number;
  specChecklist: VisualProofSpecCheck[];
  summary: string;
}

export interface StoredVisualProof extends VisualProofResult {
  transactionId: string;
  milestoneId?: string | null;
  agreementVersionId?: string | null;
  fileName?: string;
  imageUrl?: string;
  verifiedAt: string;
  provider: "gemini-vision" | "deterministic-fallback";
  ledgerEventId?: string | null;
}

export interface VisualProofPayoutReceipt {
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

export interface VerifyProofApiResponse {
  proof: StoredVisualProof;
  payout?: VisualProofPayoutReceipt | null;
}

