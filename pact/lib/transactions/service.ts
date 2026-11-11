import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/supabase/profiles";
import { hasUsableServiceRoleKey } from "@/lib/auth/demo-provision";
import { compileAgreementSections } from "@/services/agreement/builder";
import { computeCanonicalAgreementHash } from "@/lib/agreement/hash";
import { CreateTransactionInput } from "@/validations/transaction";
import { ParticipantRole } from "@/types/transaction";

export interface CreateTransactionServiceResult {
  success?: boolean;
  transactionId?: string;
  inviteCode?: string;
  error?: string;
  statusCode?: number;
}

export interface JoinTransactionServiceResult {
  success?: boolean;
  transactionId?: string;
  inviteCode?: string;
  alreadyJoined?: boolean;
  error?: string;
  statusCode?: number;
}

/**
 * Generates an 8-character uppercase invite code (e.g. PACT9X4K).
 */
export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // excludes ambiguous 0, O, 1, I
  let suffix = "";
  for (let i = 0; i < 4; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `PACT${suffix}`;
}

function getPrivilegedClientOrFallback(supabase: SupabaseClient): SupabaseClient {
  if (hasUsableServiceRoleKey()) {
    try {
      return createAdminClient();
    } catch {
      return supabase;
    }
  }
  return supabase;
}

function normalizeRoleLower(
  rawRole: unknown,
  fallback: ParticipantRole
): ParticipantRole {
  const normalized =
    typeof rawRole === "string" ? rawRole.trim().toLowerCase() : "";
  if (normalized === "buyer" || normalized === "seller") {
    return normalized;
  }
  return fallback;
}

export interface SeedableTransactionRecord {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  total_amount: number;
  currency: string;
  creator_id?: string | null;
}

export async function ensureDefaultMilestonesForTransaction(
  dbClient: SupabaseClient,
  userId: string,
  tx: SeedableTransactionRecord
): Promise<Array<Record<string, unknown>>> {
  try {
    const { data: existingMilestones } = await dbClient
      .from("payment_milestones")
      .select("*")
      .eq("transaction_id", tx.id)
      .order("sequence_order", { ascending: true });

    if (existingMilestones && existingMilestones.length > 0) {
      return existingMilestones as Array<Record<string, unknown>>;
    }

    // Reuse existing agreement version if present; otherwise create V1 draft
    const { data: existingVersion } = await dbClient
      .from("agreement_versions")
      .select("id")
      .eq("transaction_id", tx.id)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    let agreementVersionId = existingVersion?.id as string | undefined;

    if (!agreementVersionId) {
      const sections = compileAgreementSections(
        {
          id: tx.id,
          title: tx.title,
          description: tx.description,
          category: tx.category,
          totalAmount: Number(tx.total_amount) || 0,
          currency: tx.currency || "USD",
        },
        [],
        []
      );
      const contentHash = computeCanonicalAgreementHash(sections);

      const { data: draftVersion, error: versionError } = await dbClient
        .from("agreement_versions")
        .insert({
          transaction_id: tx.id,
          version_number: 1,
          content_hash: contentHash,
          title: `${tx.title} — Commercial Agreement V1`,
          sections,
          status: "draft",
          created_by: tx.creator_id || userId,
        })
        .select("id")
        .single();

      if (versionError || !draftVersion?.id) {
        console.warn(
          "[transactions/milestones] Non-fatal draft agreement init warning:",
          versionError?.message
        );
        return [];
      }

      agreementVersionId = draftVersion.id;
    }

    const parsedBudget = Number(tx.total_amount);
    const hasBudget = Number.isFinite(parsedBudget) && parsedBudget > 0;
    const upfrontAmount = hasBudget
      ? Math.max(0.01, Math.round(parsedBudget * 0.3 * 100) / 100)
      : 400;
    const finalAmount = hasBudget
      ? Math.max(0.01, Math.round((parsedBudget - upfrontAmount) * 100) / 100)
      : 800;

    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const milestoneCurrency = tx.currency || "USD";

    const { data: insertedMilestones, error: milestoneError } = await dbClient
      .from("payment_milestones")
      .insert([
        {
          transaction_id: tx.id,
          agreement_version_id: agreementVersionId,
          title: "Upfront Escrow Deposit",
          description:
            "30% initial upfront escrow deposit authorizing project kickoff and material commitment.",
          amount: upfrontAmount,
          currency: milestoneCurrency,
          sequence_order: 1,
          status: "pending",
          due_date: new Date(nowMs + 2 * dayMs).toISOString(),
        },
        {
          transaction_id: tx.id,
          agreement_version_id: agreementVersionId,
          title: "Final Delivery Payout",
          description:
            "70% final delivery payout released upon verified deliverable inspection.",
          amount: finalAmount,
          currency: milestoneCurrency,
          sequence_order: 2,
          status: "pending",
          due_date: new Date(nowMs + 14 * dayMs).toISOString(),
        },
      ])
      .select("*")
      .order("sequence_order", { ascending: true });

    if (milestoneError) {
      console.warn(
        "[transactions/milestones] Non-fatal default milestones insert warning:",
        milestoneError.message
      );
      return [];
    }

    return (insertedMilestones as Array<Record<string, unknown>>) || [];
  } catch (err) {
    console.warn(
      "[transactions/milestones] Non-fatal default milestone initialization error:",
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

export async function createTransactionForUser(
  supabase: SupabaseClient,
  user: User,
  input: CreateTransactionInput
): Promise<CreateTransactionServiceResult> {
  const dbClient = getPrivilegedClientOrFallback(supabase);

  const profileSync = await ensureUserProfile(dbClient, user);
  if (!profileSync.profile) {
    return {
      error:
        profileSync.error ||
        "Unable to initialize your profile before creating the transaction.",
      statusCode: 500,
    };
  }

  let createdTx: {
    id: string;
    invite_code: string;
    title: string;
    description: string | null;
    category: string | null;
    total_amount: number;
    currency: string;
  } | null = null;
  let lastInsertError: string | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const inviteCode = generateInviteCode();
    const { data, error } = await dbClient
      .from("transactions")
      .insert({
        title: input.title,
        category: input.category,
        description: input.description || null,
        creator_id: user.id,
        invite_code: inviteCode,
        total_amount: input.targetBudget,
        currency: input.currency || "INR",
        status: "draft",
      })
      .select(
        "id, invite_code, title, description, category, total_amount, currency"
      )
      .single();

    if (!error && data) {
      createdTx = data;
      break;
    }

    lastInsertError = error?.message || "Failed to create transaction.";
    // Retry on invite_code unique constraint collision
    if (error?.code !== "23505") {
      break;
    }
  }

  if (!createdTx) {
    return {
      error: lastInsertError || "Failed to create transaction.",
      statusCode: 500,
    };
  }

  const creatorRole = normalizeRoleLower(input.userRole, "buyer");
  const { error: participantError } = await dbClient
    .from("transaction_participants")
    .upsert(
      {
        transaction_id: createdTx.id,
        user_id: user.id,
        role: creatorRole,
      },
      { onConflict: "transaction_id,user_id" }
    );

  if (participantError) {
    console.error("Error adding creator as participant:", participantError);
  }

  await ensureDefaultMilestonesForTransaction(dbClient, user.id, {
    ...createdTx,
    creator_id: user.id,
  });

  return {
    success: true,
    transactionId: createdTx.id,
    inviteCode: createdTx.invite_code,
    statusCode: 201,
  };
}

export async function joinTransactionForUser(
  supabase: SupabaseClient,
  user: User,
  inviteCode: string
): Promise<JoinTransactionServiceResult> {
  const normalizedCode = inviteCode.trim().toUpperCase();
  const dbClient = getPrivilegedClientOrFallback(supabase);

  const profileSync = await ensureUserProfile(dbClient, user);
  if (!profileSync.profile) {
    return {
      error:
        profileSync.error ||
        "Unable to initialize your profile before joining the transaction.",
      statusCode: 500,
    };
  }

  // Case-insensitive lookup (admin client bypasses pre-join transactions RLS when configured)
  const { data: transaction, error: fetchError } = await dbClient
    .from("transactions")
    .select("id, creator_id, status, invite_code")
    .ilike("invite_code", normalizedCode)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError || !transaction) {
    return {
      error:
        "Invalid invite code. No matching transaction workspace was found.",
      statusCode: 404,
    };
  }

  const { data: existingParticipants } = await dbClient
    .from("transaction_participants")
    .select("user_id, role")
    .eq("transaction_id", transaction.id);

  if (existingParticipants?.some((p) => p.user_id === user.id)) {
    return {
      success: true,
      transactionId: transaction.id,
      inviteCode: transaction.invite_code,
      alreadyJoined: true,
      statusCode: 200,
    };
  }

  const buyerExists = existingParticipants?.some((p) => p.role === "buyer");
  const sellerExists = existingParticipants?.some((p) => p.role === "seller");

  let assignedRole: ParticipantRole = "seller";
  if (!buyerExists && sellerExists) {
    assignedRole = "buyer";
  } else if (buyerExists && !sellerExists) {
    assignedRole = "seller";
  } else {
    assignedRole = normalizeRoleLower(user.user_metadata?.role, "seller");
  }

  const { error: joinError } = await dbClient
    .from("transaction_participants")
    .upsert(
      {
        transaction_id: transaction.id,
        user_id: user.id,
        role: assignedRole,
      },
      { onConflict: "transaction_id,user_id" }
    );

  if (joinError) {
    return {
      error: joinError.message || "Failed to join transaction.",
      statusCode: 500,
    };
  }

  if (transaction.status === "draft") {
    await dbClient
      .from("transactions")
      .update({ status: "active" })
      .eq("id", transaction.id);
  }

  // Best-effort seller_id population if deployment schema adds that optional column
  if (assignedRole === "seller") {
    try {
      await dbClient
        .from("transactions")
        .update({ seller_id: user.id })
        .eq("id", transaction.id);
    } catch {
      // Canonical schema models participants strictly via transaction_participants
    }
  }

  return {
    success: true,
    transactionId: transaction.id,
    inviteCode: transaction.invite_code,
    statusCode: 200,
  };
}

