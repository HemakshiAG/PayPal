import type {
  ExtractedTerm,
  ExtractedTermItemPayload,
  TermCategory,
  TermClassification,
  TermStatus,
} from "@/types/term";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface MessageLike {
  id?: string | null;
  content?: string | null;
  message_text?: string | null;
}

function asNonEmptyString(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

/**
 * Normalizes category labels (e.g. "Financial", "Specifications", "Conditions")
 * into canonical Supabase enum values while keeping unknown entries under "specification".
 */
export function normalizeTermCategory(raw: unknown): TermCategory {
  const normalized = asNonEmptyString(raw).toLowerCase();
  if (normalized.startsWith("finan") || normalized === "budget" || normalized === "price") {
    return "financial";
  }
  if (normalized.startsWith("time") || normalized === "schedule" || normalized === "delivery") {
    return "timeline";
  }
  if (normalized.startsWith("cond") || normalized === "warranty" || normalized === "policy") {
    return "condition";
  }
  return "specification";
}

export function toCategoryLabel(category: TermCategory): string {
  switch (category) {
    case "financial":
      return "Financial";
    case "timeline":
      return "Timeline";
    case "condition":
      return "Conditions";
    case "specification":
    default:
      return "Specifications";
  }
}

export function normalizeTermStatus(raw: unknown): TermStatus {
  const normalized = asNonEmptyString(raw).toLowerCase();
  if (normalized === "confirmed" || normalized === "accepted" || normalized === "approved") {
    return "confirmed";
  }
  if (normalized === "rejected" || normalized === "declined") {
    return "rejected";
  }
  if (normalized === "revised" || normalized === "updated" || normalized === "amended") {
    return "revised";
  }
  return "pending";
}

export function normalizeTermClassification(
  raw: unknown,
  hasSource = false
): TermClassification {
  const normalized = asNonEmptyString(raw).toLowerCase();
  if (
    normalized === "explicitly_agreed" ||
    normalized === "inferred" ||
    normalized === "ai_recommended" ||
    normalized === "unresolved" ||
    normalized === "disputed"
  ) {
    return normalized;
  }
  return hasSource ? "explicitly_agreed" : "inferred";
}

/**
 * Normalizes confidence across both 0..1 DB decimals (e.g. 0.95) and 1..100 percentages (e.g. 95),
 * guaranteeing a finite integer in 1..100 and never returning NaN.
 */
export function normalizeConfidencePercent(raw: unknown, fallback = 90): number {
  let numeric = NaN;
  if (typeof raw === "number") {
    numeric = raw;
  } else if (typeof raw === "string") {
    numeric = parseFloat(raw.replace(/%/g, "").trim());
  }

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }

  const pct = numeric <= 1 ? numeric * 100 : numeric;
  return Math.max(1, Math.min(100, Math.round(pct)));
}

/**
 * Converts a percentage (or 0..1 score) into a PostgreSQL NUMERIC(4,2)-safe decimal (0.01..1.00).
 */
export function toDbConfidenceScore(raw: unknown, fallback = 0.9): number {
  const pct = normalizeConfidencePercent(raw, Math.round(fallback * 100));
  return Number((pct / 100).toFixed(2));
}

function resolveSourceMessageIds(
  raw: Record<string, unknown>,
  sourceQuote: string,
  messages: MessageLike[] = []
): string[] {
  const validMsgIds = new Set(
    messages.map((m) => m.id).filter((id): id is string => isUuid(id))
  );

  const rawCandidates = raw.sourceMessageIds ?? raw.source_message_ids;
  const fromArray = Array.isArray(rawCandidates)
    ? rawCandidates.filter(
        (id): id is string =>
          isUuid(id) && (validMsgIds.size === 0 || validMsgIds.has(id))
      )
    : [];

  if (fromArray.length > 0) {
    return Array.from(new Set(fromArray));
  }

  if (sourceQuote && messages.length > 0) {
    const needle = sourceQuote.toLowerCase();
    const matched = messages
      .filter((m) => {
        const text = (m.content || m.message_text || "").toLowerCase();
        return isUuid(m.id) && text.includes(needle);
      })
      .map((m) => m.id as string);

    if (matched.length > 0) {
      return Array.from(new Set(matched));
    }
  }

  return [];
}

/**
 * Normalizes a raw Gemini or heuristic extracted term before persistence and API return.
 */
export function normalizeExtractedTermDraft(
  rawInput: unknown,
  index = 0,
  messages: MessageLike[] = []
): ExtractedTermItemPayload {
  const raw =
    rawInput && typeof rawInput === "object"
      ? (rawInput as Record<string, unknown>)
      : {};

  const title =
    asNonEmptyString(raw.title) ||
    asNonEmptyString(raw.name) ||
    asNonEmptyString(raw.term_key) ||
    asNonEmptyString(raw.termKey) ||
    "Extracted Scope";

  const termValue =
    asNonEmptyString(raw.term_value) ||
    asNonEmptyString(raw.value) ||
    asNonEmptyString(raw.details) ||
    asNonEmptyString(raw.termValue) ||
    "Not specified";

  const confidencePercent = normalizeConfidencePercent(
    raw.confidence_score ?? raw.confidence ?? raw.confidenceScore,
    90
  );

  const category = normalizeTermCategory(raw.category);
  const sourceQuote =
    asNonEmptyString(raw.source_quote) || asNonEmptyString(raw.sourceQuote);
  const sourceMessageIds = resolveSourceMessageIds(raw, sourceQuote, messages);
  const classification = normalizeTermClassification(
    raw.classification,
    sourceMessageIds.length > 0 || Boolean(sourceQuote)
  );
  const status = normalizeTermStatus(raw.status);

  return {
    id: asNonEmptyString(raw.id) || `term_${index + 1}`,
    termKey: title,
    termValue,
    title,
    term_value: termValue,
    category,
    classification,
    confidenceScore: toDbConfidenceScore(confidencePercent),
    confidence_score: confidencePercent,
    status:
      status === "revised"
        ? "REVISED"
        : status === "pending"
        ? "PENDING"
        : status,
    source_quote: sourceQuote || undefined,
    sourceMessageIds,
  };
}

/**
 * Normalizes any DB row (`term_key`, `term_value`, 0..1 `confidence_score`), API payload
 * (`title`, `term_value`, 1..100 `confidence_score`), or camelCase UI object into a
 * single hydration- and fallback-safe `ExtractedTerm` shape.
 */
export function normalizeTermForClient(
  rawInput: unknown,
  index = 0
): ExtractedTerm {
  const raw =
    rawInput && typeof rawInput === "object"
      ? (rawInput as Record<string, unknown>)
      : {};

  const title =
    asNonEmptyString(raw.title) ||
    asNonEmptyString(raw.name) ||
    asNonEmptyString(raw.termKey) ||
    asNonEmptyString(raw.term_key) ||
    "Specification";

  const termValue =
    asNonEmptyString(raw.term_value) ||
    asNonEmptyString(raw.value) ||
    asNonEmptyString(raw.details) ||
    asNonEmptyString(raw.termValue) ||
    "Not specified";

  const confidencePercent = normalizeConfidencePercent(
    raw.confidence_score ?? raw.confidence ?? raw.confidenceScore,
    90
  );

  const sourceCandidates = raw.sourceMessageIds ?? raw.source_message_ids;
  const sourceMessageIds = Array.isArray(sourceCandidates)
    ? sourceCandidates.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  const sourceQuote =
    asNonEmptyString(raw.source_quote) || asNonEmptyString(raw.sourceQuote) || undefined;

  return {
    id: asNonEmptyString(raw.id) || `term_${index + 1}`,
    transactionId:
      asNonEmptyString(raw.transactionId) || asNonEmptyString(raw.transaction_id),
    sourceMessageIds,
    termKey: title,
    termValue,
    title,
    term_key: title,
    term_value: termValue,
    category: normalizeTermCategory(raw.category),
    classification: normalizeTermClassification(
      raw.classification,
      sourceMessageIds.length > 0 || Boolean(sourceQuote)
    ),
    confidenceScore: toDbConfidenceScore(confidencePercent),
    confidence_score: confidencePercent,
    confidence: confidencePercent,
    status: normalizeTermStatus(raw.status),
    source_quote: sourceQuote,
    createdAt: asNonEmptyString(raw.createdAt) || asNonEmptyString(raw.created_at),
    updatedAt: asNonEmptyString(raw.updatedAt) || asNonEmptyString(raw.updated_at),
  };
}

