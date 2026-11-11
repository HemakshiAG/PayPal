import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { ensureUserProfile } from "@/lib/supabase/profiles";
import { seedHackathonDemoTransaction } from "@/lib/demo/seed";
import {
  DEMO_ACCOUNTS,
  getDemoPassword,
  resolveDemoAccountByEmail,
  type IsolatedDemoAccount,
} from "@/lib/auth/demo-accounts";

export const CANONICAL_DEMO_INVITE_CODE = "HOODLNM7";
export const ACTIVE_DEMO_WORKSPACE_ID =
  "bf6e02c6-1540-442e-a302-7ab27d11d054";

export function hasUsableServiceRoleKey(): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(key && !key.includes("your-supabase-service-role-key"));
}

async function findAuthUserByEmail(
  adminClient: SupabaseClient,
  email: string
): Promise<User | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error || !data?.users?.length) {
      return null;
    }
    const found = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === target
    );
    if (found) {
      return found;
    }
    if (data.users.length < 200) {
      return null;
    }
  }
  return null;
}

async function ensureDemoAuthUser(
  adminClient: SupabaseClient,
  config: IsolatedDemoAccount,
  password: string
): Promise<User> {
  const existing = await findAuthUserByEmail(adminClient, config.email);

  let authUser: User | null = null;

  if (existing) {
    const { data, error } = await adminClient.auth.admin.updateUserById(
      existing.id,
      {
        password,
        email_confirm: true,
        user_metadata: {
          ...(existing.user_metadata || {}),
          full_name: config.fullName,
          role: config.roleLabel,
          demo_alias_id: config.aliasId,
        },
      }
    );
    if (error || !data.user) {
      throw new Error(
        error?.message || `Unable to update demo account ${config.email}.`
      );
    }
    authUser = data.user;
  } else {
    const { data, error } = await adminClient.auth.admin.createUser({
      id: config.id,
      email: config.email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: config.fullName,
        role: config.roleLabel,
        demo_alias_id: config.aliasId,
      },
    });
    if (error || !data.user) {
      throw new Error(
        error?.message || `Unable to provision demo account ${config.email}.`
      );
    }
    authUser = data.user;
  }

  const { error: profileError } = await adminClient.from("profiles").upsert(
    {
      id: authUser.id,
      full_name: config.fullName,
      role: config.role,
    },
    { onConflict: "id" }
  );

  if (profileError) {
    throw new Error(
      `Unable to sync profile for ${config.email}: ${profileError.message}`
    );
  }

  return authUser;
}

async function attachParticipantsToTransaction(
  client: SupabaseClient,
  transactionId: string,
  participants: Array<{
    transaction_id: string;
    user_id: string;
    role: "buyer" | "seller";
  }>,
  sellerUserId?: string | null
): Promise<void> {
  const { error: partErr } = await client
    .from("transaction_participants")
    .upsert(participants, {
      onConflict: "transaction_id,user_id",
      ignoreDuplicates: true,
    });

  if (partErr) {
    console.warn(
      "[demo-provision] Non-fatal canonical participant attach warning:",
      partErr.message
    );
  }

  if (sellerUserId) {
    try {
      const { error: sellerColErr } = await client
        .from("transactions")
        .update({ seller_id: sellerUserId })
        .eq("id", transactionId)
        .is("seller_id", null);
      if (sellerColErr && !sellerColErr.message?.includes("seller_id")) {
        console.warn(
          "[demo-provision] Non-fatal seller_id backfill warning:",
          sellerColErr.message
        );
      }
    } catch {
      // Canonical schema models participants in transaction_participants
    }
  }
}

async function ensureCanonicalDemoTransaction(
  client: SupabaseClient,
  buyerId: string,
  sellerId: string | null,
  activeUserId: string,
  activeRole: "buyer" | "seller"
): Promise<string | null> {
  try {
    const [{ data: activeDemoTx }, { data: hoodDemoTx }] = await Promise.all([
      client
        .from("transactions")
        .select("id")
        .eq("id", ACTIVE_DEMO_WORKSPACE_ID)
        .maybeSingle(),
      client
        .from("transactions")
        .select("id")
        .ilike("invite_code", CANONICAL_DEMO_INVITE_CODE)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const candidateIds = Array.from(
      new Set(
        [activeDemoTx?.id, hoodDemoTx?.id].filter(
          (id): id is string => Boolean(id)
        )
      )
    );

    if (candidateIds.length > 0) {
      const participantsTemplate = (txId: string) => {
        const rows: Array<{
          transaction_id: string;
          user_id: string;
          role: "buyer" | "seller";
        }> = [
          {
            transaction_id: txId,
            user_id: activeUserId,
            role: activeRole,
          },
        ];

        if (sellerId && sellerId !== buyerId) {
          if (buyerId !== activeUserId) {
            rows.push({
              transaction_id: txId,
              user_id: buyerId,
              role: "buyer",
            });
          }
          if (sellerId !== activeUserId) {
            rows.push({
              transaction_id: txId,
              user_id: sellerId,
              role: "seller",
            });
          }
        }
        return rows;
      };

      const resolvedSellerId =
        sellerId || (activeRole === "seller" ? activeUserId : null);

      await Promise.all(
        candidateIds.map((txId) =>
          attachParticipantsToTransaction(
            client,
            txId,
            participantsTemplate(txId),
            resolvedSellerId
          )
        )
      );

      return activeDemoTx?.id || hoodDemoTx?.id || candidateIds[0];
    }

    const seedRes = await seedHackathonDemoTransaction({
      supabase: client,
      creatorId: buyerId,
      buyerId,
      sellerId,
      primaryRole: activeRole,
      inviteCode: CANONICAL_DEMO_INVITE_CODE,
      transactionId: ACTIVE_DEMO_WORKSPACE_ID,
    });

    return seedRes.transactionId;
  } catch (err) {
    console.warn(
      "[demo-provision] Non-fatal demo transaction ensure warning:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

/**
 * Ensures demo accounts (`buyer@pact.demo` / `seller@pact.demo`) are attached
 * to the active demo workspace (`bf6e02c6-...` / `HOODLNM7`) on dashboard or workspace load.
 */
export async function ensureDemoParticipantAccess(
  supabase: SupabaseClient,
  user: User,
  specificTransactionId?: string
): Promise<string | null> {
  const demoAccount = resolveDemoAccountByEmail(user.email);
  if (!demoAccount) {
    return null;
  }

  const client = hasUsableServiceRoleKey() ? createAdminClient() : supabase;

  try {
    await ensureUserProfile(client, user);
  } catch {
    // Non-fatal
  }

  if (specificTransactionId === ACTIVE_DEMO_WORKSPACE_ID) {
    const { data: specificTx } = await client
      .from("transactions")
      .select("id")
      .eq("id", ACTIVE_DEMO_WORKSPACE_ID)
      .maybeSingle();

    if (specificTx?.id) {
      await attachParticipantsToTransaction(
        client,
        specificTx.id,
        [
          {
            transaction_id: specificTx.id,
            user_id: user.id,
            role: demoAccount.role,
          },
        ],
        demoAccount.role === "seller" ? user.id : null
      );
      return specificTx.id;
    }
  }

  if (hasUsableServiceRoleKey()) {
    const [buyerUser, sellerUser] = await Promise.all([
      findAuthUserByEmail(client, DEMO_ACCOUNTS.buyer.email),
      findAuthUserByEmail(client, DEMO_ACCOUNTS.seller.email),
    ]);

    return ensureCanonicalDemoTransaction(
      client,
      buyerUser?.id || (demoAccount.role === "buyer" ? user.id : DEMO_ACCOUNTS.buyer.id),
      sellerUser?.id || (demoAccount.role === "seller" ? user.id : DEMO_ACCOUNTS.seller.id),
      user.id,
      demoAccount.role
    );
  }

  return ensureCanonicalDemoTransaction(
    client,
    demoAccount.role === "buyer" ? user.id : DEMO_ACCOUNTS.buyer.id,
    demoAccount.role === "seller" ? user.id : null,
    user.id,
    demoAccount.role
  );
}

export interface DemoProvisionResult {
  user: User;
  targetConfig: IsolatedDemoAccount;
  demoTransactionId: string | null;
}

export async function provisionAndSignInDemoRole(
  supabase: SupabaseClient,
  role: "buyer" | "seller"
): Promise<DemoProvisionResult> {
  const targetConfig = DEMO_ACCOUNTS[role];
  const demoPassword = getDemoPassword();

  // Always clear any stale session cookies before signing into the target demo role
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});

  if (hasUsableServiceRoleKey()) {
    const adminClient = createAdminClient();
    const [buyerUser, sellerUser] = await Promise.all([
      ensureDemoAuthUser(adminClient, DEMO_ACCOUNTS.buyer, demoPassword),
      ensureDemoAuthUser(adminClient, DEMO_ACCOUNTS.seller, demoPassword),
    ]);

    if (buyerUser.id === sellerUser.id) {
      throw new Error(
        "Demo session isolation error: buyer and seller resolved to the same account."
      );
    }

    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: targetConfig.email,
        password: demoPassword,
      });

    if (
      signInError ||
      !signInData.user ||
      signInData.user.email?.toLowerCase() !== targetConfig.email.toLowerCase()
    ) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => {});
      throw new Error(
        signInError?.message || "Demo sign-in email verification failed."
      );
    }

    const demoTransactionId = await ensureCanonicalDemoTransaction(
      adminClient,
      buyerUser.id,
      sellerUser.id,
      signInData.user.id,
      targetConfig.role
    );

    return {
      user: signInData.user,
      targetConfig,
      demoTransactionId,
    };
  }

  // Fallback path when SUPABASE_SERVICE_ROLE_KEY is unavailable
  let authResult = await supabase.auth.signInWithPassword({
    email: targetConfig.email,
    password: demoPassword,
  });

  if (authResult.error) {
    const signUpResult = await supabase.auth.signUp({
      email: targetConfig.email,
      password: demoPassword,
      options: {
        data: {
          full_name: targetConfig.fullName,
          role: targetConfig.roleLabel,
          demo_alias_id: targetConfig.aliasId,
        },
      },
    });

    if (signUpResult.error) {
      throw new Error(signUpResult.error.message);
    }

    if (!signUpResult.data.session) {
      throw new Error(
        "Demo account created, but Supabase email confirmation is enabled and SUPABASE_SERVICE_ROLE_KEY is missing."
      );
    }

    authResult = await supabase.auth.signInWithPassword({
      email: targetConfig.email,
      password: demoPassword,
    });
  }

  const activeUser = authResult.data.user;
  if (
    authResult.error ||
    !activeUser ||
    activeUser.email?.toLowerCase() !== targetConfig.email.toLowerCase()
  ) {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
    throw new Error(
      authResult.error?.message || "Demo sign-in failed or mismatched user."
    );
  }

  try {
    await ensureUserProfile(supabase, activeUser);
    await supabase
      .from("profiles")
      .update({ full_name: targetConfig.fullName, role: targetConfig.role })
      .eq("id", activeUser.id);
  } catch (profileErr) {
    console.warn(
      "[demo-provision] Non-fatal fallback profile update failure:",
      profileErr instanceof Error ? profileErr.message : profileErr
    );
  }

  const demoTransactionId = await ensureCanonicalDemoTransaction(
    supabase,
    targetConfig.role === "buyer" ? activeUser.id : DEMO_ACCOUNTS.buyer.id,
    targetConfig.role === "seller" ? activeUser.id : null,
    activeUser.id,
    targetConfig.role
  );

  return {
    user: activeUser,
    targetConfig,
    demoTransactionId,
  };
}
