/**
 * PACT Predictive AI Scenario Engine
 * Phase 3: Predictive Scenario Engine & Mutual Contingency Resolution System
 *
 * NON-NEGOTIABLE SAFETY CONSTRAINTS:
 * - Rule 7: AI suggestions must never independently approve agreements or alter payment status.
 * - Consequence chains model realistic commercial friction before transaction lock.
 */

import { MessageRow, ExtractedTermRow } from "@/types/database";
import {
  ScenarioCategory,
  ScenarioSeverity,
  ConsequenceStep,
  RecommendedResolution,
} from "@/types/scenario";

export interface TransactionContext {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  totalAmount?: number;
  currency?: string;
}

export interface GeneratedScenarioPayload {
  category: ScenarioCategory;
  title: string;
  description: string;
  severity: ScenarioSeverity;
  consequenceChain: ConsequenceStep[];
  recommendedResolutions: RecommendedResolution[];
}

/**
 * Deterministic fallback scenario generator tailored for custom commerce,
 * bespoke goods, custom apparel, and freelance deliverables.
 */
export function generateDeterministicScenarios(
  tx: TransactionContext,
  terms: ExtractedTermRow[],
  _messages: MessageRow[]
): GeneratedScenarioPayload[] {
  const currency = tx.currency || "INR";
  const symbol = currency === "INR" ? "₹" : "$";
  const titleLower = (tx.title + " " + (tx.description || "")).toLowerCase();

  // Inspect terms to identify key constraints
  const timelineTerm = terms.find((t) => t.category === "timeline");
  const priceTerm = terms.find((t) => t.category === "financial");
  const budget = tx.totalAmount || (priceTerm ? parseFloat(priceTerm.term_value.replace(/[^0-9.]/g, "")) : 15000);

  const scenarios: GeneratedScenarioPayload[] = [];

  // 1. Material Shortage / Supply Disruption
  const isApparelOrPhysical =
    titleLower.includes("jacket") ||
    titleLower.includes("leather") ||
    titleLower.includes("dress") ||
    titleLower.includes("shoe") ||
    titleLower.includes("fabric") ||
    titleLower.includes("furniture") ||
    titleLower.includes("craft") ||
    titleLower.includes("print");

  scenarios.push({
    category: "material_shortage",
    title: isApparelOrPhysical
      ? "Raw Material / Fabric Stockout"
      : "Third-Party Asset / API Dependency Delay",
    description: isApparelOrPhysical
      ? "Primary raw material or custom hardware becomes temporarily out of stock from the supplier during initial procurement."
      : "Required third-party design assets, licenses, or development environments are delayed in hand-off.",
    severity: "high",
    consequenceChain: [
      {
        step: 1,
        title: "Supplier Stockout Notification",
        description: "Supplier confirms specified material grade is backordered by 7 business days.",
        delayDays: 3,
        actor: "seller",
      },
      {
        step: 2,
        title: "Alternative Swatch Submission",
        description: "Seller pauses fabrication and presents verified premium substitute swatch to Buyer.",
        delayDays: 1,
        actor: "seller",
      },
      {
        step: 3,
        title: "Production Halt",
        description: "Workshop production stands paused pending Buyer review to prevent wasted labor.",
        delayDays: 2,
        actor: "system",
      },
      {
        step: 4,
        title: "Mutual Resolution Trigger",
        description: "Buyer and Seller agree on either substitute acceptance or revised delivery milestone.",
        actor: "buyer",
      },
    ],
    recommendedResolutions: [
      {
        id: "res-mat-1",
        title: "Approve Premium Substitute (Zero Cost)",
        action: "Buyer approves equivalent or superior alternative material with 3-day timeline extension and ₹0 price impact.",
        priceImpactType: "none",
        priceImpactValue: 0,
        timelineImpactDays: 3,
      },
      {
        id: "res-mat-2",
        title: "Wait for Original Supply with Timeline Extension",
        action: "Buyer elects to wait for original batch. Delivery timeline extended by 8 days; seller waives packing fees.",
        priceImpactType: "none",
        priceImpactValue: 0,
        timelineImpactDays: 8,
      },
      {
        id: "res-mat-3",
        title: "Material Surcharge Partial Credit",
        action: "Seller procures expedited emergency supply; buyer and seller split the express surcharge 50/50.",
        priceImpactType: "additional_cost",
        priceImpactValue: Math.round(budget * 0.05),
        timelineImpactDays: 1,
      },
    ],
  });

  // 2. Timeline Slippage & Milestone Delay
  scenarios.push({
    category: "timeline_delay",
    title: "Production Milestone Slippage",
    description: timelineTerm
      ? `Promised timeline (${timelineTerm.term_value}) risks slippage due to unexpected iteration cycles or curing time.`
      : "Production or delivery milestone slips past target date due to complex finishing steps.",
    severity: "medium",
    consequenceChain: [
      {
        step: 1,
        title: "Milestone Deadline Approaching",
        description: "Seller assesses that quality benchmarks require additional finishing iterations.",
        delayDays: 2,
        actor: "seller",
      },
      {
        step: 2,
        title: "Advance Delay Notice",
        description: "Seller provides formal early notification with photo progress evidence.",
        actor: "seller",
      },
      {
        step: 3,
        title: "Milestone Extension Request",
        description: "Requested extension of 4 calendar days to guarantee final inspection standards.",
        delayDays: 4,
        actor: "seller",
      },
      {
        step: 4,
        title: "Buyer Approval & Courier Upgrade",
        description: "Buyer accepts revised schedule in exchange for complimentary expedited courier dispatch.",
        actor: "buyer",
      },
    ],
    recommendedResolutions: [
      {
        id: "res-time-1",
        title: "Standard Extension with Express Dispatch",
        action: "Grant 4-day delivery extension. Seller upgrades shipping to priority air express at seller's expense.",
        priceImpactType: "none",
        priceImpactValue: 0,
        timelineImpactDays: 4,
      },
      {
        id: "res-time-2",
        title: "Timeline Extension with 5% Courtesy Credit",
        action: "Grant 6-day extension with 5% discount applied against the final milestone disbursement.",
        priceImpactType: "discount",
        priceImpactValue: Math.round(budget * 0.05),
        timelineImpactDays: 6,
      },
    ],
  });

  // 3. Scope Expansion & Revision Ambiguity
  scenarios.push({
    category: "scope_dispute",
    title: "Unbounded Iterative Modification Request",
    description: "Buyer requests design, sizing, or styling modifications that exceed baseline specifications discussed in chat.",
    severity: "medium",
    consequenceChain: [
      {
        step: 1,
        title: "Change Request Logged",
        description: "Buyer submits alterations to previously confirmed design details.",
        actor: "buyer",
      },
      {
        step: 2,
        title: "Impact Assessment",
        description: "Seller calculates material rework requirement (+3 days, additional unit cost).",
        delayDays: 3,
        costImpact: Math.round(budget * 0.1),
        actor: "seller",
      },
      {
        step: 3,
        title: "Contingency Mediation",
        description: "PACT prompts both parties to formalize revision allowance before implementing alterations.",
        actor: "system",
      },
    ],
    recommendedResolutions: [
      {
        id: "res-scope-1",
        title: "Included Minor Adjustment (Capped)",
        action: "Seller accommodates one minor finishing adjustment with zero price change and 2 days extension.",
        priceImpactType: "none",
        priceImpactValue: 0,
        timelineImpactDays: 2,
      },
      {
        id: "res-scope-2",
        title: "Paid Scope Amendment",
        action: `Buyer authorizes comprehensive modifications for an additional ${symbol}${Math.round(budget * 0.1)} milestone and +5 days.`,
        priceImpactType: "additional_cost",
        priceImpactValue: Math.round(budget * 0.1),
        timelineImpactDays: 5,
      },
    ],
  });

  // 4. Quality Inspection / Specification Variance
  scenarios.push({
    category: "quality_rejection",
    title: "Delivery Inspection Variance Claim",
    description: "Delivered product exhibits measurement, colorway, or finishing tolerance variance during buyer inspection window.",
    severity: "critical",
    consequenceChain: [
      {
        step: 1,
        title: "Delivery & Inspection Window Opens",
        description: "Buyer receives consignment; 48-hour inspection countdown begins.",
        actor: "buyer",
      },
      {
        step: 2,
        title: "Evidence Submission",
        description: "Buyer records photo/video measurement proof directly to PACT Evidence Vault.",
        actor: "buyer",
      },
      {
        step: 3,
        title: "Tolerance Review",
        description: "Parties compare uploaded proof against mutually agreed contract specifications.",
        actor: "system",
      },
      {
        step: 4,
        title: "Remedy Execution",
        description: "Parties execute pre-agreed remedy (free alteration vs. partial discount).",
        actor: "seller",
      },
    ],
    recommendedResolutions: [
      {
        id: "res-qual-1",
        title: "Free Alteration & Return Transit",
        action: "Seller receives item back for alteration/refitting; seller covers two-way shipping costs (+7 days).",
        priceImpactType: "none",
        priceImpactValue: 0,
        timelineImpactDays: 7,
      },
      {
        id: "res-qual-2",
        title: "As-Is Retention with 15% Settlement Credit",
        action: `Buyer retains deliverable as-is; seller grants a 15% (${symbol}${Math.round(budget * 0.15)}) rebate on the final milestone.`,
        priceImpactType: "discount",
        priceImpactValue: Math.round(budget * 0.15),
        timelineImpactDays: 0,
      },
    ],
  });

  // 5. Unforeseen Force Majeure / Mutual Cancellation
  scenarios.push({
    category: "cancellation",
    title: "Mid-Production Cancellation Request",
    description: "Either party encounters critical unforeseen events necessitating mid-transaction termination.",
    severity: "critical",
    consequenceChain: [
      {
        step: 1,
        title: "Cancellation Trigger",
        description: "Formal cancellation notification filed before final milestone dispatch.",
        actor: "buyer",
      },
      {
        step: 2,
        title: "Work-in-Progress Assessment",
        description: "Seller audits sunk material costs and completed crafting milestones.",
        actor: "seller",
      },
      {
        step: 3,
        title: "Equitable Settlement",
        description: "Sunk costs reimbursed from deposit; unspent milestone balance released back to buyer.",
        actor: "system",
      },
    ],
    recommendedResolutions: [
      {
        id: "res-canc-1",
        title: "Prorated Sunk Cost Settlement",
        action: "Buyer pays 35% deposit covering verified raw materials already cut; remaining 65% milestone liability cancelled.",
        priceImpactType: "refund",
        priceImpactValue: Math.round(budget * 0.65),
        timelineImpactDays: 0,
      },
      {
        id: "res-canc-2",
        title: "Store Credit / Future Completion Voucher",
        action: "Transaction paused for up to 90 days with balance preserved as non-expiring credit voucher.",
        priceImpactType: "none",
        priceImpactValue: 0,
        timelineImpactDays: 90,
      },
    ],
  });

  return scenarios;
}

/**
 * Predictive Scenario Generator invoking Gemini 2.5 Flash when API key is configured,
 * with graceful fallback to deterministic scenario modeling.
 */
export async function generatePredictiveScenarios(
  tx: TransactionContext,
  terms: ExtractedTermRow[],
  messages: MessageRow[]
): Promise<GeneratedScenarioPayload[]> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY;

  if (!apiKey) {
    return generateDeterministicScenarios(tx, terms, messages);
  }

  try {
    const prompt = `You are PACT's Predictive Scenario Engine for custom commerce transactions.
Analyze this transaction context and generate 4-5 anticipated complications with concrete multi-step consequence chains and realistic contingency resolutions.

Transaction Title: ${tx.title}
Description: ${tx.description || "N/A"}
Category: ${tx.category || "Custom Commerce"}
Budget: ${tx.currency || "INR"} ${tx.totalAmount || "Variable"}

Agreed Terms so far:
${terms.map((t) => `- [${t.category}] ${t.term_key}: ${t.term_value} (${t.classification})`).join("\n") || "No formal terms extracted yet."}

Recent Conversation:
${messages.slice(-10).map((m) => `Message: "${m.content}"`).join("\n") || "No chat history."}

Return a valid JSON object matching this schema:
{
  "scenarios": [
    {
      "category": "timeline_delay" | "scope_dispute" | "material_shortage" | "quality_rejection" | "cost_escalation" | "cancellation",
      "title": "string",
      "description": "string",
      "severity": "low" | "medium" | "high" | "critical",
      "consequenceChain": [
        { "step": 1, "title": "string", "description": "string", "delayDays": 0, "costImpact": 0, "actor": "buyer" | "seller" | "system" }
      ],
      "recommendedResolutions": [
        { "id": "res-1", "title": "string", "action": "string", "priceImpactType": "none" | "additional_cost" | "discount" | "refund", "priceImpactValue": 0, "timelineImpactDays": 0 }
      ]
    }
  ]
}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2,
          },
        }),
      }
    );

    if (!res.ok) {
      console.warn("Gemini API call failed, falling back to deterministic scenarios:", res.statusText);
      return generateDeterministicScenarios(tx, terms, messages);
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return generateDeterministicScenarios(tx, terms, messages);
    }

    const parsed = JSON.parse(rawText);
    if (Array.isArray(parsed.scenarios) && parsed.scenarios.length > 0) {
      return parsed.scenarios;
    }

    return generateDeterministicScenarios(tx, terms, messages);
  } catch (err) {
    console.error("Predictive scenario AI generation error, using fallback:", err);
    return generateDeterministicScenarios(tx, terms, messages);
  }
}

