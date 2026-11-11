"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MountedTimestamp } from "@/components/ui/mounted-timestamp";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  CreditCard,
  FileText,
  Gavel,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { MediateDisputeResponsePayload } from "@/types/dispute";

interface DisputeResolutionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactionId: string;
  transactionTitle: string;
  onRefundExecuted?: () => void;
}

interface ExecutedRefundReceipt {
  refundId: string;
  amountRefunded: number;
  timestamp: string;
  status: string;
  currency: string;
  captureId: string;
  isSimulated: boolean;
  ledgerEventId: string | null;
}

function formatMoney(amount: number, currency: string): string {
  const code = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

export function DisputeResolutionModal({
  open,
  onOpenChange,
  transactionId,
  transactionTitle,
  onRefundExecuted,
}: DisputeResolutionModalProps) {
  const [analysis, setAnalysis] = React.useState<MediateDisputeResponsePayload | null>(null);
  const [analysisError, setAnalysisError] = React.useState<string | null>(null);
  const [isReanalyzing, setIsReanalyzing] = React.useState(false);
  const [claimNotes, setClaimNotes] = React.useState("");
  const [isExecutingRefund, setIsExecutingRefund] = React.useState(false);
  const [refundError, setRefundError] = React.useState<string | null>(null);
  const [refundReceipt, setRefundReceipt] = React.useState<ExecutedRefundReceipt | null>(null);
  const hasAutoFetchedRef = React.useRef(false);

  // Trigger initial AI mediation asynchronously without synchronous setState in useEffect
  React.useEffect(() => {
    if (!open || hasAutoFetchedRef.current) return;
    hasAutoFetchedRef.current = true;
    let cancelled = false;

    const evaluateInitial = async () => {
      try {
        const res = await fetch("/api/ai/mediate-dispute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionId }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setAnalysisError(data.error || "Unable to evaluate dispute evidence.");
          return;
        }
        setAnalysis(data as MediateDisputeResponsePayload);
      } catch (err) {
        if (cancelled) return;
        setAnalysisError(
          err instanceof Error ? err.message : "Network error evaluating AI dispute."
        );
      }
    };

    void evaluateInitial();
    return () => {
      cancelled = true;
    };
  }, [open, transactionId]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      hasAutoFetchedRef.current = false;
      setAnalysis(null);
      setAnalysisError(null);
      setIsReanalyzing(false);
      setClaimNotes("");
      setIsExecutingRefund(false);
      setRefundError(null);
      setRefundReceipt(null);
    }
    onOpenChange(nextOpen);
  };

  const runAiMediation = async (notesOverride?: string) => {
    const notesToUse = typeof notesOverride === "string" ? notesOverride : claimNotes;
    setIsReanalyzing(true);
    setAnalysisError(null);
    setRefundError(null);

    try {
      const res = await fetch("/api/ai/mediate-dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          claimNotes: notesToUse.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAnalysisError(data.error || "AI dispute evaluation failed.");
        return;
      }
      setAnalysis(data as MediateDisputeResponsePayload);
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : "Network error running AI mediation."
      );
    } finally {
      setIsReanalyzing(false);
    }
  };

  const applyPresetScenario = (note: string) => {
    setClaimNotes(note);
    void runAiMediation(note);
  };

  const handleExecutePayPalRefund = async () => {
    if (!analysis || analysis.mediation.proposedRefundAmount <= 0) return;

    setIsExecutingRefund(true);
    setRefundError(null);

    try {
      const res = await fetch("/api/payments/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          captureId: analysis.targetCapture.captureId,
          paymentRecordId: analysis.targetCapture.paymentRecordId,
          transactionId,
          refundAmount: analysis.mediation.proposedRefundAmount,
          currency: analysis.targetCapture.currency,
          reason:
            analysis.mediation.recommendedReason || analysis.mediation.headline,
          aiMediation: {
            headline: analysis.mediation.headline,
            deficitPercent: analysis.mediation.deficitPercent,
            rationale: analysis.mediation.rationale,
            claimNotes: claimNotes.trim() || undefined,
            provider: analysis.mediation.provider,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setRefundError(data.error || "PayPal refund execution failed.");
        return;
      }

      setRefundReceipt({
        refundId: data.refundId,
        amountRefunded: Number(data.amountRefunded),
        timestamp: data.timestamp,
        status: data.status || "PARTIALLY_REFUNDED",
        currency: data.currency || analysis.targetCapture.currency,
        captureId: data.captureId || analysis.targetCapture.captureId,
        isSimulated: Boolean(data.isSimulated),
        ledgerEventId: data.ledgerEventId ?? null,
      });

      onRefundExecuted?.();
    } catch (err) {
      setRefundError(
        err instanceof Error ? err.message : "Network error executing PayPal refund."
      );
    } finally {
      setIsExecutingRefund(false);
    }
  };

  const isLoading = isReanalyzing || (open && analysis === null && analysisError === null);
  const mediation = analysis?.mediation;
  const targetCapture = analysis?.targetCapture;

  const refundSharePct =
    mediation && mediation.capturedAmount > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round((mediation.proposedRefundAmount / mediation.capturedAmount) * 100)
          )
        )
      : 0;
  const sellerSharePct = Math.max(0, 100 - refundSharePct);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-900/95 border border-zinc-800/90 backdrop-blur-xl text-zinc-100 shadow-2xl shadow-black/70">
        <DialogHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="assurance" className="gap-1">
              <Bot className="h-3 w-3" />
              <span>Autonomous AI Mediator</span>
            </Badge>
            <Badge variant="outline">PayPal Partial Refund Engine</Badge>
            {mediation && (
              <Badge
                variant={mediation.provider === "gemini-ai" ? "success" : "secondary"}
                className="text-[10px]"
              >
                {mediation.provider === "gemini-ai"
                  ? "Gemini AI Active"
                  : "Deterministic Audit"}
              </Badge>
            )}
          </div>
          <DialogTitle className="text-xl font-black tracking-tight flex items-center gap-2 text-zinc-100">
            <Gavel className="h-5 w-5 text-emerald-400" />
            <span>AI Dispute Mediation &amp; Settlement</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-400">
            Cross-examining <span className="font-semibold text-zinc-200">{transactionTitle}</span>{" "}
            against locked contract terms, chat messages, and Proof-of-Delivery inspection logs.
          </DialogDescription>
        </DialogHeader>

        {/* Receipt State after PayPal Partial Refund Executes */}
        {refundReceipt ? (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-emerald-500/20 p-2 border border-emerald-500/30">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-black text-emerald-300">
                      PayPal Partial Refund Executed &amp; Anchored
                    </h3>
                    <p className="text-xs text-emerald-200/80 leading-relaxed">
                      Payment status updated to{" "}
                      <span className="font-mono font-bold text-emerald-300">
                        {refundReceipt.status}
                      </span>{" "}
                      and immutable <span className="font-mono font-bold">dispute_resolved</span>{" "}
                      event appended to the Evidence Vault.
                    </p>
                  </div>
                </div>
                <Badge variant="success" pulse className="shrink-0 font-mono text-[10px]">
                  {refundReceipt.status}
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-emerald-500/20">
                <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/80 p-3 space-y-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    PayPal Refund ID
                  </span>
                  <div className="font-mono text-xs font-semibold text-zinc-100 break-all">
                    {refundReceipt.refundId}
                  </div>
                </div>
                <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/80 p-3 space-y-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Amount Refunded
                  </span>
                  <div className="font-mono tabular-nums text-sm font-black text-emerald-400">
                    {formatMoney(refundReceipt.amountRefunded, refundReceipt.currency)}
                  </div>
                </div>
                <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/80 p-3 space-y-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Target Capture ID
                  </span>
                  <div className="font-mono text-xs text-zinc-300 break-all">
                    {refundReceipt.captureId}
                  </div>
                </div>
                <div className="rounded-lg bg-zinc-950/70 border border-zinc-800/80 p-3 space-y-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Settled Timestamp
                  </span>
                  <div
                    suppressHydrationWarning
                    className="font-mono tabular-nums text-xs text-zinc-300"
                  >
                    <MountedTimestamp value={refundReceipt.timestamp} mode="datetime" />
                  </div>
                </div>
              </div>

              {refundReceipt.isSimulated && (
                <div className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span>
                    Processed against a seeded sandbox capture record ({" "}
                    <code className="font-mono">SIM-REF-*</code> audit receipt generated).
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-1">
            {/* Target PayPal Capture Banner */}
            {targetCapture && (
              <div className="rounded-xl border border-zinc-800/90 bg-zinc-950/70 p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CreditCard className="h-4 w-4 text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-zinc-200 truncate">
                      {targetCapture.milestoneTitle}
                    </div>
                    <div className="text-[11px] font-mono text-zinc-400 truncate">
                      Capture: {targetCapture.captureId}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right shrink-0">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">
                      Refundable Cap
                    </div>
                    <div className="font-mono tabular-nums text-xs font-bold text-zinc-200">
                      {formatMoney(targetCapture.maxRefundableAmount, targetCapture.currency)} /{" "}
                      {formatMoney(targetCapture.capturedAmount, targetCapture.currency)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-6 flex flex-col items-center justify-center text-center gap-3">
                <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />
                <div className="space-y-1">
                  <div className="text-sm font-bold text-zinc-100">
                    Evaluating Contract &amp; Delivery Evidence...
                  </div>
                  <p className="text-xs text-zinc-400 max-w-md">
                    Gemini AI is auditing locked specifications, chat correspondence, and
                    Proof-of-Delivery events to compute an objective settlement split.
                  </p>
                </div>
              </div>
            )}

            {/* Error State */}
            {analysisError && !isLoading && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 text-xs text-rose-300">
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{analysisError}</span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => runAiMediation()}
                  className="shrink-0 text-xs h-7 cursor-pointer"
                >
                  Retry
                </Button>
              </div>
            )}

            {/* Mediation Breakdown */}
            {mediation && !isLoading && (
              <div className="space-y-4">
                {/* Headline & Scope Deficit Verdict */}
                <div
                  className={`rounded-xl border p-4 space-y-3 ${
                    mediation.proposedRefundAmount > 0
                      ? "border-emerald-500/30 bg-emerald-500/10"
                      : "border-amber-500/30 bg-amber-500/10"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
                      AI Settlement Proposal
                    </span>
                    <Badge
                      variant={mediation.deficitPercent > 0 ? "warning" : "secondary"}
                      className="font-mono tabular-nums text-[10px]"
                    >
                      {mediation.deficitPercent}% Scope Deficit
                    </Badge>
                  </div>

                  <div className="text-base font-black tracking-tight text-zinc-100">
                    {mediation.headline}
                  </div>

                  {/* Refund Split Visualization */}
                  <div className="grid grid-cols-3 gap-2.5 pt-1">
                    <div className="rounded-lg bg-zinc-950/80 border border-zinc-800/80 p-2.5">
                      <div className="text-[10px] text-zinc-500 font-semibold uppercase">
                        Contract Value
                      </div>
                      <div className="font-mono tabular-nums text-xs sm:text-sm font-bold text-zinc-200 mt-0.5">
                        {formatMoney(mediation.totalContractAmount, mediation.currency)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-zinc-950/80 border border-emerald-500/30 p-2.5">
                      <div className="text-[10px] text-emerald-400 font-semibold uppercase">
                        Buyer Refund
                      </div>
                      <div className="font-mono tabular-nums text-xs sm:text-sm font-black text-emerald-400 mt-0.5">
                        {formatMoney(mediation.proposedRefundAmount, mediation.currency)}
                      </div>
                    </div>
                    <div className="rounded-lg bg-zinc-950/80 border border-zinc-800/80 p-2.5">
                      <div className="text-[10px] text-zinc-500 font-semibold uppercase">
                        Seller Retained
                      </div>
                      <div className="font-mono tabular-nums text-xs sm:text-sm font-bold text-zinc-200 mt-0.5">
                        {formatMoney(
                          mediation.proposedSellerRetentionAmount,
                          mediation.currency
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Proportional Split Bar */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                      <span>Buyer Refund Share ({refundSharePct}% of Capture)</span>
                      <span>Seller Retained ({sellerSharePct}% of Capture)</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-zinc-800 overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500"
                        style={{ width: `${refundSharePct}%` }}
                      />
                      <div
                        className="h-full bg-indigo-500/70 transition-all duration-500"
                        style={{ width: `${sellerSharePct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* AI Rationale */}
                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-zinc-200">
                    <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>Neutral AI Mediation Rationale</span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">{mediation.rationale}</p>

                  {mediation.evidenceCitations.length > 0 && (
                    <div className="pt-2 border-t border-zinc-800/80 space-y-1.5">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                        Cited Evidence
                      </div>
                      <div className="space-y-1.5">
                        {mediation.evidenceCitations.map((item, idx) => (
                          <div
                            key={`${item.source}-${idx}`}
                            className="rounded-lg bg-zinc-900/80 border border-zinc-800/80 px-3 py-2 text-[11px] flex items-start gap-2"
                          >
                            <FileText className="h-3.5 w-3.5 text-zinc-400 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-semibold text-zinc-200">
                                {item.reference}:
                              </span>{" "}
                              <span className="text-zinc-400">{item.finding}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Delivery Variance / Inspector Claim Intake */}
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="dispute-claim-notes"
                  className="text-[11px] font-bold uppercase tracking-wider text-zinc-400"
                >
                  Delivery Inspection / Dispute Claim Notes
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={isLoading || isExecutingRefund}
                    onClick={() =>
                      applyPresetScenario(
                        "Warehouse delivery verification: only 15 of 20 hoodies arrived — 5 missing units detected."
                      )
                    }
                    className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    + 5 Missing Units (25% Deficit)
                  </button>
                  <button
                    type="button"
                    disabled={isLoading || isExecutingRefund}
                    onClick={() =>
                      applyPresetScenario(
                        "Quality defect logged: puff-print mismatch across delivered batch (20% defect)."
                      )
                    }
                    className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    + Print Defect (20%)
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <textarea
                  id="dispute-claim-notes"
                  rows={2}
                  value={claimNotes}
                  onChange={(e) => setClaimNotes(e.target.value)}
                  placeholder="Optional: specify missing unit counts, defect inspection notes, or SLA delivery breach..."
                  className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50 resize-none"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isLoading || isExecutingRefund}
                  onClick={() => runAiMediation()}
                  className="gap-1.5 text-xs sm:self-end cursor-pointer"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isReanalyzing ? "animate-spin" : ""}`} />
                  <span>Re-analyze</span>
                </Button>
              </div>
            </div>

            {refundError && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{refundError}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 pt-2 border-t border-zinc-800/80">
          {refundReceipt ? (
            <Button
              type="button"
              variant="assurance"
              onClick={() => handleOpenChange(false)}
              className="cursor-pointer"
            >
              Done &amp; Inspect Vault Log
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isExecutingRefund}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="assurance"
                disabled={
                  isLoading ||
                  isExecutingRefund ||
                  !mediation ||
                  mediation.proposedRefundAmount <= 0
                }
                onClick={handleExecutePayPalRefund}
                className="gap-2 cursor-pointer shadow-lg shadow-emerald-950/40"
              >
                {isExecutingRefund ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Executing PayPal Refund...</span>
                  </>
                ) : (
                  <>
                    <Gavel className="h-4 w-4" />
                    <span>
                      Confirm &amp; Execute PayPal Refund
                      {mediation && mediation.proposedRefundAmount > 0
                        ? ` (${formatMoney(mediation.proposedRefundAmount, mediation.currency)})`
                        : ""}
                    </span>
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

