"use strict";
import * as React from "react";
import {
  PredictiveScenario,
  RecommendedResolution,
  PriceImpactType,
} from "@/types/scenario";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ShieldAlert,
  CheckCircle2,
  Clock,
  Sparkles,
  UserCheck,
  Check,
  AlertCircle,
} from "lucide-react";

interface ScenarioResolutionModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenario: PredictiveScenario | null;
  transactionId: string;
  currentUserRole: "buyer" | "seller" | "observer";
  currencySymbol?: string;
  onResolutionSaved: (updatedScenario: PredictiveScenario, updatedCoverage: unknown) => void;
}

export function ScenarioResolutionModal({
  isOpen,
  onClose,
  scenario,
  transactionId,
  currentUserRole,
  currencySymbol = "₹",
  onResolutionSaved,
}: ScenarioResolutionModalProps) {
  if (!scenario) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <ScenarioResolutionFormContent
          key={scenario.id}
          scenario={scenario}
          transactionId={transactionId}
          currentUserRole={currentUserRole}
          currencySymbol={currencySymbol}
          onClose={onClose}
          onResolutionSaved={onResolutionSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

interface FormContentProps {
  scenario: PredictiveScenario;
  transactionId: string;
  currentUserRole: "buyer" | "seller" | "observer";
  currencySymbol: string;
  onClose: () => void;
  onResolutionSaved: (updatedScenario: PredictiveScenario, updatedCoverage: unknown) => void;
}

function ScenarioResolutionFormContent({
  scenario,
  transactionId,
  currentUserRole,
  currencySymbol,
  onClose,
  onResolutionSaved,
}: FormContentProps) {
  const presets: RecommendedResolution[] = Array.isArray(scenario.recommendedResolutions)
    ? scenario.recommendedResolutions
    : [];

  const firstPreset = presets.length > 0 ? presets[0] : null;

  const [selectedPresetId, setSelectedPresetId] = React.useState<string | null>(
    scenario.activeResolution ? null : firstPreset?.id ?? null
  );
  const [agreedAction, setAgreedAction] = React.useState<string>(
    scenario.activeResolution?.agreedAction ?? firstPreset?.action ?? ""
  );
  const [priceImpactType, setPriceImpactType] = React.useState<PriceImpactType>(
    scenario.activeResolution?.priceImpactType ?? firstPreset?.priceImpactType ?? "none"
  );
  const [priceImpactValue, setPriceImpactValue] = React.useState<number>(
    scenario.activeResolution?.priceImpactValue ?? firstPreset?.priceImpactValue ?? 0
  );
  const [timelineImpactDays, setTimelineImpactDays] = React.useState<number>(
    scenario.activeResolution?.timelineImpactDays ?? firstPreset?.timelineImpactDays ?? 0
  );

  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleSelectPreset = (preset: RecommendedResolution) => {
    setSelectedPresetId(preset.id);
    setAgreedAction(preset.action);
    setPriceImpactType(preset.priceImpactType);
    setPriceImpactValue(preset.priceImpactValue);
    setTimelineImpactDays(preset.timelineImpactDays);
  };

  const activeRes = scenario.activeResolution;
  const isAlreadyResolved = scenario.status === "resolved";

  const canCoSign =
    activeRes &&
    scenario.status === "resolving" &&
    ((currentUserRole === "buyer" && !activeRes.buyerApproved) ||
      (currentUserRole === "seller" && !activeRes.sellerApproved));

  const handleCoSign = async () => {
    if (!activeRes) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/scenarios/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: scenario.id,
          transactionId,
          resolutionId: activeRes.id,
          agreedAction: activeRes.agreedAction,
          priceImpactType: activeRes.priceImpactType,
          priceImpactValue: activeRes.priceImpactValue,
          timelineImpactDays: activeRes.timelineImpactDays,
          actionType: "approve",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to co-sign resolution");
      }

      onResolutionSaved(
        {
          ...scenario,
          status: data.scenarioStatus || "resolved",
          activeResolution: data.resolution,
        },
        data.coverage
      );
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Error submitting approval");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitResolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agreedAction.trim()) {
      setErrorMessage("Please specify the agreed contingency action");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/scenarios/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenarioId: scenario.id,
          transactionId,
          agreedAction: agreedAction.trim(),
          priceImpactType,
          priceImpactValue: Number(priceImpactValue) || 0,
          timelineImpactDays: Number(timelineImpactDays) || 0,
          actionType: "propose",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save contingency resolution");
      }

      onResolutionSaved(
        {
          ...scenario,
          status: data.scenarioStatus || "resolving",
          activeResolution: data.resolution,
        },
        data.coverage
      );
      onClose();
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Submission error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-xs uppercase font-semibold">
            {scenario.category.replace("_", " ")}
          </Badge>
          <Badge
            variant={
              scenario.severity === "critical"
                ? "destructive"
                : scenario.severity === "high"
                ? "warning"
                : "secondary"
            }
            className="text-[10px] uppercase font-bold"
          >
            {scenario.severity} severity
          </Badge>
        </div>
        <DialogTitle className="text-lg font-bold flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-primary" />
          <span>Resolve Contingency: {scenario.title}</span>
        </DialogTitle>
        <DialogDescription className="text-xs">
          {scenario.description}
        </DialogDescription>
      </DialogHeader>

      {errorMessage && (
        <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Dual Approval Status Indicators */}
      <div className="p-3.5 rounded-xl bg-zinc-950/65 border border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="space-y-0.5">
          <span className="font-bold text-zinc-100">Dual Approval Required</span>
          <p className="text-[11px] text-zinc-400">
            Both parties must agree to lock this contingency resolution.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${
              activeRes?.buyerApproved
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-zinc-900 text-zinc-400 border-zinc-800"
            }`}
          >
            {activeRes?.buyerApproved ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Clock className="h-3.5 w-3.5" />
            )}
            <span>Buyer: {activeRes?.buyerApproved ? "Signed" : "Awaiting"}</span>
          </div>

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${
              activeRes?.sellerApproved
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                : "bg-zinc-900 text-zinc-400 border-zinc-800"
            }`}
          >
            {activeRes?.sellerApproved ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Clock className="h-3.5 w-3.5" />
            )}
            <span>Seller: {activeRes?.sellerApproved ? "Signed" : "Awaiting"}</span>
          </div>
        </div>
      </div>

      {/* If existing resolution is awaiting user's co-sign */}
      {canCoSign && (
        <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <UserCheck className="h-4 w-4" />
                Counterparty Proposed Resolution
              </span>
              <p className="text-xs text-zinc-100 font-medium">
                {activeRes.agreedAction}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400">
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

          <Button
            type="button"
            variant="assurance"
            onClick={handleCoSign}
            disabled={isSubmitting}
            className="w-full text-xs font-semibold gap-1.5 cursor-pointer"
          >
            <Check className="h-3.5 w-3.5" />
            <span>
              {isSubmitting ? "Co-signing..." : "Co-Sign & Resolve This Contingency"}
            </span>
          </Button>
        </div>
      )}

      {/* Recommended Presets */}
      {!isAlreadyResolved && presets.length > 0 && (
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
            Recommended Presets (Click to autofill)
          </label>
          <div className="grid grid-cols-1 gap-2">
            {presets.map((preset) => (
              <button
                type="button"
                key={preset.id}
                onClick={() => handleSelectPreset(preset)}
                className={`p-3 rounded-xl border text-left text-xs transition-all duration-200 active:scale-[0.99] cursor-pointer ${
                  selectedPresetId === preset.id
                    ? "border-emerald-500/40 bg-emerald-500/10 ring-1 ring-emerald-500/30"
                    : "border-zinc-800/80 bg-zinc-950/60 hover:bg-zinc-800/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="font-semibold text-zinc-100 text-xs">
                    {preset.title}
                  </span>
                  <div className="flex items-center gap-2 text-[10px] font-mono tracking-tight text-zinc-400">
                    {preset.timelineImpactDays ? (
                      <span>+{preset.timelineImpactDays}d delay</span>
                    ) : null}
                    {preset.priceImpactType !== "none" ? (
                      <span className="font-mono">
                        {currencySymbol}
                        {preset.priceImpactValue}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed">
                  {preset.action}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Custom Resolution Form */}
      {!isAlreadyResolved && (
        <form onSubmit={handleSubmitResolution} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-200">
              Agreed Action Plan / Protocol
            </label>
            <textarea
              value={agreedAction}
              onChange={(e) => setAgreedAction(e.target.value)}
              placeholder="Describe exact mutual terms if this contingency occurs..."
              rows={3}
              required
              className="w-full text-xs rounded-xl border border-zinc-800 bg-zinc-950/75 p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-zinc-100 placeholder:text-zinc-500 transition-all duration-200"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-200">
                Price Impact Type
              </label>
              <select
                value={priceImpactType}
                onChange={(e) => setPriceImpactType(e.target.value as PriceImpactType)}
                className="w-full h-9 text-xs rounded-xl border border-zinc-800 bg-zinc-950/75 px-3 text-zinc-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="none">No Price Change</option>
                <option value="additional_cost">Additional Surcharge (+)</option>
                <option value="discount">Discount / Credit (-)</option>
                <option value="refund">Partial Refund</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-200">
                Price Impact Amount ({currencySymbol})
              </label>
              <Input
                type="number"
                min="0"
                step="100"
                value={priceImpactValue}
                onChange={(e) => setPriceImpactValue(Number(e.target.value))}
                disabled={priceImpactType === "none"}
                className="h-9 text-xs font-mono tabular-nums tracking-tight"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-zinc-200">
                Timeline Delay (Days)
              </label>
              <Input
                type="number"
                min="0"
                max="180"
                value={timelineImpactDays}
                onChange={(e) => setTimelineImpactDays(Number(e.target.value))}
                className="h-9 text-xs font-mono tabular-nums tracking-tight"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 pt-3 border-t border-zinc-800/70">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="assurance"
              size="sm"
              disabled={isSubmitting || !agreedAction.trim()}
              className="cursor-pointer"
            >
              {isSubmitting
                ? "Submitting..."
                : activeRes
                ? "Update Resolution Proposal"
                : "Submit Resolution Proposal"}
            </Button>
          </DialogFooter>
        </form>
      )}

      {isAlreadyResolved && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs flex items-center justify-between">
          <span className="font-semibold flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            This contingency has been mutually signed and locked.
          </span>
          <Button size="sm" variant="outline" onClick={onClose} className="cursor-pointer">
            Close
          </Button>
        </div>
      )}
    </>
  );
}
