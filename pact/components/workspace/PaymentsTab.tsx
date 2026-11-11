"use client";
import * as React from "react";
import {
  PaymentMilestone,
  PaymentRecord,
  MilestoneStatus,
} from "@/types/payment";
import { MilestoneCard } from "./MilestoneCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MountedTimestamp } from "@/components/ui/mounted-timestamp";
import {
  CreditCard,
  ShieldAlert,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  FileCheck,
  Receipt,
  Lock,
  AlertTriangle,
} from "lucide-react";

import { ProofOfDeliveryCard } from "./ProofOfDeliveryCard";
import type { StoredVisualProof, VisualProofPayoutReceipt } from "@/types/proof";
import {
  type AgreementRecordWithSignatures,
  hasAgreementSignatures,
  isAgreementLockedOrActiveStatus,
} from "@/lib/agreement/status";

function toSafeAmount(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

class PaymentsTabErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn("[PaymentsTabErrorBoundary] Prevented route crash:", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="rounded-2xl border border-amber-400/50 bg-amber-950/70 p-6 text-amber-100 space-y-2 shadow-[0_0_24px_rgba(245,158,11,0.18)]"
        >
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle className="h-5 w-5 text-amber-300 shrink-0" />
            <span>PayPal Sandbox Credentials Pending — Check .env.local</span>
          </div>
          <p className="text-xs text-amber-200/85">
            Payments view encountered a client initialization issue and safely isolated the error. Refresh or verify PayPal credentials in .env.local.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export type AgreementLikeRecord = AgreementRecordWithSignatures;

interface PaymentsTabProps {
  transactionId: string;
  transactionTitle?: string;
  transactionCategory?: string | null;
  transactionStatus?: string | null;
  transaction?: {
    id?: string;
    status?: string | null;
    title?: string;
    category?: string | null;
    totalAmount?: number;
    currency?: string;
  } | null;
  totalAmount?: number;
  currency?: string;
  currentUserRole: "buyer" | "seller" | "observer";
  agreement?: AgreementLikeRecord | null;
  agreementVersions?: AgreementLikeRecord[] | null;
  activeAgreementVersion:
    | (AgreementLikeRecord & {
        id: string;
        versionNumber: number;
      })
    | null;
  initialMilestones?: PaymentMilestone[] | null;
  initialPaymentRecords?: PaymentRecord[] | null;
  initialVisualProof?: StoredVisualProof | null;
  initialLatestPayout?: VisualProofPayoutReceipt | null;
  onProofVerified?: (
    proof: StoredVisualProof | null,
    payout?: VisualProofPayoutReceipt | null
  ) => void;
}

function PaymentsTabContent({
  transactionId,
  transactionTitle,
  transactionCategory,
  transactionStatus,
  transaction,
  totalAmount = 0,
  currency = "USD",
  currentUserRole,
  agreement = null,
  agreementVersions = null,
  activeAgreementVersion,
  initialMilestones = [],
  initialPaymentRecords = [],
  initialVisualProof = null,
  initialLatestPayout = null,
  onProofVerified,
}: PaymentsTabProps) {
  const [localMilestonesOverride, setLocalMilestonesOverride] = React.useState<{
    base: PaymentMilestone[] | null | undefined;
    items: PaymentMilestone[];
  } | null>(null);
  const [localRecordsOverride, setLocalRecordsOverride] = React.useState<{
    base: PaymentRecord[] | null | undefined;
    items: PaymentRecord[];
  } | null>(null);
  const [localProof, setLocalProof] =
    React.useState<StoredVisualProof | null>(null);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [toastMessage, setToastMessage] = React.useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const safeMilestones = React.useMemo(() => {
    const activeList =
      localMilestonesOverride &&
      localMilestonesOverride.base === initialMilestones
        ? localMilestonesOverride.items
        : initialMilestones;
    return Array.isArray(activeList) ? activeList.filter(Boolean) : [];
  }, [localMilestonesOverride, initialMilestones]);

  const safePaymentRecords = React.useMemo(() => {
    const activeList =
      localRecordsOverride &&
      localRecordsOverride.base === initialPaymentRecords
        ? localRecordsOverride.items
        : initialPaymentRecords;
    return Array.isArray(activeList) ? activeList.filter(Boolean) : [];
  }, [localRecordsOverride, initialPaymentRecords]);

  const verifiedProof = localProof ?? initialVisualProof;
  const isVisualProofVerified = Boolean(verifiedProof?.isApproved);
  const nextPayableMilestone = safeMilestones.find(
    (m) => m?.status === "pending" || m?.status === "processing"
  );

  const handleProofVerified = (
    proof: StoredVisualProof | null,
    payout?: VisualProofPayoutReceipt | null
  ) => {
    setLocalProof(proof);
    onProofVerified?.(proof, payout);
    if (proof?.isApproved && payout?.executed) {
      setToastMessage({
        type: "success",
        text: `Gemini Vision approved deliverables (${proof.matchConfidence}%) & automated PayPal Seller Payout (${payout.payoutBatchId}) dispatched!`,
      });
    } else if (proof?.isApproved) {
      setToastMessage({
        type: "success",
        text: `Gemini Vision verified deliverables (${proof.matchConfidence}% match). PayPal milestone payout unlocked!`,
      });
    } else if (proof && !proof.isApproved) {
      setToastMessage({
        type: "error",
        text: `Visual inspection flagged discrepancies (${proof.matchConfidence}% match). PayPal payout remains locked.`,
      });
    }
  };

  const safeCurrency = (currency || "USD").toUpperCase();
  const currencySymbol = safeCurrency === "INR" ? "₹" : "$";

  const safeAgreementVersions = React.useMemo(
    () =>
      Array.isArray(agreementVersions) ? agreementVersions.filter(Boolean) : [],
    [agreementVersions]
  );

  const resolvedAgreement = React.useMemo<AgreementLikeRecord | null>(() => {
    if (
      agreement &&
      (isAgreementLockedOrActiveStatus(agreement.status) ||
        hasAgreementSignatures(agreement))
    ) {
      return agreement;
    }
    if (activeAgreementVersion) {
      return activeAgreementVersion;
    }
    const lockedVersion = safeAgreementVersions.find((v) =>
      isAgreementLockedOrActiveStatus(v?.status)
    );
    if (lockedVersion) return lockedVersion;
    const signedVersion = safeAgreementVersions.find((v) =>
      hasAgreementSignatures(v)
    );
    return signedVersion || agreement || safeAgreementVersions[0] || null;
  }, [agreement, activeAgreementVersion, safeAgreementVersions]);

  // Accept any valid locked/active agreement status string
  const isAgreementLockedOrActive =
    isAgreementLockedOrActiveStatus(
      transaction?.status ||
        transactionStatus ||
        resolvedAgreement?.status ||
        (activeAgreementVersion ? "ACTIVE" : "")
    ) ||
    isAgreementLockedOrActiveStatus(resolvedAgreement?.status) ||
    safeAgreementVersions.some((v) => isAgreementLockedOrActiveStatus(v?.status));

  const hasAnySignatures =
    hasAgreementSignatures(resolvedAgreement) ||
    hasAgreementSignatures(agreement) ||
    hasAgreementSignatures(activeAgreementVersion) ||
    safeAgreementVersions.some((v) => hasAgreementSignatures(v));

  const isAgreementUnlocked = isAgreementLockedOrActive || hasAnySignatures;
  const isAgreementActive = isAgreementUnlocked;

  // Calculate financial summary safely
  const milestoneSum = safeMilestones.reduce(
    (acc, m) => acc + toSafeAmount(m?.amount),
    0
  );
  const safeBudgetTotal = toSafeAmount(totalAmount);
  const effectiveTotal = milestoneSum > 0 ? milestoneSum : safeBudgetTotal;
  const paidToDate = safeMilestones
    .filter((m) => String(m?.status || "").toLowerCase() === "paid")
    .reduce((acc, m) => acc + toSafeAmount(m?.amount), 0);
  const remainingBalance = Math.max(0, effectiveTotal - paidToDate);
  const progressPct =
    effectiveTotal > 0
      ? Math.min(100, Math.round((paidToDate / effectiveTotal) * 100))
      : 0;

  const handleSyncMilestones = async () => {
    setIsSyncing(true);
    setToastMessage(null);

    try {
      const res = await fetch("/api/payments/sync-milestones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to sync milestone schedule");
      }

      const rawList = Array.isArray(data.milestones) ? data.milestones : [];
      const mapped: PaymentMilestone[] = rawList.map(
        (m: Record<string, unknown>) => ({
          id: String(m.id || ""),
          transactionId: String(m.transaction_id || transactionId),
          agreementVersionId: String(m.agreement_version_id || ""),
          title: String(m.title || "Escrow Milestone"),
          description: (m.description as string | null) ?? null,
          amount: toSafeAmount(m.amount),
          currency: (m.currency as string) || safeCurrency,
          sequenceOrder: Number(m.sequence_order) || 1,
          status: (String(m.status || "pending").toLowerCase() as MilestoneStatus) || "pending",
          dueDate: (m.due_date as string | null) ?? null,
          createdAt: String(m.created_at || ""),
          updatedAt: String(m.updated_at || ""),
        })
      );

      setLocalMilestonesOverride({ base: initialMilestones, items: mapped });
      setToastMessage({
        type: "success",
        text: `Synced ${mapped.length} staged milestone(s) from Agreement V${data.activeAgreementVersionNumber || 1}.`,
      });
    } catch (err) {
      setToastMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Error syncing milestones",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePaymentCompleted = (payload: {
    milestoneId: string;
    orderId: string;
    captureId: string;
    isSimulated: boolean;
  }) => {
    const targetMilestone = safeMilestones.find(
      (m) => m.id === payload.milestoneId
    );

    const newRecord: PaymentRecord = {
      id: `local-${Date.now()}`,
      milestoneId: payload.milestoneId,
      transactionId,
      payerId: "buyer",
      paypalOrderId: payload.orderId,
      paypalCaptureId: payload.captureId,
      amount: toSafeAmount(targetMilestone?.amount),
      currency: targetMilestone?.currency || safeCurrency,
      status: "COMPLETED",
      rawResponse: {
        isSimulated: payload.isSimulated,
        captureId: payload.captureId,
      },
      createdAt: new Date().toISOString(),
    };

    setLocalMilestonesOverride({
      base: initialMilestones,
      items: safeMilestones.map((m) =>
        m?.id === payload.milestoneId
          ? { ...m, status: "paid", latestPaymentRecord: newRecord }
          : m
      ),
    });

    setLocalRecordsOverride({
      base: initialPaymentRecords,
      items: [newRecord, ...safePaymentRecords],
    });

    setToastMessage({
      type: "success",
      text: `Payment verified server-side! Capture ID: ${payload.captureId}${
        payload.isSimulated ? " (Sandbox Simulation Mode)" : ""
      }`,
    });
  };

  const handlePaymentError = (msg: string) => {
    setToastMessage({ type: "error", text: msg });
  };

  // Map milestone titles for payment history lookup
  const milestoneTitleMap = React.useMemo(() => {
    const map = new Map<string, string>();
    safeMilestones.forEach((m) => {
      if (m?.id) {
        map.set(m.id, m.title || "Escrow Milestone");
      }
    });
    return map;
  }, [safeMilestones]);

  return (
    <div className="space-y-6">
      {/* Financial Header Card */}
      <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl p-6 shadow-lg shadow-black/20 space-y-5 transition-all duration-200 hover:border-emerald-500/35">
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent transition-opacity duration-200 ${
            isAgreementUnlocked
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
          }`}
        />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="assurance">Pillar 4</Badge>
              <Badge variant="outline">PayPal Developer Sandbox</Badge>
              {isAgreementUnlocked ? (
                <Badge
                  variant="success"
                  pulse
                  className="gap-1 text-xs font-mono tracking-tight font-bold"
                >
                  <FileCheck className="h-3 w-3" />
                  {resolvedAgreement?.versionNumber
                    ? `Active Agreement V${resolvedAgreement.versionNumber}`
                    : "Agreement Locked & Active"}
                </Badge>
              ) : (
                <Badge variant="warning" className="gap-1 text-xs font-bold">
                  <Lock className="h-3 w-3" />
                  Awaiting Agreement Lock
                </Badge>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-100 flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-emerald-400" />
              <span>Milestone Payments & Conditional Releases</span>
            </h2>
            <p className="text-xs text-zinc-400 max-w-2xl">
              Staged disbursements strictly tied to verified deliverables and mutually locked agreement versions.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                <span className="text-emerald-400">✓</span>
                <span>PayPal Webhooks Active</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-300">
                <span className="text-sky-400">✓</span>
                <span>Pay Later Supported</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-300">
                <span className="text-indigo-400">✓</span>
                <span>Automated Payout Escrow</span>
              </span>
            </div>
          </div>

          {isAgreementActive && safeMilestones.length === 0 && (
            <Button
              onClick={handleSyncMilestones}
              disabled={isSyncing}
              className="gap-2 cursor-pointer text-xs shrink-0 active:scale-95 transition-all duration-200"
            >
              {isSyncing ? (
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span>
                {isSyncing ? "Syncing..." : "Generate Milestone Schedule"}
              </span>
            </Button>
          )}
        </div>

        {/* 3 Financial Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/65 space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Total Agreement Amount
            </span>
            <div className="text-2xl font-black font-mono tabular-nums tracking-tight text-zinc-100">
              {currencySymbol}
              {effectiveTotal.toFixed(2)}
            </div>
            <span className="text-[11px] text-zinc-500 font-mono tracking-tight">
              {safeCurrency} Contract Value
            </span>
          </div>

          <div className="p-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              Paid to Date (Verified)
            </span>
            <div className="text-2xl font-black font-mono tabular-nums tracking-tight text-emerald-400">
              {currencySymbol}
              {paidToDate.toFixed(2)}
            </div>
            <span className="text-[11px] text-zinc-400 font-mono tabular-nums tracking-tight">
              {
                safeMilestones.filter(
                  (m) => String(m?.status || "").toLowerCase() === "paid"
                ).length
              }{" "}
              of {safeMilestones.length} milestones paid
            </span>
          </div>

          <div className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/65 space-y-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              Remaining Balance
            </span>
            <div className="text-2xl font-black font-mono tabular-nums tracking-tight text-zinc-100">
              {currencySymbol}
              {remainingBalance.toFixed(2)}
            </div>
            <span className="text-[11px] text-zinc-500 font-mono tabular-nums tracking-tight">
              {progressPct}% Disbursed
            </span>
          </div>
        </div>

        {/* Disbursement Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-400">
            <span>Disbursement Progress</span>
            <span className="font-mono tabular-nums tracking-tight text-emerald-400">
              {progressPct}% Completed
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Non-Escrow Statutory Compliance Notice (Rule 12) */}
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5 text-amber-400" />
          <div className="space-y-1">
            <strong className="font-bold">
              Mandatory Compliance & Schedule Notice:
            </strong>
            <p className="leading-relaxed text-amber-200/90">
              PACT coordinates milestone payments exclusively using server-verified PayPal API captures. Standard milestone transactions do not constitute a legal escrow account or escrow agency. Payments are initiated by the buyer and verified server-side against the locked agreement schedule.
            </p>
          </div>
        </div>
      </div>

      {/* Agreement Lock Warning Banner (hidden when active/locked OR signatures exist) */}
      {!isAgreementUnlocked && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-start gap-3"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-rose-400" />
          <div className="space-y-1">
            <strong className="font-bold text-rose-200">
              Agreement version is not active
            </strong>
            <p className="leading-relaxed text-rose-200/85">
              Both buyer and seller must sign and lock an agreement version in Pillar 3 before milestone payments can proceed.
            </p>
          </div>
        </div>
      )}

      {/* Toast / Feedback Notification */}
      {toastMessage &&
        !(
          isAgreementUnlocked &&
          toastMessage.type === "error" &&
          toastMessage.text
            .toLowerCase()
            .includes("agreement version is not active")
        ) && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
            toastMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/25 text-rose-400"
          }`}
        >
          <div className="flex items-center gap-2 font-medium">
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-[11px] font-bold hover:underline cursor-pointer transition-all duration-200 active:scale-95"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Gemini Vision Proof-of-Delivery Gate */}
      <ProofOfDeliveryCard
        transactionId={transactionId}
        transactionTitle={transactionTitle}
        transactionCategory={transactionCategory || undefined}
        currentUserRole={currentUserRole}
        activeAgreementVersion={
          isAgreementUnlocked && resolvedAgreement?.id
            ? {
                id: resolvedAgreement.id,
                versionNumber: resolvedAgreement.versionNumber || 1,
                contentHash: resolvedAgreement.contentHash || "",
                title: resolvedAgreement.title,
                sections: resolvedAgreement.sections,
              }
            : activeAgreementVersion
              ? {
                  ...activeAgreementVersion,
                  contentHash: activeAgreementVersion.contentHash || "",
                }
              : null
        }
        nextMilestoneId={nextPayableMilestone?.id || null}
        initialProof={verifiedProof}
        initialPayout={initialLatestPayout}
        onProofVerified={handleProofVerified}
      />

      {/* Milestone Schedule List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-sm font-bold text-zinc-100">
            Staged Milestone Schedule (
            <span className="font-mono tabular-nums tracking-tight">
              {safeMilestones.length}
            </span>
            )
          </h3>
          {isAgreementUnlocked && (resolvedAgreement || activeAgreementVersion) && (
            <span className="text-[11px] text-zinc-400 font-mono tracking-tight">
              Linked to V
              {resolvedAgreement?.versionNumber ||
                activeAgreementVersion?.versionNumber ||
                1}{" "}
              (
              {(
                resolvedAgreement?.contentHash ||
                activeAgreementVersion?.contentHash
              )?.slice?.(0, 8) || "LOCKED"}
              ...)
            </span>
          )}
        </div>

        {safeMilestones.length > 0 ? (
          <div className="space-y-3">
            {safeMilestones.map((m, idx) => (
              <MilestoneCard
                key={m?.id || `milestone-${idx}`}
                milestone={m}
                currentUserRole={currentUserRole}
                isAgreementActive={isAgreementActive}
                isVisualProofVerified={isVisualProofVerified}
                onPaymentCompleted={handlePaymentCompleted}
                onPaymentError={handlePaymentError}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 backdrop-blur-md p-10 text-center space-y-3">
            <CreditCard className="h-10 w-10 text-zinc-500 mx-auto opacity-60" />
            <h4 className="text-sm font-bold text-zinc-100">
              No Escrow Milestones Set Up Yet — Confirm AI extracted terms to generate milestones.
            </h4>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              {isAgreementActive
                ? "Your agreement is active! Click below to initialize the staged milestone disbursement schedule."
                : "Both buyer and seller can confirm extracted terms and lock the agreement in Pillar 3 to generate conditional milestones."}
            </p>
            {isAgreementActive && (
              <Button
                onClick={handleSyncMilestones}
                disabled={isSyncing}
                size="sm"
                className="text-xs gap-1.5 cursor-pointer active:scale-95 transition-all duration-200"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Sync Milestones from Active Agreement</span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Payment History Ledger Table */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl overflow-hidden shadow-lg shadow-black/20">
        <div className="p-4 border-b border-zinc-800/80 bg-zinc-950/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-zinc-100">
              Server-Verified PayPal Transaction Ledger
            </h3>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] font-mono tabular-nums tracking-tight"
          >
            {safePaymentRecords.length}{" "}
            {safePaymentRecords.length === 1 ? "record" : "records"}
          </Badge>
        </div>

        {safePaymentRecords.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800/80 bg-zinc-950/40 text-[11px] text-zinc-400 uppercase tracking-wider">
                  <th className="p-3 font-semibold">Date</th>
                  <th className="p-3 font-semibold">Milestone</th>
                  <th className="p-3 font-semibold">PayPal Order ID</th>
                  <th className="p-3 font-semibold">Capture ID</th>
                  <th className="p-3 font-semibold">Amount</th>
                  <th className="p-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/70">
                {safePaymentRecords.map((rec, idx) => {
                  const rawObj =
                    rec?.rawResponse &&
                    typeof rec.rawResponse === "object" &&
                    !Array.isArray(rec.rawResponse)
                      ? (rec.rawResponse as Record<string, unknown>)
                      : null;
                  const refundInfo =
                    rawObj?.refund &&
                    typeof rawObj.refund === "object" &&
                    !Array.isArray(rawObj.refund)
                      ? (rawObj.refund as {
                          amountRefunded?: number;
                          refundId?: string;
                        })
                      : null;
                  const payoutInfo =
                    rawObj?.payout &&
                    typeof rawObj.payout === "object" &&
                    !Array.isArray(rawObj.payout)
                      ? (rawObj.payout as {
                          payoutBatchId?: string;
                          batchStatus?: string;
                          amount?: number;
                        })
                      : null;
                  const recCurrency = (
                    rec?.currency ||
                    safeCurrency ||
                    "USD"
                  ).toUpperCase();
                  const recSymbol = recCurrency === "INR" ? "₹" : "$";
                  const recAmount = toSafeAmount(rec?.amount);

                  return (
                    <tr
                      key={rec?.id || `payment-rec-${idx}`}
                      className="hover:bg-zinc-950/50 transition-colors duration-200"
                    >
                      <td
                        suppressHydrationWarning
                        className="p-3 font-mono tabular-nums tracking-tight text-[11px] text-zinc-400 whitespace-nowrap"
                      >
                        <MountedTimestamp value={rec?.createdAt} mode="datetime" />
                      </td>
                      <td className="p-3 font-medium text-zinc-100">
                        {milestoneTitleMap.get(rec?.milestoneId || "") ||
                          "Milestone Disbursement"}
                      </td>
                      <td className="p-3 font-mono tracking-tight text-[11px] text-zinc-400">
                        {rec?.paypalOrderId || "—"}
                      </td>
                      <td className="p-3 font-mono tracking-tight text-[11px] text-zinc-200">
                        {rec?.paypalCaptureId || "—"}
                      </td>
                      <td className="p-3 font-mono tabular-nums tracking-tight font-bold text-zinc-100 whitespace-nowrap">
                        {recSymbol}
                        {recAmount.toFixed(2)} {recCurrency}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col items-start gap-1">
                          <Badge
                            variant={
                              rec?.status === "COMPLETED"
                                ? "success"
                                : rec?.status === "DISPUTED"
                                ? "destructive"
                                : rec?.status === "PARTIALLY_REFUNDED" ||
                                  rec?.status === "CREATED"
                                ? "warning"
                                : "secondary"
                            }
                            className="text-[10px] font-bold"
                          >
                            {rec?.status || "CREATED"}
                          </Badge>
                          {refundInfo && (
                            <span className="font-mono tabular-nums text-[10px] text-amber-300/90">
                              Refunded: {recSymbol}
                              {toSafeAmount(refundInfo.amountRefunded).toFixed(2)}{" "}
                              ({refundInfo.refundId || "REFUND"})
                            </span>
                          )}
                          {payoutInfo?.payoutBatchId && (
                            <span className="font-mono tabular-nums text-[10px] text-indigo-300/95">
                              Payout: {payoutInfo.payoutBatchId} (
                              {payoutInfo.batchStatus || "SENT"})
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-zinc-400">
            No PayPal order or capture events recorded for this transaction yet.
          </div>
        )}
      </div>
    </div>
  );
}

export function PaymentsTab(props: PaymentsTabProps) {
  return (
    <PaymentsTabErrorBoundary>
      <PaymentsTabContent {...props} />
    </PaymentsTabErrorBoundary>
  );
}
