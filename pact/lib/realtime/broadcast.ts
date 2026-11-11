import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export interface WorkspaceStatusBroadcastPayload {
  transactionId: string;
  eventType: string;
  milestoneId?: string | null;
  paymentRecordId?: string | null;
  status: string;
  summary: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Broadcasts real-time PayPal payment, milestone, invoice, payout, and webhook
 * status transitions to both buyer and seller workspace channels.
 */
export async function broadcastWorkspaceStatusUpdate(
  params: {
    transactionId: string;
    eventType: string;
    milestoneId?: string | null;
    paymentRecordId?: string | null;
    status: string;
    summary: string;
    metadata?: Record<string, unknown>;
  },
  fallbackClient?: SupabaseClient
): Promise<boolean> {
  const payload: WorkspaceStatusBroadcastPayload = {
    transactionId: params.transactionId,
    eventType: params.eventType,
    milestoneId: params.milestoneId ?? null,
    paymentRecordId: params.paymentRecordId ?? null,
    status: params.status,
    summary: params.summary,
    metadata: params.metadata ?? {},
    timestamp: new Date().toISOString(),
  };

  let supabase: SupabaseClient;
  try {
    supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createAdminClient()
      : fallbackClient || (await createClient());
  } catch {
    try {
      supabase = fallbackClient || (await createClient());
    } catch {
      return false;
    }
  }

  const topics = [
    `transaction-workspace-${params.transactionId}`,
    `transaction-workspace-${params.transactionId}-buyer`,
    `transaction-workspace-${params.transactionId}-seller`,
  ];

  try {
    await Promise.all(
      topics.map(async (topic) => {
        const channel = supabase.channel(topic);
        try {
          await channel.httpSend("paypal_status_update", payload);
        } finally {
          await supabase.removeChannel(channel);
        }
      })
    );
    return true;
  } catch (err) {
    console.warn("[realtime] Non-fatal error broadcasting workspace status:", err);
    return false;
  }
}

/**
 * Broadcasts a newly posted chat message on `chat-room:${transactionId}` so connected
 * buyer/seller sessions receive instant updates alongside `postgres_changes`.
 */
export async function broadcastTransactionMessage(
  transactionId: string,
  message: Record<string, unknown>,
  fallbackClient?: SupabaseClient
): Promise<boolean> {
  let supabase: SupabaseClient;
  try {
    supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createAdminClient()
      : fallbackClient || (await createClient());
  } catch {
    try {
      supabase = fallbackClient || (await createClient());
    } catch {
      return false;
    }
  }

  const channel = supabase.channel(`chat-room:${transactionId}`);
  try {
    await channel.httpSend("new_message", { message });
    return true;
  } catch (err) {
    console.warn("[realtime] Non-fatal error broadcasting chat message:", err);
    return false;
  } finally {
    await supabase.removeChannel(channel);
  }
}

/**
 * Broadcasts newly extracted or REVISED terms on `chat-room:${transactionId}`
 * so both buyer and seller windows update their Extracted Terms panels together.
 */
export async function broadcastExtractedTermsUpdate(
  transactionId: string,
  terms: Array<Record<string, unknown>>,
  fallbackClient?: SupabaseClient
): Promise<boolean> {
  let supabase: SupabaseClient;
  try {
    supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createAdminClient()
      : fallbackClient || (await createClient());
  } catch {
    try {
      supabase = fallbackClient || (await createClient());
    } catch {
      return false;
    }
  }

  const channel = supabase.channel(`chat-room:${transactionId}`);
  try {
    await channel.httpSend("terms_updated", {
      transactionId,
      terms,
      timestamp: new Date().toISOString(),
    });
    return true;
  } catch (err) {
    console.warn("[realtime] Non-fatal error broadcasting terms update:", err);
    return false;
  } finally {
    await supabase.removeChannel(channel);
  }
}

export interface AgreementCompiledBroadcastPayload {
  transactionId: string;
  currentVersionId: string;
  agreement_version: string;
  sha256_hash: string;
  versions: Array<Record<string, unknown>>;
  timestamp: string;
}

/**
 * Broadcasts newly compiled or updated agreement versions so connected
 * buyer and seller workspaces switch views simultaneously.
 */
export async function broadcastAgreementUpdate(
  transactionId: string,
  payload: Omit<AgreementCompiledBroadcastPayload, "transactionId" | "timestamp">,
  fallbackClient?: SupabaseClient
): Promise<boolean> {
  let supabase: SupabaseClient;
  try {
    supabase = process.env.SUPABASE_SERVICE_ROLE_KEY
      ? createAdminClient()
      : fallbackClient || (await createClient());
  } catch {
    try {
      supabase = fallbackClient || (await createClient());
    } catch {
      return false;
    }
  }

  const eventPayload: AgreementCompiledBroadcastPayload = {
    transactionId,
    ...payload,
    timestamp: new Date().toISOString(),
  };

  const topics = [
    `transaction-workspace-${transactionId}`,
    `transaction-workspace-${transactionId}-buyer`,
    `transaction-workspace-${transactionId}-seller`,
  ];

  try {
    await Promise.all(
      topics.map(async (topic) => {
        const channel = supabase.channel(topic);
        try {
          await channel.httpSend("agreement_compiled", eventPayload);
        } finally {
          await supabase.removeChannel(channel);
        }
      })
    );
    return true;
  } catch (err) {
    console.warn("[realtime] Non-fatal error broadcasting agreement update:", err);
    return false;
  }
}

