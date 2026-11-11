/**
 * Server-Side Validation: Agreements
 * Rule 5: Validate all inputs on the server.
 */

import { ClauseClassification } from "@/types/agreement";

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: Record<string, string[]>;
}

export interface CreateAgreementInput {
  transactionId: string;
  title: string;
  description?: string;
  clauses: Array<{
    classification: ClauseClassification;
    title: string;
    body: string;
    sourceMessageRef?: {
      messageId: string;
      senderId: string;
      senderRole: "buyer" | "seller";
      rawSnippet: string;
      timestamp: string;
    };
    isAiSuggested?: boolean;
  }>;
}

const VALID_CLASSIFICATIONS: ClauseClassification[] = [
  "scope_of_work",
  "deliverable",
  "payment_milestone",
  "timeline",
  "revision_policy",
  "cancellation_policy",
  "intellectual_property",
  "warranty",
];

export function validateCreateAgreementInput(
  input: unknown
): ValidationResult<CreateAgreementInput> {
  const errors: Record<string, string[]> = {};

  if (!input || typeof input !== "object") {
    return { success: false, errors: { _general: ["Input must be a valid JSON object"] } };
  }

  const raw = input as Record<string, unknown>;

  if (!raw.transactionId || typeof raw.transactionId !== "string" || !raw.transactionId.trim()) {
    errors.transactionId = ["Valid transaction ID is required"];
  }

  if (!raw.title || typeof raw.title !== "string" || raw.title.trim().length < 3) {
    errors.title = ["Title must be at least 3 characters long"];
  } else if (raw.title.length > 200) {
    errors.title = ["Title cannot exceed 200 characters"];
  }

  if (raw.description && (typeof raw.description !== "string" || raw.description.length > 2000)) {
    errors.description = ["Description cannot exceed 2000 characters"];
  }

  if (!Array.isArray(raw.clauses) || raw.clauses.length === 0) {
    errors.clauses = ["Agreement must include at least one term clause"];
  } else {
    raw.clauses.forEach((clause, index) => {
      if (!clause || typeof clause !== "object") {
        errors[`clauses[${index}]`] = ["Clause must be an object"];
        return;
      }
      const c = clause as Record<string, unknown>;
      if (!c.title || typeof c.title !== "string" || !c.title.trim()) {
        errors[`clauses[${index}].title`] = ["Clause title is required"];
      }
      if (!c.body || typeof c.body !== "string" || !c.body.trim()) {
        errors[`clauses[${index}].body`] = ["Clause body content is required"];
      }
      if (!VALID_CLASSIFICATIONS.includes(c.classification as ClauseClassification)) {
        errors[`clauses[${index}].classification`] = [
          `Classification must be one of: ${VALID_CLASSIFICATIONS.join(", ")}`,
        ];
      }
    });
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      transactionId: (raw.transactionId as string).trim(),
      title: (raw.title as string).trim(),
      description: raw.description ? (raw.description as string).trim() : undefined,
      clauses: raw.clauses as CreateAgreementInput["clauses"],
    },
  };
}

export interface LegacyApproveAgreementInput {
  agreementVersionId: string;
  expectedVersionNumber: number;
}

export function validateApproveAgreementInput(
  input: unknown
): ValidationResult<LegacyApproveAgreementInput> {
  const errors: Record<string, string[]> = {};

  if (!input || typeof input !== "object") {
    return { success: false, errors: { _general: ["Input must be a valid JSON object"] } };
  }

  const raw = input as Record<string, unknown>;

  if (!raw.agreementVersionId || typeof raw.agreementVersionId !== "string") {
    errors.agreementVersionId = ["Agreement version ID is required"];
  }

  if (
    typeof raw.expectedVersionNumber !== "number" ||
    raw.expectedVersionNumber < 1 ||
    !Number.isInteger(raw.expectedVersionNumber)
  ) {
    errors.expectedVersionNumber = ["Expected version must be a positive integer"];
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      agreementVersionId: raw.agreementVersionId as string,
      expectedVersionNumber: raw.expectedVersionNumber as number,
    },
  };
}

