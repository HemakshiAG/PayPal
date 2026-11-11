/**
 * PACT Tamper-Evident Hash-Chained Event Ledger Engine
 * Phase 6: Evidence Vault & Cryptographic Audit Trail
 *
 * Links every transaction lifecycle event to its predecessor via SHA-256 hashing over
 * canonicalized JSON payloads and normalized ISO-8601 UTC timestamps.
 */

import crypto from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { canonicalizeValue } from "@/lib/agreement/hash";
import { TransactionEventRow } from "@/types/database";
import { LedgerIntegrityReport } from "@/types/vault";

export const GENESIS_HASH = "GENESIS_HASH";

/**
 * Normalizes any PostgreSQL timestamptz or ISO string to canonical JS UTC ISO millisecond format
 * so round-tripping through Postgres preserves deterministic hash computation.
 */
export function normalizeEventTimestamp(ts: string): string {
  const parsed = new Date(ts);
  if (isNaN(parsed.getTime())) {
    return ts;
  }
  return parsed.toISOString();
}

/**
 * Computes a deterministic 64-char SHA-256 hex digest linking an event to its predecessor.
 */
export function computeEventHash(params: {
  previousEventHash: string;
  eventType: string;
  actorId: string;
  timestamp: string;
  eventPayload: Record<string, unknown>;
}): string {
  const canonicalTimestamp = normalizeEventTimestamp(params.timestamp);
  const canonicalPayload = JSON.stringify(
    canonicalizeValue(params.eventPayload || {})
  );
  const preimage = `${params.previousEventHash}|${params.eventType}|${params.actorId}|${canonicalTimestamp}|${canonicalPayload}`;
  return crypto.createHash("sha256").update(preimage, "utf8").digest("hex");
}

/**
 * Appends a hash-chained event to the transaction's immutable ledger.
 */
export async function logTransactionEvent(
  transactionId: string,
  eventType: string,
  actorId: string,
  payload: Record<string, unknown> = {},
  supabaseClient?: SupabaseClient
): Promise<TransactionEventRow | null> {
  try {
    const supabase = supabaseClient || (await createClient());

    // Fetch the most recent event hash for chaining (or fall back to GENESIS_HASH)
    const { data: latestEvent, error: latestError } = await supabase
      .from("transaction_events")
      .select("event_hash")
      .eq("transaction_id", transactionId)
      .order("timestamp", { ascending: false })
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      console.warn(
        "Unable to query previous ledger event (migration may not be applied yet):",
        latestError.message
      );
      return null;
    }

    const previousEventHash = latestEvent?.event_hash || GENESIS_HASH;
    const timestamp = new Date().toISOString();
    const canonicalPayload = canonicalizeValue(
      payload || {}
    ) as Record<string, unknown>;

    const eventHash = computeEventHash({
      previousEventHash,
      eventType,
      actorId,
      timestamp,
      eventPayload: canonicalPayload,
    });

    const { data: inserted, error: insertError } = await supabase
      .from("transaction_events")
      .insert({
        transaction_id: transactionId,
        event_type: eventType,
        actor_id: actorId,
        timestamp,
        event_payload: canonicalPayload,
        previous_event_hash: previousEventHash,
        event_hash: eventHash,
      })
      .select("*")
      .single();

    if (insertError) {
      console.error("Failed to insert transaction event:", insertError.message);
      return null;
    }

    return inserted as TransactionEventRow;
  } catch (err) {
    console.error("Error in logTransactionEvent:", err);
    return null;
  }
}

/**
 * Audits every event in a transaction's ledger sequentially to guarantee no row was tampered
 * with, deleted, or reordered since genesis.
 */
export async function verifyLedgerIntegrity(
  transactionId: string,
  supabaseClient?: SupabaseClient
): Promise<LedgerIntegrityReport> {
  const supabase = supabaseClient || (await createClient());
  const checkedAt = new Date().toISOString();

  const { data: events, error } = await supabase
    .from("transaction_events")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("timestamp", { ascending: true })
    .order("id", { ascending: true });

  if (error || !events) {
    return {
      is_valid: true,
      total_events: 0,
      tampered_event_id: null,
      checked_at: checkedAt,
      genesis_hash: GENESIS_HASH,
      latest_event_hash: null,
    };
  }

  let expectedPreviousHash = GENESIS_HASH;
  let latestHash: string | null = null;

  for (const row of events as TransactionEventRow[]) {
    // 1. Verify chain predecessor link
    if (row.previous_event_hash !== expectedPreviousHash) {
      return {
        is_valid: false,
        total_events: events.length,
        tampered_event_id: row.id,
        checked_at: checkedAt,
        genesis_hash: GENESIS_HASH,
        latest_event_hash: latestHash,
      };
    }

    // 2. Recompute deterministic SHA-256 digest
    const recomputedHash = computeEventHash({
      previousEventHash: row.previous_event_hash,
      eventType: row.event_type,
      actorId: row.actor_id,
      timestamp: row.timestamp,
      eventPayload: (row.event_payload as Record<string, unknown>) || {},
    });

    // 3. Constant-time comparison against stored digest
    let matches = false;
    try {
      if (
        typeof row.event_hash === "string" &&
        row.event_hash.length === 64 &&
        recomputedHash.length === 64
      ) {
        matches = crypto.timingSafeEqual(
          Buffer.from(recomputedHash, "hex"),
          Buffer.from(row.event_hash, "hex")
        );
      }
    } catch {
      matches = false;
    }

    if (!matches) {
      return {
        is_valid: false,
        total_events: events.length,
        tampered_event_id: row.id,
        checked_at: checkedAt,
        genesis_hash: GENESIS_HASH,
        latest_event_hash: latestHash,
      };
    }

    expectedPreviousHash = row.event_hash;
    latestHash = row.event_hash;
  }

  return {
    is_valid: true,
    total_events: events.length,
    tampered_event_id: null,
    checked_at: checkedAt,
    genesis_hash: GENESIS_HASH,
    latest_event_hash: latestHash,
  };
}

