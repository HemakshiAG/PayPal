/**
 * PACT Core Platform Constants & Enumerations
 */

export const APP_CONFIG = {
  name: "PACT",
  fullName: "PACT — AI-Powered Transaction Assurance",
  tagline: "Custom commerce agreements with mutual certainty, milestone payments, and verified assurance.",
  version: "0.1.0",
} as const;

/**
 * Transaction lifecycle statuses
 */
export const TRANSACTION_STATUS = {
  DRAFT: "draft",
  NEGOTIATING: "negotiating",
  PENDING_APPROVAL: "pending_approval",
  ACTIVE: "active",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
  DISPUTED: "disputed",
} as const;

/**
 * Agreement revision statuses
 */
export const AGREEMENT_STATUS = {
  DRAFT: "draft",
  PROPOSED: "proposed",
  REVISED: "revised",
  APPROVED_BY_BUYER: "approved_by_buyer",
  APPROVED_BY_SELLER: "approved_by_seller",
  MUTUALLY_APPROVED: "mutually_approved",
  SUPERSEDED: "superseded",
} as const;

/**
 * Milestone payment states (PayPal verified events)
 * Rule 11 & 12: Payment status comes strictly from server-verified events; milestone payments are not escrow.
 */
export const MILESTONE_STATUS = {
  PENDING: "pending",
  PAYMENT_PENDING: "payment_pending",
  PAYMENT_VERIFIED: "payment_verified",
  WORK_SUBMITTED: "work_submitted",
  APPROVED: "approved",
  RELEASED: "released",
  DISPUTED: "disputed",
} as const;

/**
 * Party roles within a PACT transaction
 */
export const PARTY_ROLE = {
  BUYER: "buyer",
  SELLER: "seller",
} as const;

/**
 * AI Term Classifications
 * Rule 8: AI-extracted terms must retain original references and classification
 */
export const CLAUSE_CLASSIFICATION = {
  SCOPE_OF_WORK: "scope_of_work",
  DELIVERABLE: "deliverable",
  PAYMENT_MILESTONE: "payment_milestone",
  TIMELINE: "timeline",
  REVISION_POLICY: "revision_policy",
  CANCELLATION_POLICY: "cancellation_policy",
  INTELLECTUAL_PROPERTY: "intellectual_property",
  WARRANTY: "warranty",
} as const;

