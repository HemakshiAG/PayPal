export interface DisputeMediationEvidenceItem {
  source: "agreement" | "chat" | "proof_of_delivery" | "payment" | "claim";
  reference: string;
  finding: string;
}

export interface DisputeMediationResult {
  headline: string;
  deficitPercent: number;
  proposedRefundAmount: number;
  proposedSellerRetentionAmount: number;
  capturedAmount: number;
  maxRefundableAmount: number;
  totalContractAmount: number;
  currency: string;
  rationale: string;
  recommendedAction: string;
  recommendedReason: string;
  evidenceCitations: DisputeMediationEvidenceItem[];
  provider: "gemini-ai" | "deterministic-fallback";
}

export interface TargetCaptureInfo {
  paymentRecordId: string;
  captureId: string;
  milestoneId: string | null;
  milestoneTitle: string;
  capturedAmount: number;
  priorRefundedAmount: number;
  maxRefundableAmount: number;
  currency: string;
  status: string;
}

export interface MediateDisputeResponsePayload {
  mediation: DisputeMediationResult;
  targetCapture: TargetCaptureInfo;
}

