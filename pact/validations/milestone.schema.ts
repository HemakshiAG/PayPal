/**
 * Server-Side Validation: Milestone Definition
 * Rule 5: Validate all inputs on the server.
 */

import { ValidationResult } from "./agreement.schema";

export interface CreateMilestoneInput {
  transactionId: string;
  agreementVersionId: string;
  title: string;
  description: string;
  amount: number;
  currency: string;
  orderIndex: number;
  dueDate?: string;
}

export function validateCreateMilestoneInput(
  input: unknown
): ValidationResult<CreateMilestoneInput> {
  const errors: Record<string, string[]> = {};

  if (!input || typeof input !== "object") {
    return { success: false, errors: { _general: ["Input must be a valid JSON object"] } };
  }

  const raw = input as Record<string, unknown>;

  if (!raw.transactionId || typeof raw.transactionId !== "string" || !raw.transactionId.trim()) {
    errors.transactionId = ["Valid transaction ID is required"];
  }

  if (!raw.agreementVersionId || typeof raw.agreementVersionId !== "string") {
    errors.agreementVersionId = ["Agreement version ID is required"];
  }

  if (!raw.title || typeof raw.title !== "string" || raw.title.trim().length < 3) {
    errors.title = ["Milestone title must be at least 3 characters long"];
  }

  if (!raw.description || typeof raw.description !== "string" || raw.description.trim().length < 5) {
    errors.description = ["Milestone description must be at least 5 characters long"];
  }

  if (typeof raw.amount !== "number" || raw.amount <= 0) {
    errors.amount = ["Milestone amount must be greater than zero"];
  }

  if (typeof raw.orderIndex !== "number" || raw.orderIndex < 0 || !Number.isInteger(raw.orderIndex)) {
    errors.orderIndex = ["Order index must be a non-negative integer"];
  }

  if (raw.dueDate) {
    const parsedDate = new Date(raw.dueDate as string);
    if (isNaN(parsedDate.getTime())) {
      errors.dueDate = ["Due date must be a valid ISO date string"];
    }
  }

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      transactionId: (raw.transactionId as string).trim(),
      agreementVersionId: (raw.agreementVersionId as string).trim(),
      title: (raw.title as string).trim(),
      description: (raw.description as string).trim(),
      amount: Math.round((raw.amount as number) * 100) / 100,
      currency: (raw.currency as string || "USD").toUpperCase(),
      orderIndex: raw.orderIndex as number,
      dueDate: raw.dueDate ? (raw.dueDate as string) : undefined,
    },
  };
}

