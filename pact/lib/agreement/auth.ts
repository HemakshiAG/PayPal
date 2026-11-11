import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/supabase/profiles";
import { resolveDemoAccountByEmail } from "@/lib/auth/demo-accounts";
import { hasUsableServiceRoleKey } from "@/lib/auth/demo-provision";

export interface AuthorizedAgreementTransaction {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  total_amount: number;
  currency: string;
  creator_id: string;
}

export type AuthorizeAgreementActorResult =
  | {
      ok: true;
      dbClient: SupabaseClient;
      role: "buyer" | "seller";
      tx: AuthorizedAgreementTransaction;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

export async function authorizeAgreementActor(
  supabase: SupabaseClient,
  user: User,
  transactionId: string
): Promise<AuthorizeAgreementActorResult> {
  const dbClient = hasUsableServiceRoleKey() ? createAdminClient() : supabase;
  const demoAccount = resolveDemoAccountByEmail(user.email);

  const [{ data: participant }, { data: tx }] = await Promise.all([
    dbClient
      .from("transaction_participants")
      .select("id, role")
      .eq("transaction_id", transactionId)
      .eq("user_id", user.id)
      .maybeSingle(),
    dbClient
      .from("transactions")
      .select(
        "id, title, description, category, total_amount, currency, creator_id"
      )
      .eq("id", transactionId)
      .maybeSingle(),
  ]);

  if (!tx) {
    return {
      ok: false,
      status: 404,
      error: "Transaction not found",
    };
  }

  const isAuthorized =
    Boolean(participant) ||
    tx.creator_id === user.id ||
    Boolean(demoAccount);

  if (!isAuthorized) {
    return {
      ok: false,
      status: 403,
      error:
        "Forbidden: You are not an authorized participant in this transaction",
    };
  }

  // Ensure profile exists so foreign keys on agreement_versions / agreement_approvals succeed
  await ensureUserProfile(dbClient, user).catch(() => {});

  const role: "buyer" | "seller" =
    (participant?.role as "buyer" | "seller" | undefined) ||
    demoAccount?.role ||
    (tx.creator_id === user.id ? "buyer" : "seller");

  // Auto-attach buyer@pact.demo / seller@pact.demo into transaction_participants if missing
  if (!participant && demoAccount) {
    await dbClient.from("transaction_participants").upsert(
      {
        transaction_id: transactionId,
        user_id: user.id,
        role: demoAccount.role,
      },
      { onConflict: "transaction_id,user_id" }
    );
  }

  // Populate seller_id if NULL on schemas that include a seller_id column
  if (role === "seller") {
    try {
      const { error: sellerColErr } = await dbClient
        .from("transactions")
        .update({ seller_id: user.id })
        .eq("id", transactionId)
        .is("seller_id", null);
      if (sellerColErr && !sellerColErr.message?.includes("seller_id")) {
        console.warn(
          "[agreement/auth] Non-fatal seller_id backfill warning:",
          sellerColErr.message
        );
      }
    } catch {
      // Canonical schema models participants via transaction_participants
    }
  }

  return {
    ok: true,
    dbClient,
    role,
    tx: tx as AuthorizedAgreementTransaction,
  };
}

