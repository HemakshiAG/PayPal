import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";

export interface ResolvedParticipantContact {
  userId: string | null;
  role: "buyer" | "seller";
  name: string;
  email: string;
}

/**
 * Resolves participant display name and email server-side using Supabase Admin Auth API
 * with safe deterministic sandbox fallbacks for single-user demo workspaces.
 */
export async function resolveTransactionParticipantContact(params: {
  supabase: SupabaseClient;
  transactionId: string;
  role: "buyer" | "seller";
  fallbackEmail?: string;
}): Promise<ResolvedParticipantContact> {
  const { supabase, transactionId, role } = params;
  const defaultEmail =
    params.fallbackEmail || (role === "seller" ? "seller@pact.demo" : "buyer@pact.demo");

  const { data: participants } = await supabase
    .from("transaction_participants")
    .select("user_id, role, profiles(full_name)")
    .eq("transaction_id", transactionId);

  const exactMatch = (participants || []).find((p) => p.role === role);
  const resolvedUserId = (exactMatch?.user_id as string | undefined) || null;
  const profileData = exactMatch?.profiles as unknown as
    | { full_name?: string | null }
    | null
    | undefined;
  const displayName =
    profileData?.full_name?.trim() || (role === "seller" ? "Seller" : "Buyer");

  if (!resolvedUserId) {
    return {
      userId: null,
      role,
      name: displayName,
      email: defaultEmail,
    };
  }

  try {
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const admin = createAdminClient();
      const { data } = await admin.auth.admin.getUserById(resolvedUserId);
      const userEmail = data?.user?.email?.trim();
      if (userEmail) {
        return {
          userId: resolvedUserId,
          role,
          name: displayName,
          email: userEmail,
        };
      }
    }
  } catch {
    // Fall back safely when admin lookup is unavailable
  }

  return {
    userId: resolvedUserId,
    role,
    name: displayName,
    email: defaultEmail,
  };
}

