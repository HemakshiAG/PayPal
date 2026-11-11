"use strict";
import * as React from "react";
import {
  PredictiveScenario,
  ScenarioSeverity,
  ScenarioCategory,
  ConsequenceStep,
} from "@/types/scenario";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Clock,
  ShieldCheck,
  ArrowRight,
  User,
  Store,
  Cpu,
  CheckCircle2,
  Hourglass,
  Layers,
} from "lucide-react";

interface ScenarioCardProps {
  scenario: PredictiveScenario;
  onOpenResolution: (scenario: PredictiveScenario) => void;
  currencySymbol?: string;
}

export function ScenarioCard({
  scenario,
  onOpenResolution,
  currencySymbol = "₹",
}: ScenarioCardProps) {
  const [showFullChain, setShowFullChain] = React.useState(false);

  const getSeverityBadgeVariant = (sev: ScenarioSeverity) => {
    switch (sev) {
      case "critical":
        return "destructive";
      case "high":
        return "warning";
      case "medium":
        return "secondary";
      case "low":
      default:
        return "outline";
    }
  };

  const getCategoryLabel = (cat: ScenarioCategory) => {
    switch (cat) {
      case "timeline_delay":
        return "Timeline Delay";
      case "scope_dispute":
        return "Scope & Revisions";
      case "material_shortage":
        return "Material Supply";
      case "quality_rejection":
        return "Quality Standards";
      case "cost_escalation":
        return "Cost Escalation";
      case "cancellation":
        return "Cancellation Risk";
      default:
        return cat;
    }
  };

  const steps: ConsequenceStep[] = Array.isArray(scenario.consequenceChain)
    ? scenario.consequenceChain
    : [];

  const activeRes = scenario.activeResolution;

  return (
    <Card
      glow={scenario.status === "resolved"}
      className={`border backdrop-blur-md transition-all duration-200 ${
        scenario.status === "resolved"
          ? "border-emerald-500/30 bg-zinc-900/60 hover:border-emerald-500/45"
          : scenario.severity === "critical"
          ? "border-rose-500/30 bg-zinc-900/60 hover:border-rose-500/45"
          : "border-zinc-800/80 bg-zinc-900/60 hover:border-emerald-500/35"
      }`}
    >
      <CardHeader className="pb-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[11px] font-semibold">
              {getCategoryLabel(scenario.category)}
            </Badge>
            <Badge
              variant={getSeverityBadgeVariant(scenario.severity)}
              className="text-[10px] uppercase font-bold tracking-wider"
            >
              {scenario.severity} severity
            </Badge>
          </div>

          <Badge
            variant={
              scenario.status === "resolved"
                ? "success"
                : scenario.status === "resolving"
                ? "warning"
                : "secondary"
            }
            pulse={scenario.status === "resolving"}
            className="capitalize text-xs font-medium"
          >
            {scenario.status === "resolved" && (
              <CheckCircle2 className="h-3 w-3 text-emerald-400 inline" />
            )}
            {scenario.status === "resolving" && (
              <Hourglass className="h-3 w-3 text-amber-400 inline animate-spin" />
            )}
            <span>{scenario.status}</span>
          </Badge>
        </div>

        <CardTitle className="text-base font-bold text-zinc-100 flex items-start gap-2">
          <AlertTriangle
            className={`h-4 w-4 mt-0.5 shrink-0 ${
              scenario.severity === "critical"
                ? "text-rose-400"
                : scenario.severity === "high"
                ? "text-amber-400"
                : "text-sky-400"
            }`}
          />
          <span>{scenario.title}</span>
        </CardTitle>

        <p className="text-xs text-zinc-400 leading-relaxed">
          {scenario.description}
        </p>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        {/* Interactive Consequence Chain Timeline */}
        {steps.length > 0 && (
          <div className="space-y-2 rounded-xl bg-zinc-950/65 p-3.5 border border-zinc-800/80">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-zinc-500" />
                <span>Consequence Chain</span>
                <span className="font-mono tracking-tight text-zinc-500">({steps.length})</span>
              </span>
              <button
                type="button"
                onClick={() => setShowFullChain(!showFullChain)}
                className="text-[11px] text-emerald-400 hover:underline font-medium transition-all duration-200 active:scale-95 cursor-pointer"
              >
                {showFullChain ? "Collapse" : "View Flow"}
              </button>
            </div>

            {/* Stepper Timeline visualizer */}
            <div className="space-y-2 pt-1">
              {(showFullChain ? steps : steps.slice(0, 2)).map((step, idx) => (
                <div key={idx} className="flex items-start gap-2.5 text-xs">
                  <div className="flex flex-col items-center">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-bold text-[10px]">
                      {step.step || idx + 1}
                    </span>
                    {idx < (showFullChain ? steps.length - 1 : 1) && (
                      <span className="w-0.5 h-3 bg-zinc-800 my-0.5" />
                    )}
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-100 text-xs">
                        {step.title}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {step.delayDays ? (
                          <span className="font-mono tracking-tight text-[10px] text-amber-400 flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" /> +{step.delayDays}d
                          </span>
                        ) : null}
                        {step.actor && (
                          <span className="text-[10px] text-zinc-400 capitalize flex items-center gap-0.5">
                            {step.actor === "buyer" && <User className="h-2.5 w-2.5" />}
                            {step.actor === "seller" && <Store className="h-2.5 w-2.5" />}
                            {step.actor === "system" && <Cpu className="h-2.5 w-2.5" />}
                            {step.actor}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      {step.description}
                    </p>
                  </div>
                </div>
              ))}
              {!showFullChain && steps.length > 2 && (
                <div className="text-[10px] text-zinc-500 pl-7 italic">
                  + {steps.length - 2} more causal steps...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Active Agreed Resolution Summary (if any) */}
        {activeRes && (
          <div className="rounded-xl p-3 border border-zinc-800/90 bg-zinc-950/75 space-y-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="font-bold text-[11px] text-zinc-100 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                {scenario.status === "resolved" ? "Mutually Agreed Contingency" : "Proposed Contingency"}
              </span>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                    activeRes.buyerApproved
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-zinc-900 text-zinc-400 border-zinc-800"
                  }`}
                >
                  Buyer: {activeRes.buyerApproved ? "Signed" : "Pending"}
                </span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${
                    activeRes.sellerApproved
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-zinc-900 text-zinc-400 border-zinc-800"
                  }`}
                >
                  Seller: {activeRes.sellerApproved ? "Signed" : "Pending"}
                </span>
              </div>
            </div>

            <p className="text-zinc-300 text-[11px] leading-relaxed">
              {activeRes.agreedAction}
            </p>

            <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium pt-1.5 border-t border-zinc-800/70 text-zinc-400">
              {activeRes.priceImpactType !== "none" && (
                <span>
                  Price Impact:{" "}
                  <strong className="font-mono tabular-nums tracking-tight text-zinc-100 capitalize">
                    {activeRes.priceImpactType === "additional_cost" ? "+" : "-"}
                    {currencySymbol}
                    {activeRes.priceImpactValue}
                  </strong>
                </span>
              )}
              {activeRes.timelineImpactDays !== 0 && (
                <span>
                  Timeline Delay:{" "}
                  <strong className="font-mono tabular-nums tracking-tight text-zinc-100">
                    +{activeRes.timelineImpactDays} days
                  </strong>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end pt-1">
          <Button
            size="sm"
            variant={scenario.status === "resolved" ? "outline" : "assurance"}
            onClick={() => onOpenResolution(scenario)}
            className="text-xs gap-1.5 cursor-pointer"
          >
            <span>
              {scenario.status === "resolved"
                ? "View Agreed Contingency"
                : scenario.status === "resolving"
                ? "Review & Co-Sign"
                : "Resolve Contingency"}
            </span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

