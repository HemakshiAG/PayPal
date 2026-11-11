/**
 * PACT Agreement Drift Detection Intelligence
 * Phase 6: Agreement Drift Detection Engine
 *
 * Compares newly sent conversation messages against the locked/active agreement version
 * to flag informal off-contract changes before silent scope or schedule drift occurs.
 *
 * NON-NEGOTIABLE RULE 7 & 9:
 * AI drift detection alerts participants only; it never silently overwrites approved agreements.
 */

import { z } from "zod";
import { AgreementSection } from "@/types/agreement";
import { ExtractedTermRow } from "@/types/database";

export interface DetectedDriftCandidate {
  termKey: string;
  originalValue: string;
  proposedValue: string;
  confidenceScore: number;
  category: "timeline" | "financial" | "specification" | "condition";
}

export interface DriftAnalysisResult {
  hasDrift: boolean;
  alerts: DetectedDriftCandidate[];
}

const DriftCandidateSchema = z.object({
  hasDrift: z.boolean(),
  alerts: z
    .array(
      z.object({
        termKey: z.string(),
        originalValue: z.string(),
        proposedValue: z.string(),
        confidenceScore: z.number().min(0).max(1),
        category: z
          .enum(["timeline", "financial", "specification", "condition"])
          .default("condition"),
      })
    )
    .default([]),
});

function extractOriginalTermValue(
  category: "timeline" | "financial" | "specification" | "condition",
  confirmedTerms: ExtractedTermRow[],
  sections: AgreementSection[]
): string {
  const matchedConfirmed = confirmedTerms.find((t) => t.category === category);
  if (matchedConfirmed) {
    return `${matchedConfirmed.term_key}: ${matchedConfirmed.term_value}`;
  }

  const sectionMap: Record<string, string> = {
    timeline: "delivery_timeline",
    financial: "financial_milestones",
    specification: "technical_specs",
    condition: "scope_deliverables",
  };

  const targetSection = sections.find((s) => s.sectionId === sectionMap[category]);
  if (targetSection && targetSection.items.length > 0) {
    return targetSection.items[0].content.slice(0, 140);
  }

  return "Locked Active Agreement Provision";
}

/**
 * Deterministic rule-based drift detector used when Gemini API keys are omitted
 * or as a resilient fallback.
 */
export function heuristicDetectAgreementDrift(params: {
  messageContent: string;
  sections: AgreementSection[];
  confirmedTerms: ExtractedTermRow[];
}): DriftAnalysisResult {
  const text = params.messageContent.trim();
  const lower = text.toLowerCase();
  const alerts: DetectedDriftCandidate[] = [];

  if (text.length < 6) {
    return { hasDrift: false, alerts: [] };
  }

  const hasChangeCue =
    lower.includes("instead") ||
    lower.includes("shift") ||
    lower.includes("change") ||
    lower.includes("postpone") ||
    lower.includes("delay") ||
    lower.includes("reschedule") ||
    lower.includes("move to") ||
    lower.includes("extend") ||
    lower.includes("push to") ||
    lower.includes("switch") ||
    lower.includes("replace") ||
    lower.includes("update") ||
    lower.includes("increase") ||
    lower.includes("reduce") ||
    lower.includes("extra") ||
    lower.includes("new price") ||
    lower.includes("make it");

  if (!hasChangeCue) {
    return { hasDrift: false, alerts: [] };
  }

  // 1. Timeline Drift Check
  const timelineCue =
    lower.includes("deliver") ||
    lower.includes("deadline") ||
    lower.includes("schedule") ||
    lower.includes("dec") ||
    lower.includes("jan") ||
    lower.includes("feb") ||
    lower.includes("mar") ||
    lower.includes("apr") ||
    lower.includes("may") ||
    lower.includes("jun") ||
    lower.includes("jul") ||
    lower.includes("aug") ||
    lower.includes("sep") ||
    lower.includes("oct") ||
    lower.includes("nov") ||
    lower.includes("days") ||
    lower.includes("week") ||
    lower.includes("date");

  if (timelineCue) {
    const dateMatch = text.match(
      /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?|\d{1,2}\s+(?:days?|weeks?)/i
    );
    const proposedTimeline = dateMatch ? dateMatch[0] : text.slice(0, 110);
    const original = extractOriginalTermValue(
      "timeline",
      params.confirmedTerms,
      params.sections
    );

    if (!original.toLowerCase().includes(proposedTimeline.toLowerCase())) {
      alerts.push({
        termKey: "Delivery Schedule",
        originalValue: original,
        proposedValue: `Proposed shift in chat: "${proposedTimeline}" — "${text.slice(0, 120)}"`,
        confidenceScore: dateMatch ? 0.91 : 0.82,
        category: "timeline",
      });
    }
  }

  // 2. Financial / Price Drift Check
  const priceMatch = text.match(
    /(?:(?:rs\.?|inr|₹|\$)\s*([\d,]+(?:\.\d{2})?)|([\d,]+(?:\.\d{2})?)\s*(?:inr|rs\.?|₹|usd|\$|rupees))/i
  );
  if (
    priceMatch ||
    lower.includes("price") ||
    lower.includes("cost") ||
    lower.includes("budget") ||
    lower.includes("fee") ||
    lower.includes("payment")
  ) {
    const proposedPrice = priceMatch ? priceMatch[0] : text.slice(0, 110);
    const original = extractOriginalTermValue(
      "financial",
      params.confirmedTerms,
      params.sections
    );
    if (!original.toLowerCase().includes(proposedPrice.toLowerCase())) {
      alerts.push({
        termKey: "Agreed Price / Budget",
        originalValue: original,
        proposedValue: `Proposed financial change: "${proposedPrice}" — "${text.slice(0, 120)}"`,
        confidenceScore: priceMatch ? 0.92 : 0.8,
        category: "financial",
      });
    }
  }

  // 3. Specification / Scope Drift Check
  const specCue =
    lower.includes("material") ||
    lower.includes("color") ||
    lower.includes("size") ||
    lower.includes("fabric") ||
    lower.includes("spec") ||
    lower.includes("design") ||
    lower.includes("feature") ||
    lower.includes("scope") ||
    lower.includes("switch") ||
    lower.includes("replace");

  if (specCue && alerts.length === 0) {
    const original = extractOriginalTermValue(
      "specification",
      params.confirmedTerms,
      params.sections
    );
    alerts.push({
      termKey: "Specification / Scope",
      originalValue: original,
      proposedValue: `Proposed modification: "${text.slice(0, 130)}"`,
      confidenceScore: 0.84,
      category: "specification",
    });
  }

  return {
    hasDrift: alerts.length > 0,
    alerts,
  };
}

/**
 * Analyzes a newly posted message against the active approved agreement version ($V_n$).
 * Uses Gemini 2.5 Flash structured JSON output when available, with deterministic heuristic fallback.
 */
export async function detectAgreementDrift(params: {
  transactionId: string;
  messageContent: string;
  activeVersionNumber: number;
  sections: AgreementSection[];
  confirmedTerms: ExtractedTermRow[];
}): Promise<DriftAnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (!apiKey) {
    return heuristicDetectAgreementDrift({
      messageContent: params.messageContent,
      sections: params.sections,
      confirmedTerms: params.confirmedTerms,
    });
  }

  try {
    const activeTermsSummary = params.confirmedTerms
      .map((t) => `- [${t.category}] ${t.term_key}: ${t.term_value}`)
      .join("\n");

    const sectionsSummary = params.sections
      .slice(0, 5)
      .map(
        (s) =>
          `${s.title}: ${s.items.map((i) => i.content).join(" | ").slice(0, 220)}`
      )
      .join("\n");

    const systemPrompt = `You are the PACT Agreement Drift Detection Engine.
Compare a newly sent chat message against locked Agreement Version V${params.activeVersionNumber}.
Identify ONLY genuine proposals or requests that modify committed pricing, timelines, deliverables, or specifications.
Do NOT invent drift for routine status updates or friendly acknowledgements.

Locked Confirmed Terms:
${activeTermsSummary || "None explicitly listed"}

Contract Section Context:
${sectionsSummary}

Output strictly valid JSON:
{
  "hasDrift": boolean,
  "alerts": [
    {
      "termKey": "string",
      "originalValue": "string",
      "proposedValue": "string",
      "confidenceScore": number (0.0 to 1.0),
      "category": "timeline" | "financial" | "specification" | "condition"
    }
  ]
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: systemPrompt },
                { text: `New Chat Message:\n${params.messageContent}` },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        }),
      }
    );

    if (!response.ok) {
      return heuristicDetectAgreementDrift({
        messageContent: params.messageContent,
        sections: params.sections,
        confirmedTerms: params.confirmedTerms,
      });
    }

    const data = await response.json();
    const rawJson = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) {
      return heuristicDetectAgreementDrift({
        messageContent: params.messageContent,
        sections: params.sections,
        confirmedTerms: params.confirmedTerms,
      });
    }

    const parsed = JSON.parse(rawJson);
    const validated = DriftCandidateSchema.safeParse(parsed);
    if (!validated.success) {
      return heuristicDetectAgreementDrift({
        messageContent: params.messageContent,
        sections: params.sections,
        confirmedTerms: params.confirmedTerms,
      });
    }

    return validated.data;
  } catch (err) {
    console.warn("Drift AI error, using heuristic drift detector:", err);
    return heuristicDetectAgreementDrift({
      messageContent: params.messageContent,
      sections: params.sections,
      confirmedTerms: params.confirmedTerms,
    });
  }
}

