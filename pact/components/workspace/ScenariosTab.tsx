"use strict";
import * as React from "react";
import {
  PredictiveScenario,
  ScenarioCoverageMetrics,
  ScenarioSeverity,
  ScenarioStatus,
  ScenarioCategory,
} from "@/types/scenario";
import { ScenarioCard } from "./ScenarioCard";
import { ScenarioResolutionModal } from "./ScenarioResolutionModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  RotateCw,
  Search,
  Info,
} from "lucide-react";

interface ScenariosTabProps {
  transactionId: string;
  initialScenarios: PredictiveScenario[];
  initialCoverage: ScenarioCoverageMetrics;
  currentUserRole: "buyer" | "seller" | "observer";
  currencySymbol?: string;
}

export function ScenariosTab({
  transactionId,
  initialScenarios,
  initialCoverage,
  currentUserRole,
  currencySymbol = "₹",
}: ScenariosTabProps) {
  const [scenarios, setScenarios] = React.useState<PredictiveScenario[]>(initialScenarios);
  const [coverage, setCoverage] = React.useState<ScenarioCoverageMetrics>(initialCoverage);
  const [isGenerating, setIsGenerating] = React.useState(false);
  const [selectedSeverity, setSelectedSeverity] = React.useState<string>("all");
  const [selectedStatus, setSelectedStatus] = React.useState<string>("all");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [activeModalScenario, setActiveModalScenario] = React.useState<PredictiveScenario | null>(null);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [messageNotice, setMessageNotice] = React.useState<string | null>(null);

  const handleGenerateScenarios = async () => {
    setIsGenerating(true);
    setMessageNotice(null);

    try {
      const res = await fetch("/api/ai/generate-scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate scenarios");
      }

      // Map Supabase rows to PredictiveScenario interfaces
      const mappedScenarios: PredictiveScenario[] = (data.scenarios || []).map((s: Record<string, unknown>) => {
        const resolutions = (s.scenario_resolutions as Array<Record<string, unknown>>) || [];
        const activeRes = resolutions.length > 0 ? {
          id: resolutions[0].id as string,
          scenarioId: resolutions[0].scenario_id as string,
          transactionId: resolutions[0].transaction_id as string,
          proposedBy: resolutions[0].proposed_by as string,
          agreedAction: resolutions[0].agreed_action as string,
          priceImpactType: resolutions[0].price_impact_type as "none" | "additional_cost" | "discount" | "refund",
          priceImpactValue: Number(resolutions[0].price_impact_value) || 0,
          timelineImpactDays: Number(resolutions[0].timeline_impact_days) || 0,
          buyerApproved: Boolean(resolutions[0].buyer_approved),
          sellerApproved: Boolean(resolutions[0].seller_approved),
          buyerApprovedAt: resolutions[0].buyer_approved_at as string | null,
          sellerApprovedAt: resolutions[0].seller_approved_at as string | null,
          status: resolutions[0].status as "draft" | "accepted" | "rejected",
          createdAt: resolutions[0].created_at as string,
          updatedAt: resolutions[0].updated_at as string,
        } : null;

        return {
          id: s.id as string,
          transactionId: s.transaction_id as string,
          category: s.category as ScenarioCategory,
          title: s.title as string,
          description: s.description as string,
          severity: s.severity as ScenarioSeverity,
          consequenceChain: Array.isArray(s.consequence_chain) ? s.consequence_chain : [],
          recommendedResolutions: Array.isArray(s.recommended_resolutions) ? s.recommended_resolutions : [],
          status: s.status as ScenarioStatus,
          createdAt: s.created_at as string,
          updatedAt: s.updated_at as string,
          activeResolution: activeRes,
        };
      });

      setScenarios(mappedScenarios);
      if (data.coverage) {
        setCoverage(data.coverage);
      }
      setMessageNotice(`Analyzed transaction and generated ${data.insertedCount || mappedScenarios.length} predictive contingencies.`);
    } catch (err: unknown) {
      setMessageNotice(err instanceof Error ? err.message : "Error generating scenarios");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenResolutionModal = (scenario: PredictiveScenario) => {
    setActiveModalScenario(scenario);
    setIsModalOpen(true);
  };

  const handleResolutionSaved = (
    updatedScenario: PredictiveScenario,
    updatedCoverage: unknown
  ) => {
    setScenarios((prev) =>
      prev.map((s) => (s.id === updatedScenario.id ? updatedScenario : s))
    );
    if (updatedCoverage && typeof updatedCoverage === "object") {
      setCoverage(updatedCoverage as ScenarioCoverageMetrics);
    }
    setMessageNotice(`Contingency "${updatedScenario.title}" resolution recorded.`);
  };

  // Filter scenarios
  const filteredScenarios = scenarios.filter((s) => {
    const matchesSeverity =
      selectedSeverity === "all" || s.severity === selectedSeverity;
    const matchesStatus =
      selectedStatus === "all" || s.status === selectedStatus;
    const matchesSearch =
      !searchQuery.trim() ||
      s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSeverity && matchesStatus && matchesSearch;
  });

  const getReadinessBadge = (tag: string) => {
    switch (tag) {
      case "resilient":
        return (
          <Badge variant="success" pulse className="text-xs uppercase font-bold">
            Resilient (75%+)
          </Badge>
        );
      case "moderate":
        return (
          <Badge variant="warning" className="text-xs uppercase font-bold">
            Moderate (40-74%)
          </Badge>
        );
      case "vulnerable":
      default:
        return (
          <Badge variant="destructive" className="text-xs uppercase font-bold">
            Vulnerable (&lt;40%)
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card: Coverage Score & Category Breakdown */}
      <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl p-6 shadow-xl space-y-5 transition-all duration-200 hover:border-zinc-700/80">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent"
        />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="assurance">Pillar 2</Badge>
              <Badge variant="outline">Predictive Risk Engine</Badge>
              {getReadinessBadge(coverage.readinessTag)}
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-100 flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-emerald-400" />
              <span>Scenario Coverage &amp; Contingency Engine</span>
            </h2>
            <p className="text-xs text-zinc-400 max-w-2xl">
              Anticipate edge-case delays, material stockouts, and revision disputes before signing.
              Mutually agree on protocols so surprises never derail the transaction.
            </p>
          </div>

          {/* Generate Scenarios CTA */}
          <Button
            variant="assurance"
            onClick={handleGenerateScenarios}
            disabled={isGenerating}
            className="gap-2 cursor-pointer shrink-0"
          >
            {isGenerating ? (
              <RotateCw className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            <span>{isGenerating ? "Analyzing Context..." : "Generate AI Scenarios"}</span>
          </Button>
        </div>

        {/* Coverage Score Visual Meter */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 pt-2">
          {/* Main Meter */}
          <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/65 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Contingency Coverage Score
              </span>
              <div className="flex items-baseline gap-2">
                <span className="font-mono tabular-nums tracking-tight text-3xl font-black text-zinc-100">
                  {coverage.score}%
                </span>
                <span className="font-mono tracking-tight text-xs text-zinc-400">
                  ({coverage.resolvedCount}/{coverage.totalCount} resolved)
                </span>
              </div>
            </div>
            {/* Circular Gauge Representation */}
            <div className="relative h-14 w-14 flex items-center justify-center">
              <svg className="h-14 w-14 -rotate-90 transform" viewBox="0 0 36 36">
                <path
                  className="text-zinc-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className={
                    coverage.score >= 75
                      ? "text-emerald-400"
                      : coverage.score >= 40
                      ? "text-amber-400"
                      : "text-rose-400"
                  }
                  strokeDasharray={`${coverage.score}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <span className="font-mono tracking-tight absolute text-[11px] font-bold text-zinc-100">
                {coverage.score}%
              </span>
            </div>
          </div>

          {/* Category Breakdown Badges */}
          <div className="lg:col-span-2 p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/65 space-y-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Risk Category Preparedness
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(coverage.categoryBreakdown || {}).map(([cat, metric]) => (
                <div
                  key={cat}
                  className="p-2 rounded-lg bg-zinc-900/70 border border-zinc-800/80 text-xs flex items-center justify-between transition-all duration-200 hover:border-zinc-700"
                >
                  <span className="capitalize text-[11px] text-zinc-300 truncate mr-1">
                    {cat.replace("_", " ")}
                  </span>
                  <span
                    className={`text-[10px] font-mono tabular-nums tracking-tight px-1.5 py-0.5 rounded-md border font-bold ${
                      metric.total > 0 && metric.resolved === metric.total
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : metric.total > 0
                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                        : "bg-zinc-900 text-zinc-500 border-zinc-800"
                    }`}
                  >
                    {metric.resolved}/{metric.total}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Non-legal Disclaimer */}
        <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-[11px] text-zinc-400 flex items-start gap-2">
          <Info className="h-4 w-4 shrink-0 text-zinc-400 mt-0.5" />
          <span>{coverage.disclaimer}</span>
        </div>
      </div>

      {messageNotice && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300 flex items-center justify-between">
          <span>{messageNotice}</span>
          <button
            type="button"
            onClick={() => setMessageNotice(null)}
            className="text-[11px] font-semibold text-emerald-400 hover:underline transition-all duration-200 active:scale-95 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-sm">
          <Search className="h-4 w-4 absolute left-3 top-2.5 text-zinc-500" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search scenarios or consequence steps..."
            className="pl-9 h-9 text-xs"
          />
        </div>

        {/* Severity & Status Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="h-9 text-xs rounded-xl border border-zinc-800 bg-zinc-900/75 px-3 text-zinc-200 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 cursor-pointer"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-9 text-xs rounded-xl border border-zinc-800 bg-zinc-900/75 px-3 text-zinc-200 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="resolving">Resolving</option>
            <option value="resolved">Resolved</option>
          </select>
        </div>
      </div>

      {/* Scenarios Grid / List */}
      {filteredScenarios.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredScenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              onOpenResolution={handleOpenResolutionModal}
              currencySymbol={currencySymbol}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 backdrop-blur-md p-12 text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-zinc-500 mx-auto opacity-50" />
          <h3 className="text-sm font-bold text-zinc-100">No Scenarios Found</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            {scenarios.length === 0
              ? "Click 'Generate AI Scenarios' above to analyze your transaction conversation and produce tailored consequence chains."
              : "No scenarios match the selected filters. Try clearing your filters or search term."}
          </p>
          {scenarios.length === 0 && (
            <Button
              variant="assurance"
              onClick={handleGenerateScenarios}
              disabled={isGenerating}
              size="sm"
              className="mt-2 text-xs gap-1.5 cursor-pointer"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Generate Initial Scenarios</span>
            </Button>
          )}
        </div>
      )}

      {/* Contingency Resolution Modal */}
      <ScenarioResolutionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        scenario={activeModalScenario}
        transactionId={transactionId}
        currentUserRole={currentUserRole}
        currencySymbol={currencySymbol}
        onResolutionSaved={handleResolutionSaved}
      />
    </div>
  );
}

