/**
 * Scenario & Contingency Resolution Domain Models
 * PACT Phase 3: Predictive Scenario Engine & Mutual Contingency Resolution System
 */

export type ScenarioCategory =
  | "timeline_delay"
  | "scope_dispute"
  | "material_shortage"
  | "quality_rejection"
  | "cost_escalation"
  | "cancellation";

export type ScenarioSeverity = "low" | "medium" | "high" | "critical";

export type ScenarioStatus = "open" | "resolving" | "resolved" | "dismissed";

export type PriceImpactType = "none" | "additional_cost" | "discount" | "refund";

export type ResolutionStatus = "draft" | "accepted" | "rejected";

export interface ConsequenceStep {
  step: number;
  title: string;
  description: string;
  delayDays?: number;
  costImpact?: number;
  actor?: "buyer" | "seller" | "system";
}

export interface RecommendedResolution {
  id: string;
  title: string;
  action: string;
  priceImpactType: PriceImpactType;
  priceImpactValue: number;
  timelineImpactDays: number;
}

export interface ScenarioResolution {
  id: string;
  scenarioId: string;
  transactionId: string;
  proposedBy: string;
  agreedAction: string;
  priceImpactType: PriceImpactType;
  priceImpactValue: number;
  timelineImpactDays: number;
  buyerApproved: boolean;
  sellerApproved: boolean;
  buyerApprovedAt?: string | null;
  sellerApprovedAt?: string | null;
  status: ResolutionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PredictiveScenario {
  id: string;
  transactionId: string;
  category: ScenarioCategory;
  title: string;
  description: string;
  severity: ScenarioSeverity;
  consequenceChain: ConsequenceStep[];
  recommendedResolutions: RecommendedResolution[];
  status: ScenarioStatus;
  createdAt: string;
  updatedAt: string;
  resolutions?: ScenarioResolution[];
  activeResolution?: ScenarioResolution | null;
}

export interface ScenarioCoverageMetrics {
  score: number; // 0 to 100 percentage
  resolvedCount: number;
  totalCount: number;
  openCount: number;
  categoryBreakdown: Record<ScenarioCategory, { total: number; resolved: number }>;
  readinessTag: "vulnerable" | "moderate" | "resilient";
  disclaimer: string;
}

