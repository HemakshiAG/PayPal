/**
 * PACT Autonomous Zero-Shot AI Term Extraction Engine
 * Dynamically extracts deliverables, financial commitments, timelines, and
 * conditional clauses across any commercial domain using Gemini Structured Outputs,
 * with a deterministic compound-clause fallback parser when API keys are unavailable.
 *
 * NON-NEGOTIABLE SAFETY CONSTRAINTS:
 * - Rule 7: AI suggestions must never independently approve agreements or declare transactions legally valid.
 * - Rule 8: AI-extracted terms must retain original message references/quotes for auditability.
 */

import { MessageRow } from "@/types/database";
import {
  ExtractionItem,
  ExtractionResultPayload,
  ExtractionResultSchema,
} from "@/validations/term";
import { normalizeExtractedTermDraft } from "@/lib/terms/normalize";
import { resolveChronologicalDrafts } from "@/lib/terms/reconcile";

export const GEMINI_EXTRACTION_MODELS = [
  "gemini-2.0-flash",
  "gemini-1.5-flash",
] as const;

export const DYNAMIC_EXTRACTION_SYSTEM_PROMPT = `You are PACT AI, an autonomous financial contract extraction engine. 
Analyze the provided negotiation chat stream and dynamically extract every distinct agreed or proposed commercial term. 
Do NOT restrict extraction to specific industries or hardcoded terms. Dynamically detect:
- Deliverables & Specifications (items, services, quantities, technical specs, scope details)
- Financial Commitments (total budget, price per unit, upfront deposits, milestone breakdowns, retainer fees)
- Timeline & Deadlines (completion dates, delivery windows, milestone schedules)
- Conditional Rules (quality criteria, revision limits, dispute triggers, penalty clauses)

Rules for Dynamic Output:
1. Break down compound statements into separate, granular micro-terms (e.g., if a user states '$1,200 total with $400 upfront', extract 'Total Budget: $1,200' AND 'Upfront Deposit: $400' as distinct objects).
2. Dynamically assign each term a concise 'title' based on what was typed.
3. Include the exact 'source_quote' from the chat for auditability.
4. Assign a dynamic 'confidence_score' (0 to 100) based on how explicit the commitment is.`;

export const GEMINI_EXTRACTION_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    extracted_terms: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          category: {
            type: "STRING",
            enum: ["Specifications", "Financial", "Timeline", "Conditions"],
          },
          title: {
            type: "STRING",
          },
          term_value: {
            type: "STRING",
          },
          confidence_score: {
            type: "NUMBER",
          },
          source_quote: {
            type: "STRING",
          },
        },
        required: [
          "category",
          "title",
          "term_value",
          "confidence_score",
          "source_quote",
        ],
      },
    },
  },
  required: ["extracted_terms"],
} as const;

export interface DynamicExtractionOutput extends ExtractionResultPayload {
  provider: "gemini-ai" | "deterministic-fallback";
  modelUsed?: string;
}

type MessageLike = Pick<MessageRow, "id" | "content"> &
  Partial<MessageRow> & { message_text?: string };

function getUsableGeminiKey(): string | null {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_GEMINI_API_KEY,
    process.env.AI_API_KEY,
  ];
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (
      trimmed &&
      !trimmed.includes("your-gemini-api-key") &&
      !trimmed.includes("your-ai-api-key")
    ) {
      return trimmed;
    }
  }
  return null;
}

function getMessageText(m: MessageLike): string {
  return (m.content || m.message_text || "").trim();
}

function computeClauseConfidence(text: string, baseExplicit = 94): number {
  const lower = text.toLowerCase();
  if (/\b(agreed|confirm|confirmed|final|locked|will|must|exactly)\b/.test(lower)) {
    return Math.min(99, baseExplicit + 2);
  }
  if (/\b(maybe|probably|roughly|around|approx|tentative|could|might)\b/.test(lower)) {
    return 72;
  }
  if (/\b(if|subject to|provided that|assuming|depends)\b/.test(lower)) {
    return 82;
  }
  return baseExplicit;
}

function classifyFinancialMicroTerm(contextWindow: string): string {
  const lower = contextWindow.toLowerCase();
  const milestoneMatch = lower.match(/\bmilestone\s*(\d+|one|two|three)\b/);
  if (milestoneMatch) {
    return `Milestone ${milestoneMatch[1]} Payment`;
  }
  if (/\b(upfront|deposit|advance|down\s*payment|initial)\b/.test(lower)) {
    return "Upfront Deposit";
  }
  if (/\b(per\s*unit|unit\s*price|each|\/unit|\/hour|per\s*hour|per\s*item|hourly)\b/.test(lower)) {
    return "Price Per Unit / Rate";
  }
  if (/\b(retainer|monthly|\/month|per\s*month|recurring)\b/.test(lower)) {
    return "Retainer Fee";
  }
  if (/\b(remaining|balance|upon\s*completion|on\s*delivery|final\s*payment)\b/.test(lower)) {
    return "Remaining Balance";
  }
  if (/\b(penalty|late\s*fee|surcharge)\b/.test(lower)) {
    return "Penalty Fee";
  }
  return "Total Budget";
}

function getMoneyClauseSlice(
  text: string,
  index: number,
  length: number
): string {
  const prefixRaw = text.slice(Math.max(0, index - 32), index);
  const suffixRaw = text.slice(index + length, Math.min(text.length, index + length + 32));

  // Clip prefix after the nearest preceding clause delimiter or currency marker
  const prefixSep = /(?:[,;.]|\b(?:with|and|plus|total)\b|[$€£₹]\s*[\d,]+)/gi;
  let lastPrefixBoundary = 0;
  for (const m of prefixRaw.matchAll(prefixSep)) {
    lastPrefixBoundary = (m.index ?? 0) + m[0].length;
  }
  const prefixClause = prefixRaw.slice(lastPrefixBoundary);

  // Clip suffix before the nearest following clause delimiter or next currency marker
  const suffixSep = /(?:[,;.]|\b(?:with|and|plus|delivered|within|by|and)\b|[$€£₹]\s*[\d,]+)/i;
  const suffixMatch = suffixRaw.match(suffixSep);
  const suffixClause =
    suffixMatch && typeof suffixMatch.index === "number"
      ? suffixRaw.slice(0, suffixMatch.index)
      : suffixRaw;

  return `${prefixClause}${text.slice(index, index + length)}${suffixClause}`.trim();
}

/**
 * Domain-agnostic fallback extractor used when Gemini API keys are unconfigured
 * or rate-limited. Splits compound statements into granular micro-terms and
 * reconciles chronological revisions.
 */
export function dynamicFallbackExtractTerms(
  _transactionId: string,
  messages: MessageLike[]
): DynamicExtractionOutput {
  const rawDrafts: ExtractionItem[] = [];

  if (!messages || messages.length === 0) {
    return {
      terms: [],
      summaryNote: "No messages to extract terms from.",
      provider: "deterministic-fallback",
    };
  }

  for (const msg of messages) {
    const text = getMessageText(msg);
    if (!text) continue;

    const lower = text.toLowerCase();
    const msgConfidence = computeClauseConfidence(text, 92);

    // 1. Compound Financial Commitments (matches multiple amounts in one sentence)
    const moneyRegex =
      /(?:[$€£₹]\s*[\d,]+(?:\.\d{1,2})?(?:\s*(?:USD|INR|EUR|GBP|CAD))?|[\d,]+(?:\.\d{1,2})?\s*(?:USD|INR|EUR|dollars?|rupees))/gi;
    const seenPositions = new Set<number>();

    for (const match of text.matchAll(moneyRegex)) {
      const amount = match[0].trim();
      const idx = match.index ?? 0;
      if (seenPositions.has(idx)) continue;
      seenPositions.add(idx);

      const contextWindow = getMoneyClauseSlice(text, idx, amount.length);
      const title = classifyFinancialMicroTerm(contextWindow);
      const snippet = contextWindow;

      rawDrafts.push(
        normalizeExtractedTermDraft(
          {
            category: "Financial",
            title,
            term_value: amount,
            confidence_score: msgConfidence,
            source_quote: snippet,
            classification: /\b(if|subject to|assuming|might|could)\b/i.test(contextWindow)
              ? "inferred"
              : "explicitly_agreed",
            sourceMessageIds: [msg.id],
          },
          rawDrafts.length,
          messages
        )
      );
    }

    // 2. Deliverables & Specifications (domain-agnostic quantities + scope clauses)
    const qtyDeliverableRegex =
      /\b(\d{1,5})\s+(?!days?\b|weeks?\b|months?\b|hours?\b|mins?\b|minutes?\b|revisions?\b|iterations?\b|rounds?\b|percent\b|usd\b|inr\b|eur\b|gbp\b|cad\b|total\b|upfront\b|deposit\b|retainer\b|milestone\b|budget\b|price\b|cost\b|dollars?\b|rupees\b)([a-zA-Z][a-zA-Z0-9-]*(?:\s+[a-zA-Z][a-zA-Z0-9-]*){0,3})/gi;
    for (const match of text.matchAll(qtyDeliverableRegex)) {
      const phrase = match[0].trim();
      const idx = match.index ?? 0;
      const prevChar = idx > 0 ? text[idx - 1] : "";
      if (idx > 0 && /[$€£₹,.\d]/.test(prevChar)) {
        continue;
      }
      // Skip numbers belonging to calendar dates (e.g. "Dec 10")
      const prefix = text.slice(Math.max(0, idx - 12), idx).toLowerCase();
      if (/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*$/.test(prefix)) {
        continue;
      }

      rawDrafts.push(
        normalizeExtractedTermDraft(
          {
            category: "Specifications",
            title: "Deliverables & Quantity",
            term_value: phrase,
            confidence_score: msgConfidence,
            source_quote: phrase,
            classification: "explicitly_agreed",
            sourceMessageIds: [msg.id],
          },
          rawDrafts.length,
          messages
        )
      );
      break;
    }

    if (
      /\b(spec|specs|specification|format|resolution|uptime|architecture|stack|scope|deliverable|build|design|develop|produce|feature|integration)\b/i.test(
        text
      )
    ) {
      rawDrafts.push(
        normalizeExtractedTermDraft(
          {
            category: "Specifications",
            title: "Scope & Technical Specification",
            term_value: text.slice(0, 140),
            confidence_score: computeClauseConfidence(text, 88),
            source_quote: text.slice(0, 100),
            classification: /\b(could|maybe|suggest)\b/i.test(lower)
              ? "ai_recommended"
              : "explicitly_agreed",
            sourceMessageIds: [msg.id],
          },
          rawDrafts.length,
          messages
        )
      );
    }

    // 3. Timeline & Deadlines
    const durationMatch = text.match(
      /\b(?:within|in|by)\s+(\d+\s+(?:business\s+)?(?:hours?|days?|weeks?|months?)|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2})\b/i
    );
    if (durationMatch) {
      const value = durationMatch[0].trim();
      const isDraft = /\b(first draft|initial draft|mockup|prototype)\b/i.test(lower);
      const isConditional = /\b(if|subject to|provided that|assuming|depends)\b/i.test(lower);
      rawDrafts.push(
        normalizeExtractedTermDraft(
          {
            category: "Timeline",
            title: isDraft ? "First Draft Timeline" : "Delivery Deadline",
            term_value: isConditional ? `${value} (Conditional)` : value,
            confidence_score: isConditional ? 82 : msgConfidence,
            source_quote: value,
            classification: isConditional ? "inferred" : "explicitly_agreed",
            sourceMessageIds: [msg.id],
          },
          rawDrafts.length,
          messages
        )
      );
    }

    // 4. Conditional Rules (revisions, penalties, quality criteria, warranties, dispute rules)
    const revisionMatch = text.match(/\b(\d+|unlimited)\s+(revisions?|iterations?|rounds?)\b/i);
    if (revisionMatch) {
      rawDrafts.push(
        normalizeExtractedTermDraft(
          {
            category: "Conditions",
            title: "Revision Limit",
            term_value: revisionMatch[0].trim(),
            confidence_score: msgConfidence,
            source_quote: revisionMatch[0].trim(),
            classification: "explicitly_agreed",
            sourceMessageIds: [msg.id],
          },
          rawDrafts.length,
          messages
        )
      );
    }

    if (
      /\b(penalty|late fee|refund|cancellation|warranty|guarantee|quality|acceptance|inspection|dispute|ip rights|ownership|sla)\b/i.test(
        text
      )
    ) {
      const conditionTitle = /\b(penalty|late fee)\b/i.test(text)
        ? "Penalty Clause"
        : /\b(refund|cancellation)\b/i.test(text)
        ? "Cancellation & Refund Policy"
        : /\b(warranty|guarantee)\b/i.test(text)
        ? "Warranty Terms"
        : "Quality & Acceptance Criteria";

      rawDrafts.push(
        normalizeExtractedTermDraft(
          {
            category: "Conditions",
            title: conditionTitle,
            term_value: text.slice(0, 140),
            confidence_score: computeClauseConfidence(text, 87),
            source_quote: text.slice(0, 100),
            classification: /\bagree/i.test(lower) ? "explicitly_agreed" : "inferred",
            sourceMessageIds: [msg.id],
          },
          rawDrafts.length,
          messages
        )
      );
    }
  }

  const reconciled = resolveChronologicalDrafts(rawDrafts);

  return {
    terms: reconciled,
    summaryNote: `Fallback extraction reconciled ${reconciled.length} granular commercial terms across ${messages.length} messages.`,
    provider: "deterministic-fallback",
  };
}

/**
 * Backward-compatible alias for `dynamicFallbackExtractTerms`.
 */
export const heuristicExtractTerms = dynamicFallbackExtractTerms;

function extractJsonPayload(rawText: string): unknown {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("Malformed JSON payload from Gemini");
  }
}

/**
 * 100% Dynamic Zero-Shot AI Term Extractor powered by Gemini (`gemini-2.0-flash` / `gemini-1.5-flash`)
 * with schema-enforced JSON output (`extracted_terms`) and in-memory revision resolution.
 */
export async function extractTermsFromConversation(
  transactionId: string,
  messages: MessageLike[]
): Promise<DynamicExtractionOutput> {
  if (!messages || messages.length === 0) {
    return {
      terms: [],
      summaryNote: "No conversation history available for extraction.",
      provider: "deterministic-fallback",
    };
  }

  const apiKey = getUsableGeminiKey();
  if (!apiKey) {
    return dynamicFallbackExtractTerms(transactionId, messages);
  }

  const transcript = messages
    .map((m, idx) => {
      const speaker =
        m.sender_id ? `Sender:${m.sender_id.slice(0, 8)}` : `Msg#${idx + 1}`;
      return `[${idx + 1}] (${speaker}) ${getMessageText(m)}`;
    })
    .join("\n");

  for (const model of GEMINI_EXTRACTION_MODELS) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(
        apiKey
      )}`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: DYNAMIC_EXTRACTION_SYSTEM_PROMPT }],
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Negotiation Chat Stream (chronological order):\n${transcript}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema: GEMINI_EXTRACTION_RESPONSE_SCHEMA,
          },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          console.warn("[extract-terms] Gemini rate limited (429), using fallback parser.");
          return dynamicFallbackExtractTerms(transactionId, messages);
        }
        console.warn(`[extract-terms] Gemini model ${model} returned status ${response.status}.`);
        continue;
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
      };

      const rawText =
        data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("")
          .trim() || "";

      if (!rawText) continue;

      const parsed = extractJsonPayload(rawText) as {
        extracted_terms?: unknown[];
        terms?: unknown[];
      };

      const rawTerms = Array.isArray(parsed?.extracted_terms)
        ? parsed.extracted_terms
        : Array.isArray(parsed?.terms)
        ? parsed.terms
        : Array.isArray(parsed)
        ? (parsed as unknown[])
        : [];

      if (rawTerms.length === 0) {
        continue;
      }

      const normalizedTerms = rawTerms.map((rawTerm, index) =>
        normalizeExtractedTermDraft(rawTerm, index, messages)
      );

      // Run in-memory chronological deduplication & revision detection before validation
      const resolvedTerms = resolveChronologicalDrafts(normalizedTerms);

      const validated = ExtractionResultSchema.safeParse({
        terms: resolvedTerms,
        summaryNote: `Dynamic zero-shot extraction (${model}) extracted ${resolvedTerms.length} commercial terms.`,
      });

      if (!validated.success) {
        console.warn(
          `[extract-terms] Schema validation failed for ${model}:`,
          validated.error.issues?.[0]?.message
        );
        continue;
      }

      return {
        ...validated.data,
        provider: "gemini-ai",
        modelUsed: model,
      };
    } catch (err) {
      console.warn(`[extract-terms] Gemini error on model ${model}:`, err);
      continue;
    }
  }

  return dynamicFallbackExtractTerms(transactionId, messages);
}
