"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  createTransactionSchema,
  joinTransactionSchema,
} from "@/validations/transaction";
import {
  createTransactionForUser,
  joinTransactionForUser,
} from "@/lib/transactions/service";

export interface TransactionActionResult {
  error?: string;
  success?: boolean;
  transactionId?: string;
}

export async function createTransactionAction(
  _prevState: TransactionActionResult | null,
  formData: FormData
): Promise<TransactionActionResult> {
  const rawData = {
    title: formData.get("title"),
    category: formData.get("category"),
    description: formData.get("description"),
    userRole: formData.get("userRole"),
    targetBudget: formData.get("targetBudget"),
    currency: formData.get("currency") || "INR",
  };

  const validated = createTransactionSchema.safeParse(rawData);
  if (!validated.success) {
    return {
      error: validated.error.issues?.[0]?.message || "Validation failed",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to create a transaction" };
  }

  const result = await createTransactionForUser(supabase, user, validated.data);
  if (result.error || !result.transactionId) {
    return { error: result.error || "Failed to create transaction" };
  }

  redirect(`/transactions/${result.transactionId}`);
}

export async function joinTransactionAction(
  _prevState: TransactionActionResult | null,
  formData: FormData
): Promise<TransactionActionResult> {
  const rawData = {
    inviteCode: formData.get("inviteCode"),
  };

  const validated = joinTransactionSchema.safeParse(rawData);
  if (!validated.success) {
    return {
      error: validated.error.issues?.[0]?.message || "Invalid invite code",
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "You must be signed in to join a transaction" };
  }

  const result = await joinTransactionForUser(
    supabase,
    user,
    validated.data.inviteCode
  );
  if (result.error || !result.transactionId) {
    return { error: result.error || "Could not join transaction" };
  }

  redirect(`/transactions/${result.transactionId}`);
}
