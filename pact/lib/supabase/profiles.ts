import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import type { ProfileRole, ProfileRow } from "@/types/database";

export interface EnsureUserProfileResult {
  profile: Pick<ProfileRow, "id" | "full_name" | "role" | "avatar_url"> | null;
  created: boolean;
  error?: string;
}

function normalizeProfileRole(rawRole: unknown): ProfileRole {
  const normalized =
    typeof rawRole === "string" ? rawRole.trim().toLowerCase() : "";
  if (
    normalized === "buyer" ||
    normalized === "seller" ||
    normalized === "both"
  ) {
    return normalized;
  }
  return "both";
}

function deriveFullName(user: User): string {
  const metaName =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
    "";

  if (metaName) {
    return metaName;
  }

  if (user.email) {
    const localPart = user.email.split("@")[0]?.trim();
    if (localPart) {
      return localPart;
    }
  }

  return "PACT User";
}

function hasUsableServiceRoleKey(): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(key && !key.includes("your-supabase-service-role-key"));
}

/**
 * Ensures the authenticated user has a corresponding row in `public.profiles`.
 * Prevents foreign key constraint failures (e.g. `transactions_creator_id_fkey`)
 * if a user pre-existed before migrations or the signup trigger did not run.
 */
export async function ensureUserProfile(
  supabase: SupabaseClient,
  user: User
): Promise<EnsureUserProfileResult> {
  const { data: existingProfile, error: selectError } = await supabase
    .from("profiles")
    .select("id, full_name, role, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  if (existingProfile) {
    return {
      profile: existingProfile,
      created: false,
    };
  }

  const profilePayload = {
    id: user.id,
    full_name: deriveFullName(user),
    role: normalizeProfileRole(user.user_metadata?.role),
    avatar_url:
      typeof user.user_metadata?.avatar_url === "string"
        ? user.user_metadata.avatar_url
        : null,
  };

  // Prefer the admin client when configured so profile sync works even if the
  // caller environment has not yet applied the self-insert RLS migration.
  if (hasUsableServiceRoleKey()) {
    try {
      const adminClient = createAdminClient();
      const { data: upserted, error: adminError } = await adminClient
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id" })
        .select("id, full_name, role, avatar_url")
        .single();

      if (!adminError && upserted) {
        return {
          profile: upserted,
          created: true,
        };
      }
    } catch (err) {
      console.warn("Admin profile sync fallback failed, retrying with session client:", err);
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" })
    .select("id, full_name, role, avatar_url")
    .single();

  if (insertError) {
    return {
      profile: null,
      created: false,
      error:
        insertError.message ||
        selectError?.message ||
        "Unable to synchronize user profile record.",
    };
  }

  return {
    profile: inserted,
    created: true,
  };
}

