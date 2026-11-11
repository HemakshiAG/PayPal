/**
 * Scenario Coverage Score Engine
 * PACT Phase 3: Predictive Scenario Engine & Mutual Contingency Resolution System
 */

import {
  ScenarioCategory,
  ScenarioCoverageMetrics,
} from "@/types/scenario";
import { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const ALL_SCENARIO_CATEGORIES: ScenarioCategory[] = [
  "timeline_delay",
  "scope_dispute",
  "material_shortage",
  "quality_rejection",
  "cost_escalation",
  "cancellation",
];

export const CATEGORY_LABELS: Record<ScenarioCategory, string> = {
  timeline_delay: "Timeline Delays",
  scope_dispute: "Scope & Revisions",
  material_shortage: "Material Availability",
  quality_rejection: "Quality Standards",
  cost_escalation: "Cost Escalation",
  cancellation: "Cancellation Policy",
};

/**
 * Pure function to calculate coverage metrics from an array of scenarios.
 */
export function computeScenarioCoverage(
  scenarios: Array<{ category: string; status: string }>
): ScenarioCoverageMetrics {
  const totalCount = scenarios.length;
  const resolvedCount = scenarios.filter((s) => s.status === "resolved").length;
  const openCount = totalCount - resolvedCount;

  const categoryBreakdown: Record<ScenarioCategory, { total: number; resolved: number }> = {
    timeline_delay: { total: 0, resolved: 0 },
    scope_dispute: { total: 0, resolved: 0 },
    material_shortage: { total: 0, resolved: 0 },
    quality_rejection: { total: 0, resolved: 0 },
    cost_escalation: { total: 0, resolved: 0 },
    cancellation: { total: 0, resolved: 0 },
  };

  scenarios.forEach((s) => {
    const cat = s.category as ScenarioCategory;
    if (categoryBreakdown[cat]) {
      categoryBreakdown[cat].total += 1;
      if (s.status === "resolved") {
        categoryBreakdown[cat].resolved += 1;
      }
    }
  });

  const score = totalCount === 0 ? 0 : Math.round((resolvedCount / totalCount) * 100);

  let readinessTag: "vulnerable" | "moderate" | "resilient" = "vulnerable";
  if (score >= 75) {
    readinessTag = "resilient";
  } else if (score >= 40) {
    readinessTag = "moderate";
  }

  return {
    score,
    resolvedCount,
    totalCount,
    openCount,
    categoryBreakdown,
    readinessTag,
    disclaimer:
      "Scenario Coverage reflects mutual contingency preparedness against anticipated complications. It is an operational assurance score and does not constitute a legal guarantee or warranty.",
  };
}

/**
 * Server-side helper to fetch scenarios for a transaction and compute coverage.
 */
export async function calculateScenarioCoverage(
  transactionId: string,
  client?: SupabaseClient
): Promise<ScenarioCoverageMetrics> {
  const supabase = client ?? (await createClient());
  const { data: scenarios, error } = await supabase
    .from("scenarios")
    .select("category, status")
    .eq("transaction_id", transactionId);

  if (error || !scenarios) {
    return computeScenarioCoverage([]);
  }

  return computeScenarioCoverage(scenarios);
}

