/**
 * Server-Side Validation: Payment and Milestone Coordination
 * Rule 5: Validate all inputs on the server.
 * Rule 11 & 12: PayPal server-verified payments, no false escrow claims.
 */

import { ValidationResult } from "./agreement.schema";

export interface CreatePaymentOrderInput {
  transactionId: string;
  milestoneId: string;
  amount: number;
  currency: string;
}

const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"];

export function validateCreatePaymentOrderInput(
  input: unknown
): ValidationResult<CreatePaymentOrderInput> {
  const errors: Record<string, string[]> = {};

  if (!input || typeof input !== "object") {
    return { success: false, errors: { _general: ["Input must be a valid JSON object"] } };
  }

  const raw = input as Record<string, unknown>;

  if (!raw.transactionId || typeof raw.transactionId !== "string" || !raw.transactionId.trim()) {
    errors.transactionId = ["Valid transaction ID is required"];
  }

  if (!raw.milestoneId || typeof raw.milestoneId !== "string" || !raw.milestoneId.trim()) {
    errors.milestoneId = ["Valid milestone ID is required"];
  }

  if (typeof raw.amount !== "number" || isNaN(raw.amount) || raw.amount <= 0) {
    errors.amount = ["Amount must be a positive number greater than 0"];
  } else if (raw.amount > 1000000) {
    errors.amount = ["Amount exceeds maximum permitted single transaction limit"];
  }

  if (
    !raw.currency ||
    typeof raw.currency !== "string" ||
    !SUPPORTED_CURRENCIES.includes(raw.currency.toUpperCase())
  ) {
    errors.currency = [`Currency must be one of: ${SUPPORTED_CURRENCIES.join(", ")}`];
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      transactionId: (raw.transactionId as string).trim(),
      milestoneId: (raw.milestoneId as string).trim(),
      amount: Math.round((raw.amount as number) * 100) / 100, // Round to 2 decimal places
      currency: (raw.currency as string).toUpperCase(),
    },
  };
}

