/**
 * PACT Agreement & Versioning Domain Models
 * Phase 4: Grouped Agreement Builder & Immutable SHA-256 Versioning Engine
 *
 * NON-NEGOTIABLE RULES ENFORCED:
 * - Rule 9: Every agreement modification creates a new version. Never silently overwrite an approved version.
 * - Rule 10: Both parties must approve the same exact agreement version before it becomes active.
 * - Rule 12: Clear non-escrow milestone disbursement compliance.
 */

export type ClauseClassification =
  | "scope_of_work"
  | "deliverable"
  | "payment_milestone"
  | "timeline"
  | "revision_policy"
  | "cancellation_policy"
  | "intellectual_property"
  | "warranty";

export interface SourceMessageReference {
  messageId: string;
  senderId: string;
  senderRole: "buyer" | "seller";
  rawSnippet: string;
  timestamp: string;
}

export type AgreementStatus = "draft" | "active" | "superseded" | "cancelled";

export type AgreementApprovalStatus =
  | "draft"
  | "pending_approval"
  | "approved_by_buyer"
  | "approved_by_seller"
  | "mutually_approved"
  | "rejected"
  | "superseded";

export interface AgreementApprovalRecord {
  approvedByUserId: string;
  role: "buyer" | "seller";
  approvedAt: string;
  versionApproved: number;
  cryptographicSignature?: string;
}

export type AgreementItemOrigin =
  | "confirmed_term"
  | "agreed_contingency"
  | "standard_provision";

export interface AgreementItem {
  id: string;
  title: string;
  content: string;
  origin: AgreementItemOrigin;
  sourceId?: string;
  sourceSnippet?: string;
}

export interface AgreementSection {
  sectionNumber: number; // 1 to 13
  sectionId: string;
  title: string;
  description: string;
  items: AgreementItem[];
}

export interface AgreementApproval {
  id: string;
  agreementVersionId: string;
  transactionId: string;
  userId: string;
  role: "buyer" | "seller";
  contentHash: string;
  approvedAt: string;
  profile?: {
    fullName: string | null;
    avatarUrl: string | null;
  };
}

export interface AgreementVersion {
  id: string;
  transactionId: string;
  versionNumber: number;
  contentHash: string; // 64-character SHA-256 hex string
  title: string;
  sections: AgreementSection[];
  status: AgreementStatus;
  createdBy: string;
  createdAt: string;
  approvals?: AgreementApproval[];
  buyerApproved?: boolean;
  sellerApproved?: boolean;
  isMutuallyApproved?: boolean;
}

export interface SectionDiff {
  sectionNumber: number;
  sectionId: string;
  title: string;
  type: "unchanged" | "modified" | "added" | "removed";
  oldText?: string;
  newText?: string;
}

export interface VersionDiffPayload {
  oldVersionNumber: number;
  newVersionNumber: number;
  oldHash: string;
  newHash: string;
  sectionDiffs: SectionDiff[];
}
