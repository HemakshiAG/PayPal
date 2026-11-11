import { z } from "zod";
import type {
  DisputeMediationEvidenceItem,
  DisputeMediationResult,
  TargetCaptureInfo,
} from "@/types/dispute";

const GEMINI_MEDIATOR_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash"] as const;

const EvidenceItemSchema = z.object({
  source: z
    .enum(["agreement", "chat", "proof_of_delivery", "payment", "claim"])
    .catch("claim"),
  reference: z.string().min(1).max(160),
  finding: z.string().min(1).max(400),
});

const GeminiMediationResponseSchema = z.object({
  headline: z.string().min(3).max(200),
  deficitPercent: z.number().min(0).max(100),
  rationale: z.string().min(10).max(1500),
  recommendedAction: z.string().min(5).max(500),
  recommendedReason: z.string().min(3).max(240),
  evidenceCitations: z.array(EvidenceItemSchema).max(6).default([]),
});

export interface DisputeMediationInput {
  transaction: {
    id: string;
    title: string;
    description?: string | null;
    category?: string | null;
    totalAmount: number;
    currency: string;
    status: string;
  };
  lockedAgreement: {
    id: string;
    versionNumber: number;
    contentHash: string;
    title?: string;
    sections?: unknown;
  } | null;
  confirmedTerms: Array<{
    termKey: string;
    termValue: string;
    category?: string | null;
  }>;
  messages: Array<{
    id: string;
    senderId: string;
    content: string;
    createdAt: string;
  }>;
  proofEvents: Array<{
    eventType: string;
    timestamp: string;
    payload: Record<string, unknown>;
  }>;
  targetCapture: TargetCaptureInfo;
  claimNotes?: string;
}

function extractJsonObject(rawText: string): unknown {
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
    throw new Error("Unable to extract JSON from Gemini mediator response.");
  }
}

function roundCurrency(value: number): number {
  return Number(Math.max(0, value).toFixed(2));
}

function formatMoney(amount: number, currency: string): string {
  const code = currency.toUpperCase();
  const symbol =
    code === "USD" ? "$" : code === "INR" ? "₹" : code === "EUR" ? "€" : `${code} `;
  return `${symbol}${amount.toFixed(2).replace(/\.00$/, "")}`;
}

function extractContractedQuantity(text: string): number | null {
  const patterns = [
    /(?:batch\s+of|quantity|qty|total\s+order|custom\s+batch|deliver\s+)[\s:=-]*(\d{1,5})\b/i,
    /\b(\d{1,5})\s+(?:custom\s+)?(?:hoodies|units|pcs|pieces|items|garments|shirts|jackets|boxes)\b/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }
  return null;
}

function detectShortageFromText(
  text: string,
  contractedQty: number | null
): {
  deficitPercent: number;
  headline: string;
  finding: string;
  reasonTag: string;
} | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // 1. Explicit "X missing / short / defective / damaged units"
  const missingMatch =
    /\b(\d{1,5})\s+(?:missing|short|undelivered|absent|defective|damaged|spoiled|misprinted)\s*(?:units|hoodies|pcs|pieces|items|garments|shirts)?\b/i.exec(
      trimmed
    );
  if (missingMatch?.[1]) {
    const count = Number(missingMatch[1]);
    const denom = contractedQty && contractedQty >= count ? contractedQty : 20;
    const pct = Math.min(100, Math.round((count / denom) * 1000) / 10);
    return {
      deficitPercent: pct,
      headline: `${count} missing/defective units detected = ${pct}% scope deficit`,
      finding: `Detected ${count} non-conforming or undelivered units against ${denom} contracted units (${pct}% scope deficit).`,
      reasonTag: `${count} missing/defective units (${pct}% scope deficit)`,
    };
  }

  // 2. "delivered 15 of 20" / "only 15 out of 20 arrived"
  const ofTotalMatch =
    /\b(?:only\s+)?(\d{1,5})\s*(?:of|out of|\/)\s*(\d{1,5})\s*(?:units|hoodies|pcs|pieces|items|received|delivered|arrived)?\b/i.exec(
      trimmed
    );
  if (ofTotalMatch?.[1] && ofTotalMatch?.[2]) {
    const delivered = Number(ofTotalMatch[1]);
    const total = Number(ofTotalMatch[2]);
    if (total > 0 && delivered < total) {
      const missing = total - delivered;
      const pct = Math.min(100, Math.round((missing / total) * 1000) / 10);
      return {
        deficitPercent: pct,
        headline: `${missing} missing units detected = ${pct}% scope deficit`,
        finding: `Delivery count (${delivered}/${total}) leaves a ${missing}-unit shortfall (${pct}% scope deficit).`,
        reasonTag: `${missing} undelivered units out of ${total} (${pct}% deficit)`,
      };
    }
  }

  // 3. Explicit percentage ("25% deficit", "20% refund", "15% damage")
  const pctMatch =
    /\b(\d{1,3}(?:\.\d+)?)\s*%\s*(?:deficit|shortage|shortfall|missing|defect|damage|refund|reduction|delay)\b/i.exec(
      trimmed
    );
  if (pctMatch?.[1]) {
    const pct = Math.min(100, Math.max(1, Number(pctMatch[1])));
    return {
      deficitPercent: pct,
      headline: `${pct}% contractual scope deficit verified`,
      finding: `Explicit ${pct}% variance/deficit reported against locked agreement specifications.`,
      reasonTag: `${pct}% scope deficit adjustment`,
    };
  }

  // 4. Semantic defect / delay signals without explicit numbers
  if (
    /\b(?:delay|late|overdue|missed\s+deadline|behind\s+schedule)\b/i.test(trimmed)
  ) {
    return {
      deficitPercent: 15,
      headline: "SLA dispatch delay detected = 15% milestone credit",
      finding:
        "Reported dispatch schedule breach against the locked delivery timeline warrants a 15% SLA remediation credit.",
      reasonTag: "15% SLA timeline delay remediation",
    };
  }

  if (
    /\b(?:defect|damaged|wrong\s+color|mismatch|misprint|stain|torn|quality\s+issue|discrepancy)\b/i.test(
      trimmed
    )
  ) {
    return {
      deficitPercent: 20,
      headline: "Deliverable specification mismatch = 20% quality credit",
      finding:
        "Physical/visual specification discrepancy identified relative to the locked agreement quality baseline.",
      reasonTag: "20% specification & quality remediation",
    };
  }

  return null;
}

function finalizeSettlement(
  raw: {
    headline: string;
    deficitPercent: number;
    rationale: string;
    recommendedAction: string;
    recommendedReason: string;
    evidenceCitations: DisputeMediationEvidenceItem[];
  },
  input: DisputeMediationInput,
  provider: "gemini-ai" | "deterministic-fallback"
): DisputeMediationResult {
  const { targetCapture, transaction } = input;
  const totalContractAmount =
    Number(transaction.totalAmount) > 0
      ? Number(transaction.totalAmount)
      : targetCapture.capturedAmount;

  const deficitPercent = Math.min(100, Math.max(0, Number(raw.deficitPercent.toFixed(1))));
  const computedProportionalRefund = roundCurrency(
    (totalContractAmount * deficitPercent) / 100
  );
  const proposedRefundAmount =
    deficitPercent <= 0
      ? 0
      : roundCurrency(
          Math.min(
            Math.max(0.01, computedProportionalRefund),
            targetCapture.maxRefundableAmount
          )
        );
  const proposedSellerRetentionAmount = roundCurrency(
    Math.max(0, targetCapture.capturedAmount - proposedRefundAmount)
  );

  const formattedRefund = formatMoney(proposedRefundAmount, targetCapture.currency);
  const baseHeadline = raw.headline.trim();
  const headline =
    proposedRefundAmount > 0 && !baseHeadline.includes(formattedRefund)
      ? `${baseHeadline} (${formattedRefund} refund)`
      : baseHeadline;

  return {
    headline,
    deficitPercent,
    proposedRefundAmount,
    proposedSellerRetentionAmount,
    capturedAmount: targetCapture.capturedAmount,
    maxRefundableAmount: targetCapture.maxRefundableAmount,
    totalContractAmount,
    currency: targetCapture.currency,
    rationale: raw.rationale.trim(),
    recommendedAction: raw.recommendedAction.trim(),
    recommendedReason: raw.recommendedReason.trim().slice(0, 240),
    evidenceCitations: raw.evidenceCitations,
    provider,
  };
}

export function deterministicDisputeMediation(
  input: DisputeMediationInput
): DisputeMediationResult {
  const agreementText = JSON.stringify({
    title: input.transaction.title,
    description: input.transaction.description,
    terms: input.confirmedTerms,
    sections: input.lockedAgreement?.sections ?? null,
  });

  const contractedQty = extractContractedQuantity(agreementText);
  const citations: DisputeMediationEvidenceItem[] = [];

  if (input.lockedAgreement) {
    citations.push({
      source: "agreement",
      reference: `Agreement v${input.lockedAgreement.versionNumber} (${input.lockedAgreement.contentHash.slice(
        0,
        12
      )}...)`,
      finding: `Locked contract total is ${formatMoney(
        input.transaction.totalAmount,
        input.transaction.currency
      )}${contractedQty ? ` across ${contractedQty} contracted units` : ""}.`,
    });
  }

  citations.push({
    source: "payment",
    reference: `PayPal Capture ${input.targetCapture.captureId}`,
    finding: `Captured balance ${formatMoney(
      input.targetCapture.capturedAmount,
      input.targetCapture.currency
    )} (${formatMoney(
      input.targetCapture.maxRefundableAmount,
      input.targetCapture.currency
    )} remaining refundable) on ${input.targetCapture.milestoneTitle}.`,
  });

  // Check inspector / buyer claim notes first, then proof events, then chat logs
  const claimDetection = input.claimNotes
    ? detectShortageFromText(input.claimNotes, contractedQty)
    : null;

  if (claimDetection && input.claimNotes) {
    citations.push({
      source: "claim",
      reference: "Dispute Claim Intake",
      finding: claimDetection.finding,
    });
    return finalizeSettlement(
      {
        headline: claimDetection.headline,
        deficitPercent: claimDetection.deficitPercent,
        rationale: `${claimDetection.finding} Applied proportionally to the ${formatMoney(
          input.transaction.totalAmount,
          input.transaction.currency
        )} locked order value, this yields an equitable partial refund from PayPal capture ${
          input.targetCapture.captureId
        } while releasing the remaining settled balance to the Seller.`,
        recommendedAction: `Execute a partial PayPal capture refund for ${claimDetection.reasonTag} and record settlement in the tamper-evident Evidence Vault.`,
        recommendedReason: `PACT AI Mediation: ${claimDetection.reasonTag}`,
        evidenceCitations: citations,
      },
      input,
      "deterministic-fallback"
    );
  }

  // Inspect Gemini Vision Proof-of-Delivery events
  const latestRejectedProof = [...input.proofEvents]
    .reverse()
    .find((ev) => ev.eventType === "proof_rejected");

  if (latestRejectedProof) {
    const summary = String(latestRejectedProof.payload.summary || "");
    const checklist = Array.isArray(latestRejectedProof.payload.specChecklist)
      ? (latestRejectedProof.payload.specChecklist as Array<{
          spec?: string;
          passed?: boolean;
          notes?: string;
        }>)
      : [];
    const failedChecks = checklist.filter((item) => item.passed === false);
    const proofText = [
      summary,
      ...failedChecks.map((f) => `${f.spec || ""} ${f.notes || ""}`),
    ].join(" ");
    const proofDetection = detectShortageFromText(proofText, contractedQty);
    const deficitPct = proofDetection
      ? proofDetection.deficitPercent
      : checklist.length > 0 && failedChecks.length > 0
      ? Math.round((failedChecks.length / checklist.length) * 1000) / 10
      : 25;

    citations.push({
      source: "proof_of_delivery",
      reference: "Gemini Vision Audit",
      finding:
        summary ||
        `${failedChecks.length} specification check(s) failed visual inspection.`,
    });

    return finalizeSettlement(
      {
        headline:
          proofDetection?.headline ||
          `Visual proof discrepancy detected = ${deficitPct}% scope deficit`,
        deficitPercent: deficitPct,
        rationale: `Gemini Vision flagged specification discrepancies against locked agreement requirements (${
          failedChecks.map((f) => f.spec).filter(Boolean).join(", ") ||
          "visual batch variance"
        }). Assessing a proportional ${deficitPct}% settlement refund compensates the Buyer while settling conforming deliverables.`,
        recommendedAction: `Issue a partial PayPal refund from ${input.targetCapture.captureId} matching the ${deficitPct}% verified discrepancy.`,
        recommendedReason:
          proofDetection?.reasonTag ||
          `PACT AI Mediation: ${deficitPct}% visual proof discrepancy`,
        evidenceCitations: citations,
      },
      input,
      "deterministic-fallback"
    );
  }

  // Scan recent chat messages for shortage / defect reports
  for (const msg of [...input.messages].reverse()) {
    const chatDetection = detectShortageFromText(msg.content, contractedQty);
    if (chatDetection) {
      citations.push({
        source: "chat",
        reference: `Chat Message (${new Date(msg.createdAt).toLocaleDateString()})`,
        finding: `"${msg.content.slice(0, 140)}${
          msg.content.length > 140 ? "..." : ""
        }" — ${chatDetection.finding}`,
      });

      return finalizeSettlement(
        {
          headline: chatDetection.headline,
          deficitPercent: chatDetection.deficitPercent,
          rationale: `Negotiation/delivery correspondence indicates a ${chatDetection.deficitPercent}% variance (${chatDetection.reasonTag}). Proportional settlement protects both parties against full chargeback escalation while compensating documented scope deficit.`,
          recommendedAction: `Process a partial PayPal capture refund on ${input.targetCapture.captureId} and anchor the settlement hash in the Evidence Vault.`,
          recommendedReason: `PACT AI Mediation: ${chatDetection.reasonTag}`,
          evidenceCitations: citations,
        },
        input,
        "deterministic-fallback"
      );
    }
  }

  // Clean workspace with no variance logged yet
  return finalizeSettlement(
    {
      headline: "No automatic deficit detected in logs",
      deficitPercent: 0,
      rationale:
        "All locked agreement terms, chat messages, and Proof-of-Delivery events currently align with no documented quantity shortage or quality breach. Enter delivery variance notes below (or choose a quick claim preset) to calculate a proportional PayPal partial refund.",
      recommendedAction:
        "Provide specific missing unit counts, defect observations, or SLA delay details to trigger proportional settlement mediation.",
      recommendedReason: "No variance reported",
      evidenceCitations: citations,
    },
    input,
    "deterministic-fallback"
  );
}

export async function mediateDisputeWithAI(
  input: DisputeMediationInput
): Promise<DisputeMediationResult> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;
  if (!apiKey) {
    return deterministicDisputeMediation(input);
  }

  const systemInstruction = [
    "You are PACT's Autonomous AI Dispute Mediator for commercial PayPal milestone contracts.",
    "Evaluate the locked agreement terms against chat logs, Proof-of-Delivery inspection logs, and any buyer/inspector claim notes.",
    "Compute an objective, fair proportional settlement.",
    "Example benchmark: If the locked agreement requires 20 units for $1,200 and evidence shows 5 missing units, output deficitPercent: 25, headline: '5 missing units detected = 25% scope deficit'.",
    "If no defect, shortage, delay, or breach exists in the claim notes, proof logs, or chat messages, set deficitPercent: 0 and explain clearly.",
    "",
    "Return ONLY valid JSON matching this exact shape:",
    JSON.stringify({
      headline: "5 missing units detected = 25% scope deficit",
      deficitPercent: 25,
      rationale: "2-4 sentence neutral explanation citing exact agreement clause vs delivery variance and proportional math.",
      recommendedAction: "1 sentence summarizing the recommended PayPal partial refund split.",
      recommendedReason: "Short PayPal note_to_payer summary under 140 chars.",
      evidenceCitations: [
        {
          source: "agreement",
          reference: "Locked Agreement v2",
          finding: "Contracted 20 Custom Hoodies totaling $1,200.",
        },
      ],
    }),
  ].join("\n");

  const contextPayload = {
    transaction: {
      title: input.transaction.title,
      category: input.transaction.category,
      totalAmount: input.transaction.totalAmount,
      currency: input.transaction.currency,
    },
    targetPayPalCapture: {
      captureId: input.targetCapture.captureId,
      capturedAmount: input.targetCapture.capturedAmount,
      maxRefundableAmount: input.targetCapture.maxRefundableAmount,
      milestoneTitle: input.targetCapture.milestoneTitle,
    },
    lockedAgreement: input.lockedAgreement
      ? {
          versionNumber: input.lockedAgreement.versionNumber,
          contentHash: input.lockedAgreement.contentHash,
          sections: input.lockedAgreement.sections,
        }
      : null,
    confirmedTerms: input.confirmedTerms.slice(0, 20),
    recentChatLogs: input.messages.slice(-25).map((m) => ({
      timestamp: m.createdAt,
      content: m.content,
    })),
    proofOfDeliveryEvents: input.proofEvents.slice(-5).map((ev) => ({
      eventType: ev.eventType,
      timestamp: ev.timestamp,
      summary: ev.payload.summary ?? null,
      specChecklist: ev.payload.specChecklist ?? null,
    })),
    inspectorOrBuyerClaimNotes: input.claimNotes?.trim() || null,
  };

  const userPrompt = [
    "Analyze the dispute evidence below and return the structured JSON mediation verdict:",
    JSON.stringify(contextPayload, null, 2),
  ].join("\n\n");

  for (const model of GEMINI_MEDIATOR_MODELS) {
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
            parts: [{ text: systemInstruction }],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.15,
            responseMimeType: "application/json",
          },
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return deterministicDisputeMediation(input);
        }
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

      const parsedJson = extractJsonObject(rawText);
      const validated = GeminiMediationResponseSchema.safeParse(parsedJson);
      if (!validated.success) continue;

      return finalizeSettlement(validated.data, input, "gemini-ai");
    } catch {
      continue;
    }
  }

  return deterministicDisputeMediation(input);
}

