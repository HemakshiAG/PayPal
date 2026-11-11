/**
 * Shared agreement lock and signature status helpers used by client tabs and payment APIs.
 */

export const VALID_LOCKED_AGREEMENT_STATUSES = [
  "ACTIVE",
  "AGREEMENT_LOCKED",
  "LOCKED",
  "SIGNED",
  "CONFIRMED",
] as const;

export interface AgreementRecordWithSignatures {
  id?: string;
  versionNumber?: number;
  contentHash?: string;
  title?: string;
  sections?: unknown;
  status?: string | null;
  approvals?: unknown[];
  agreement_approvals?: unknown[];
  signatures?: unknown[];
  buyerApproved?: boolean;
  sellerApproved?: boolean;
  isMutuallyApproved?: boolean;
  buyer_approved?: boolean;
  seller_approved?: boolean;
  is_mutually_approved?: boolean;
}

/** Returns true if a transaction or agreement status string represents an active or locked state. */
export function isAgreementLockedOrActiveStatus(status: unknown): boolean {
  return VALID_LOCKED_AGREEMENT_STATUSES.includes(
    String(status || "")
      .trim()
      .toUpperCase() as (typeof VALID_LOCKED_AGREEMENT_STATUSES)[number]
  );
}

/** Returns true if any buyer/seller approvals or signatures are present on an agreement record. */
export function hasAgreementSignatures(record: unknown): boolean {
  if (!record || typeof record !== "object") return false;
  const r = record as AgreementRecordWithSignatures;
  return Boolean(
    (Array.isArray(r.approvals) && r.approvals.length > 0) ||
      (Array.isArray(r.agreement_approvals) &&
        r.agreement_approvals.length > 0) ||
      (Array.isArray(r.signatures) && r.signatures.length > 0) ||
      r.buyerApproved ||
      r.sellerApproved ||
      r.isMutuallyApproved ||
      r.buyer_approved ||
      r.seller_approved ||
      r.is_mutually_approved
  );
}

