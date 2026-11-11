import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedTermRow } from "@/types/database";
import type {
  ExtractedTerm,
  ExtractedTermItemPayload,
  TermCategory,
  TermStatus,
} from "@/types/term";
import {
  isUuid,
  normalizeTermCategory,
  normalizeTermForClient,
  toDbConfidenceScore,
} from "@/lib/terms/normalize";

export interface ReconciledDraft extends ExtractedTermItemPayload {
  revisedInBatch?: boolean;
}

export interface ExistingTermRecord {
  id: string;
  transaction_id: string;
  source_message_ids: string[] | null;
  term_key: string;
  term_value: string;
  category: string;
  classification: string;
  confidence_score: number;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface ReconciledTermOutput extends ExtractedTerm {
  apiStatus: "PENDING" | "REVISED" | "confirmed" | "rejected";
}

export interface ReconcileTermsPlan {
  toInsert: Array<{
    draft: ReconciledDraft;
    row: {
      transaction_id: string;
      source_message_ids: string[];
      term_key: string;
      term_value: string;
      category: TermCategory;
      classification: ExtractedTermItemPayload["classification"];
      confidence_score: number;
      status: "pending" | "revised";
    };
  }>;
  toUpdate: Array<{
    existingId: string;
    draft: ReconciledDraft;
    markRevised: boolean;
    patch: {
      term_value: string;
      category: TermCategory;
      confidence_score: number;
      source_message_ids: string[];
      status: "pending" | "confirmed" | "rejected" | "revised";
    };
  }>;
  revisedDraftKeys: Set<string>;
  matchedExistingIds: Set<string>;
}

const STOP_WORDS = new Set([
  "agreed",
  "proposed",
  "project",
  "contract",
  "term",
  "clause",
  "detail",
  "details",
  "requirement",
  "requirements",
  "commitment",
  "the",
  "and",
  "for",
  "with",
  "of",
  "on",
  "in",
  "to",
  "a",
  "an",
]);

const ROLE_QUALIFIERS = [
  "upfront",
  "deposit",
  "advance",
  "retainer",
  "unit",
  "each",
  "milestone",
  "installment",
  "penalty",
  "late",
  "refund",
  "cancellation",
  "warranty",
  "revision",
  "draft",
  "mockup",
  "initial",
  "first",
  "final",
  "remaining",
  "balance",
] as const;

function tokenizeTitle(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/['"`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0 && !STOP_WORDS.has(token));
}

/**
 * Computes a semantic entity key within a category so synonymous titles
 * (e.g. "Total Budget" vs "Agreed Price / Budget") resolve cleanly while
 * granular sub-terms ("Total Budget" vs "Upfront Deposit" vs "Milestone 1") stay separate.
 */
export function getCanonicalEntityKey(
  category: TermCategory,
  title: string
): string | null {
  const lower = title.toLowerCase();
  const normalized = lower.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  if (category === "financial") {
    const milestoneMatch = normalized.match(/\bmilestone\s*(\d+|one|two|three|first|second|final)\b/);
    if (milestoneMatch) {
      return `financial::milestone_${milestoneMatch[1]}`;
    }
    if (/\b(upfront|advance|down\s*payment|initial\s*deposit|deposit)\b/.test(normalized)) {
      return "financial::upfront_deposit";
    }
    if (/\b(remaining|final\s*balance|balance\s*due|completion\s*payment)\b/.test(normalized)) {
      return "financial::remaining_balance";
    }
    if (/\b(per\s*unit|unit\s*price|unit\s*cost|each|per\s*item|hourly\s*rate|rate)\b/.test(normalized)) {
      return "financial::unit_price";
    }
    if (/\b(retainer|monthly\s*fee|recurring)\b/.test(normalized)) {
      return "financial::retainer_fee";
    }
    if (/\b(penalty|late\s*fee|surcharge)\b/.test(normalized)) {
      return "financial::penalty_fee";
    }
    if (
      /\b(total|budget|price|cost|contract\s*sum|contract\s*value|quote|amount|pricing)\b/.test(
        normalized
      )
    ) {
      return "financial::total_budget";
    }
  }

  if (category === "timeline") {
    const milestoneMatch = normalized.match(/\bmilestone\s*(\d+|one|two|three)\b/);
    if (milestoneMatch) {
      return `timeline::milestone_${milestoneMatch[1]}`;
    }
    if (/\b(first\s*draft|initial\s*draft|mockup|prototype|kickoff)\b/.test(normalized)) {
      return "timeline::initial_draft";
    }
    if (
      /\b(delivery|deadline|completion|timeline|schedule|turnaround|window|eta|due\s*date|dispatch)\b/.test(
        normalized
      )
    ) {
      return "timeline::delivery_schedule";
    }
  }

  if (category === "condition") {
    if (/\b(revision|revisions|iteration|edits|changes)\b/.test(normalized)) {
      return "condition::revision_limit";
    }
    if (/\b(penalty|delay\s*fee|liquidated\s*damages|sla\s*credit)\b/.test(normalized)) {
      return "condition::penalty_clause";
    }
    if (/\b(refund|cancellation|termination)\b/.test(normalized)) {
      return "condition::refund_cancellation";
    }
    if (/\b(warranty|guarantee|defect)\b/.test(normalized)) {
      return "condition::warranty_guarantee";
    }
    if (/\b(ip|intellectual\s*property|ownership|copyright|license)\b/.test(normalized)) {
      return "condition::ip_rights";
    }
    if (/\b(acceptance|inspection|quality|qa|approval)\b/.test(normalized)) {
      return "condition::quality_acceptance";
    }
  }

  return null;
}

export function areSameTermEntity(
  categoryA: TermCategory,
  titleA: string,
  categoryB: TermCategory,
  titleB: string
): boolean {
  if (categoryA !== categoryB) return false;

  const keyA = getCanonicalEntityKey(categoryA, titleA);
  const keyB = getCanonicalEntityKey(categoryB, titleB);
  if (keyA && keyB) {
    return keyA === keyB;
  }

  const tokensA = tokenizeTitle(titleA);
  const tokensB = tokenizeTitle(titleB);
  if (tokensA.length === 0 || tokensB.length === 0) return false;

  const slugA = tokensA.join("_");
  const slugB = tokensB.join("_");
  if (slugA === slugB) return true;

  // Never merge terms with differing explicit numeric indices (e.g. Phase 1 vs Phase 2)
  const numsA = tokensA.filter((t) => /^\d+$/.test(t)).join(",");
  const numsB = tokensB.filter((t) => /^\d+$/.test(t)).join(",");
  if (numsA !== numsB) return false;

  // Never merge terms if one carries an asymmetric role qualifier
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  for (const qualifier of ROLE_QUALIFIERS) {
    if (setA.has(qualifier) !== setB.has(qualifier)) {
      return false;
    }
  }

  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) {
      intersection += 1;
    }
  }

  const union = setA.size + setB.size - intersection;
  const minSize = Math.min(setA.size, setB.size);
  if (minSize === 0 || union === 0) return false;

  const overlapCoeff = intersection / minSize;
  const jaccard = intersection / union;
  return overlapCoeff >= 0.75 && jaccard >= 0.55;
}

function parsePureCurrencyNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  const match = cleaned.match(
    /^(?:[$€£₹]|usd|inr|eur|rs\.?)?\s*([\d,]+(?:\.\d{1,2})?)\s*(?:[$€£₹]|usd|inr|eur|rs\.?|dollars?|rupees)?$/i
  );
  if (!match) return null;
  const parsed = Number.parseFloat(match[1].replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function areValuesEquivalent(valueA: string, valueB: string): boolean {
  const a = valueA.trim();
  const b = valueB.trim();
  if (!a || !b) return a === b;
  if (a.toLowerCase() === b.toLowerCase()) return true;

  const numA = parsePureCurrencyNumber(a);
  const numB = parsePureCurrencyNumber(b);
  if (numA !== null && numB !== null) {
    return Math.abs(numA - numB) < 0.005;
  }

  const normA = a
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const normB = b
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return normA === normB;
}

function mergeMessageIds(a: string[] = [], b: string[] = []): string[] {
  return Array.from(new Set([...a, ...b].filter((id) => isUuid(id))));
}

/**
 * Step 1 of Entity Resolution: resolves chronological duplicates/revisions
 * produced within a single AI or fallback extraction pass.
 */
export function resolveChronologicalDrafts(
  drafts: ExtractedTermItemPayload[]
): ReconciledDraft[] {
  const resolved: ReconciledDraft[] = [];

  for (const incoming of drafts) {
    const incomingCategory = normalizeTermCategory(incoming.category);
    const incomingTitle = incoming.title || incoming.termKey;
    const incomingValue = incoming.term_value || incoming.termValue;

    const existingIdx = resolved.findIndex((candidate) =>
      areSameTermEntity(
        normalizeTermCategory(candidate.category),
        candidate.title || candidate.termKey,
        incomingCategory,
        incomingTitle
      )
    );

    if (existingIdx < 0) {
      resolved.push({
        ...incoming,
        category: incomingCategory,
        revisedInBatch:
          incoming.status === "REVISED" || incoming.status === "revised",
      });
      continue;
    }

    const current = resolved[existingIdx];
    const currentValue = current.term_value || current.termValue;
    const mergedIds = mergeMessageIds(
      current.sourceMessageIds,
      incoming.sourceMessageIds
    );
    const changed = !areValuesEquivalent(currentValue, incomingValue);

    if (changed) {
      resolved[existingIdx] = {
        ...current,
        title: incomingTitle || current.title,
        termKey: incoming.termKey || current.termKey,
        termValue: incomingValue,
        term_value: incomingValue,
        confidenceScore: incoming.confidenceScore,
        confidence_score: incoming.confidence_score,
        classification: incoming.classification,
        source_quote: incoming.source_quote || current.source_quote,
        sourceMessageIds: mergedIds,
        status: "REVISED",
        revisedInBatch: true,
      };
    } else {
      resolved[existingIdx] = {
        ...current,
        source_quote: current.source_quote || incoming.source_quote,
        sourceMessageIds: mergedIds,
        confidence_score: Math.max(
          current.confidence_score ?? 0,
          incoming.confidence_score ?? 0
        ) || current.confidence_score,
        confidenceScore: Math.max(
          current.confidenceScore,
          incoming.confidenceScore
        ),
      };
    }
  }

  return resolved;
}

function getDraftKey(category: TermCategory, title: string): string {
  return (
    getCanonicalEntityKey(category, title) ||
    `${category}::${tokenizeTitle(title).join("_") || title.toLowerCase()}`
  );
}

/**
 * Step 2 of Entity Resolution: reconciles resolved incoming terms against
 * existing database rows so term modifications update the existing row to REVISED
 * rather than spawning duplicate cards.
 */
export function buildReconciliationPlan(
  transactionId: string,
  drafts: ReconciledDraft[],
  existingTerms: ExistingTermRecord[],
  validDbMessageIds: Set<string> = new Set()
): ReconcileTermsPlan {
  const toInsert: ReconcileTermsPlan["toInsert"] = [];
  const toUpdate: ReconcileTermsPlan["toUpdate"] = [];
  const revisedDraftKeys = new Set<string>();
  const matchedExistingIds = new Set<string>();

  for (const draft of drafts) {
    const category = normalizeTermCategory(draft.category);
    const title = draft.title || draft.termKey;
    const value = draft.term_value || draft.termValue;
    const validIds = (draft.sourceMessageIds || []).filter(
      (id) => isUuid(id) && (validDbMessageIds.size === 0 || validDbMessageIds.has(id))
    );

    const matchingRows = existingTerms.filter((row) =>
      areSameTermEntity(
        normalizeTermCategory(row.category),
        row.term_key,
        category,
        title
      )
    );

    if (matchingRows.length === 0) {
      const isBatchRevision = Boolean(draft.revisedInBatch);
      if (isBatchRevision) {
        revisedDraftKeys.add(getDraftKey(category, title));
      }
      toInsert.push({
        draft,
        row: {
          transaction_id: transactionId,
          source_message_ids: validIds,
          term_key: title,
          term_value: value,
          category,
          classification: draft.classification,
          confidence_score: toDbConfidenceScore(
            draft.confidence_score ?? draft.confidenceScore,
            0.9
          ),
          status: isBatchRevision ? "revised" : "pending",
        },
      });
      continue;
    }

    // Prefer an exact-value match first, otherwise take the latest matching record
    const exactMatch = matchingRows.find((row) =>
      areValuesEquivalent(row.term_value, value)
    );
    const target = exactMatch || matchingRows[0];
    matchedExistingIds.add(target.id);

    const valueChanged = !areValuesEquivalent(target.term_value, value);
    const mergedSourceIds = mergeMessageIds(
      target.source_message_ids || [],
      validIds
    );

    if (valueChanged) {
      revisedDraftKeys.add(getDraftKey(category, title));
      toUpdate.push({
        existingId: target.id,
        draft,
        markRevised: true,
        patch: {
          term_value: value,
          category,
          confidence_score: toDbConfidenceScore(
            draft.confidence_score ?? draft.confidenceScore,
            0.9
          ),
          source_message_ids: mergedSourceIds,
          status: "revised",
        },
      });
    } else {
      if (
        draft.revisedInBatch &&
        target.status !== "confirmed" &&
        target.status !== "rejected"
      ) {
        revisedDraftKeys.add(getDraftKey(category, title));
      }
      if (mergedSourceIds.length > (target.source_message_ids?.length || 0)) {
        toUpdate.push({
          existingId: target.id,
          draft,
          markRevised: target.status.toLowerCase() === "revised",
          patch: {
            term_value: target.term_value,
            category: normalizeTermCategory(target.category),
            confidence_score: Number(target.confidence_score) || 0.9,
            source_message_ids: mergedSourceIds,
            status: target.status.toLowerCase() as
              | "pending"
              | "confirmed"
              | "rejected"
              | "revised",
          },
        });
      }
    }
  }

  return {
    toInsert,
    toUpdate,
    revisedDraftKeys,
    matchedExistingIds,
  };
}

function isStatusConstraintError(errorMessage?: string | null): boolean {
  if (!errorMessage) return false;
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes("extracted_terms_status_check") ||
    (lower.includes("check constraint") && lower.includes("status"))
  );
}

/**
 * Executes in-memory entity resolution & persistence against `extracted_terms`
 * with resilient DB constraint fallback so `REVISED` updates always surface cleanly.
 */
export async function persistAndReconcileExtractedTerms(params: {
  supabase: SupabaseClient;
  transactionId: string;
  drafts: ExtractedTermItemPayload[];
  validDbMessageIds?: Set<string>;
}): Promise<{
  terms: ReconciledTermOutput[];
  newTermsCount: number;
  revisedTermsCount: number;
}> {
  const { supabase, transactionId, drafts, validDbMessageIds } = params;
  const resolvedDrafts = resolveChronologicalDrafts(drafts);

  const { data: existingData } = await supabase
    .from("extracted_terms")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("updated_at", { ascending: false });

  const existingRows = (existingData || []) as ExistingTermRecord[];
  const plan = buildReconciliationPlan(
    transactionId,
    resolvedDrafts,
    existingRows,
    validDbMessageIds
  );

  let insertedCount = 0;
  let revisedCount = 0;
  const revisedRowIds = new Set<string>();

  for (const item of plan.toUpdate) {
    if (item.markRevised) {
      revisedRowIds.add(item.existingId);
    }

    const { error: updateErr } = await supabase
      .from("extracted_terms")
      .update(item.patch)
      .eq("id", item.existingId);

    if (updateErr && item.patch.status === "revised" && isStatusConstraintError(updateErr.message)) {
      const { error: fallbackErr } = await supabase
        .from("extracted_terms")
        .update({ ...item.patch, status: "pending" })
        .eq("id", item.existingId);

      if (fallbackErr) {
        console.warn("[extract-terms] Failed fallback term update:", fallbackErr.message);
      } else if (item.markRevised) {
        revisedCount += 1;
      }
    } else if (updateErr) {
      console.warn("[extract-terms] Failed updating revised term:", updateErr.message);
    } else if (item.markRevised) {
      revisedCount += 1;
    }
  }

  if (plan.toInsert.length > 0) {
    const insertPayload = plan.toInsert.map((entry) => entry.row);
    const { data: insertedRows, error: insertErr } = await supabase
      .from("extracted_terms")
      .insert(insertPayload)
      .select("id, status");

    if (
      insertErr &&
      insertPayload.some((r) => r.status === "revised") &&
      isStatusConstraintError(insertErr.message)
    ) {
      const safePayload = insertPayload.map((r) => ({
        ...r,
        status: r.status === "revised" ? ("pending" as const) : r.status,
      }));
      const { data: fallbackInserted, error: fallbackErr } = await supabase
        .from("extracted_terms")
        .insert(safePayload)
        .select("id");

      if (fallbackErr) {
        console.error("[extract-terms] Failed to insert extracted terms:", fallbackErr);
      } else {
        insertedCount = fallbackInserted?.length ?? safePayload.length;
      }
    } else if (insertErr) {
      console.error("[extract-terms] Failed to insert extracted terms:", insertErr);
    } else {
      insertedCount = insertedRows?.length ?? insertPayload.length;
      for (const r of insertedRows || []) {
        if ((r as { status?: string }).status === "revised") {
          revisedRowIds.add((r as { id: string }).id);
          revisedCount += 1;
        }
      }
    }
  }

  const { data: refreshedRows } = await supabase
    .from("extracted_terms")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false });

  // Deduplicate any historical duplicate entities in memory before returning to client
  const seenEntities = new Set<string>();
  const quoteByEntity = new Map<string, string>();
  for (const draft of resolvedDrafts) {
    if (draft.source_quote) {
      quoteByEntity.set(
        getDraftKey(
          normalizeTermCategory(draft.category),
          draft.title || draft.termKey
        ),
        draft.source_quote
      );
    }
  }

  const rawRows: unknown[] =
    refreshedRows && refreshedRows.length > 0
      ? (refreshedRows as ExtractedTermRow[])
      : resolvedDrafts;

  const outputTerms: ReconciledTermOutput[] = [];

  for (let idx = 0; idx < rawRows.length; idx += 1) {
    const base = normalizeTermForClient(rawRows[idx], idx);
    const entityKey = getDraftKey(
      normalizeTermCategory(base.category),
      base.title || base.termKey
    );

    if (seenEntities.has(entityKey)) {
      continue;
    }
    seenEntities.add(entityKey);

    const matchedQuote = quoteByEntity.get(entityKey);
    const isRevised =
      revisedRowIds.has(base.id) ||
      base.status === "revised" ||
      (plan.revisedDraftKeys.has(entityKey) &&
        base.status !== "confirmed" &&
        base.status !== "rejected");

    const normalizedStatus: TermStatus = isRevised ? "revised" : base.status;
    const apiStatus: ReconciledTermOutput["apiStatus"] =
      normalizedStatus === "revised"
        ? "REVISED"
        : normalizedStatus === "pending"
        ? "PENDING"
        : normalizedStatus;

    outputTerms.push({
      ...base,
      status: normalizedStatus,
      apiStatus,
      source_quote: base.source_quote || matchedQuote,
    });
  }

  return {
    terms: outputTerms,
    newTermsCount: insertedCount,
    revisedTermsCount: revisedCount,
  };
}
