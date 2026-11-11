"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MountedTimestamp } from "@/components/ui/mounted-timestamp";
import {
  Archive,
  ShieldCheck,
  ShieldAlert,
  Download,
  Scale,
  RotateCw,
  Copy,
  Check,
  Clock,
  Link2,
  Fingerprint,
  Gavel,
} from "lucide-react";
import { AgreementVersion } from "@/types/agreement";
import { PaymentMilestone, PaymentRecord } from "@/types/payment";
import {
  DriftAlert,
  LedgerIntegrityReport,
  ProofOfAgreementPackage,
  TransactionEvent,
} from "@/types/vault";
import { ChatMessage } from "./ConversationTab";
import { DisputeModal } from "./DisputeModal";
import { DisputeResolutionModal } from "./DisputeResolutionModal";

interface VaultTabProps {
  transaction: {
    id: string;
    title: string;
    category: string | null;
    status: string;
    totalAmount: number;
    currency: string;
    createdAt: string;
  };
  participants: {
    buyer: { id: string; name: string } | null;
    seller: { id: string; name: string } | null;
  };
  activeAgreementVersion: AgreementVersion | null;
  messages: ChatMessage[];
  milestones: PaymentMilestone[];
  paymentRecords: PaymentRecord[];
  initialEvents: TransactionEvent[];
  initialDriftAlerts: DriftAlert[];
  initialIntegrityReport: LedgerIntegrityReport;
  onRefundExecuted?: () => void;
}

export function VaultTab({
  transaction,
  participants,
  activeAgreementVersion,
  messages,
  milestones,
  paymentRecords,
  initialEvents,
  initialDriftAlerts,
  initialIntegrityReport,
  onRefundExecuted,
}: VaultTabProps) {
  const [integrityReportState, setIntegrityReport] =
    React.useState<LedgerIntegrityReport | null>(null);
  const integrityReport =
    integrityReportState &&
    integrityReportState.total_events >= initialIntegrityReport.total_events
      ? integrityReportState
      : initialIntegrityReport;
  const [isVerifying, setIsVerifying] = React.useState(false);
  const [isDisputeOpen, setIsDisputeOpen] = React.useState(false);
  const [isAiDisputeOpen, setIsAiDisputeOpen] = React.useState(false);
  const [copiedEventId, setCopiedEventId] = React.useState<string | null>(null);
  const [verifyError, setVerifyError] = React.useState<string | null>(null);

  const runIntegrityAudit = async (): Promise<LedgerIntegrityReport> => {
    setIsVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch("/api/vault/verify-integrity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: transaction.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Ledger verification audit failed");
      }
      setIntegrityReport(data.report as LedgerIntegrityReport);
      return data.report as LedgerIntegrityReport;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to verify hash-chain integrity";
      setVerifyError(msg);
      return integrityReport;
    } finally {
      setIsVerifying(false);
    }
  };

  const handleExportProofPackage = async () => {
    const latestReport = await runIntegrityAudit();

    const pkg: ProofOfAgreementPackage = {
      exportedAt: new Date().toISOString(),
      pactPlatformVersion: "0.7.0",
      transaction: {
        id: transaction.id,
        title: transaction.title,
        category: transaction.category,
        status: transaction.status,
        totalAmount: transaction.totalAmount,
        currency: transaction.currency,
        createdAt: transaction.createdAt,
      },
      participants,
      activeAgreementVersion: activeAgreementVersion
        ? {
            id: activeAgreementVersion.id,
            versionNumber: activeAgreementVersion.versionNumber,
            contentHash: activeAgreementVersion.contentHash,
            status: activeAgreementVersion.status,
            createdAt: activeAgreementVersion.createdAt,
            sectionsCount: activeAgreementVersion.sections.length,
            approvals: (activeAgreementVersion.approvals || []).map((a) => ({
              role: a.role,
              userId: a.userId,
              contentHash: a.contentHash,
              approvedAt: a.approvedAt,
            })),
          }
        : null,
      integrityReport: latestReport,
      milestones: milestones.map((m) => ({
        id: m.id,
        title: m.title,
        amount: m.amount,
        currency: m.currency,
        status: m.status,
        paypalCaptureId: m.latestPaymentRecord?.paypalCaptureId || null,
      })),
      driftAlerts: initialDriftAlerts,
      eventLedger: initialEvents,
      complianceNotice:
        "PACT Proof of Agreement Package records canonical SHA-256 hashes, WebAuthn public-key verification metadata, and server-verified PayPal capture IDs without storing raw biometric data or acting as legal escrow.",
    };

    const blob = new Blob([JSON.stringify(pkg, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pact-proof-${transaction.id.slice(0, 8)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const copyHash = (id: string, hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedEventId(id);
    setTimeout(() => setCopiedEventId(null), 2000);
  };

  const formatEventTitle = (type: string) => {
    switch (type) {
      case "term_confirmed":
        return "Term Confirmed";
      case "term_rejected":
        return "Term Rejected";
      case "scenario_resolved":
        return "Contingency Protocol Agreed";
      case "agreement_compiled":
        return "Agreement Version Compiled";
      case "agreement_approved":
        return "Party Signed Agreement";
      case "agreement_locked":
        return "Mutual Agreement Locked";
      case "passkey_verified":
        return "Biometric / Device Passkey Verified";
      case "proof_verified":
        return "Visual Proof Verified (Gemini Vision)";
      case "proof_rejected":
        return "Visual Proof Discrepancy Flagged";
      case "payment_captured":
        return "PayPal Milestone Captured";
      case "dispute_resolved":
        return "AI Dispute Settled & PayPal Refunded";
      case "paypal_invoice_created":
        return "PayPal Official Invoice Generated";
      case "paypal_payout_released":
        return "Seller Payout Released (PayPal Payouts)";
      case "paypal_webhook_captured":
        return "PayPal Webhook: Capture Completed";
      case "paypal_webhook_refunded":
        return "PayPal Webhook: Capture Refunded";
      case "paypal_webhook_dispute":
        return "PayPal Webhook: Customer Dispute Opened";
      case "drift_detected":
        return "Agreement Drift Flagged";
      case "drift_amended":
        return "Amendment Version Created";
      case "drift_dismissed":
        return "Drift Alert Dismissed";
      default:
        return type.replace(/_/g, " ").toUpperCase();
    }
  };

  return (
    <div className="space-y-6">
      {/* Ledger Integrity Header */}
      <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl p-6 shadow-lg shadow-black/20 space-y-5 transition-all duration-200 hover:border-emerald-500/35">
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent transition-opacity duration-200 ${
            integrityReport.is_valid
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
          }`}
        />

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="assurance">Pillar 5</Badge>
              <Badge variant="outline">Hash-Chained Event Ledger</Badge>
              <Badge
                variant={integrityReport.is_valid ? "success" : "destructive"}
                pulse={integrityReport.is_valid}
                className="gap-1 text-xs font-bold"
              >
                {integrityReport.is_valid ? (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Integrity Verified</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-3.5 w-3.5" />
                    <span>Chain Tamper Alert</span>
                  </>
                )}
              </Badge>
              <Badge variant="secondary" className="font-mono tabular-nums tracking-tight text-[11px]">
                {integrityReport.total_events}{" "}
                {integrityReport.total_events === 1 ? "Event" : "Events"} Chained
              </Badge>
            </div>

            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-100 flex items-center gap-2">
              <Archive className="h-6 w-6 text-emerald-400" />
              <span>Tamper-Evident Evidence Vault</span>
            </h2>
            <p className="text-xs text-zinc-400 max-w-2xl">
              Every lifecycle commitment—from confirmed terms and biometric passkey
              signatures to PayPal captures—is SHA-256 linked to its predecessor hash.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={runIntegrityAudit}
              disabled={isVerifying}
              className="gap-1.5 text-xs cursor-pointer active:scale-95 transition-all duration-200"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isVerifying ? "animate-spin" : ""}`} />
              <span>{isVerifying ? "Auditing..." : "Verify Ledger Integrity"}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsDisputeOpen(true)}
              className="gap-1.5 text-xs cursor-pointer active:scale-95 transition-all duration-200"
            >
              <Scale className="h-3.5 w-3.5" />
              <span>Dispute Reconstruction</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsAiDisputeOpen(true)}
              className="gap-1.5 text-xs border-amber-500/35 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 cursor-pointer active:scale-95 transition-all duration-200"
            >
              <Gavel className="h-3.5 w-3.5 text-amber-400" />
              <span>Open AI Dispute</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="assurance"
              onClick={handleExportProofPackage}
              disabled={isVerifying}
              className="gap-1.5 text-xs cursor-pointer active:scale-95 transition-all duration-200"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export Proof of Agreement Package</span>
            </Button>
          </div>
        </div>

        {/* Cryptographic Chain Proof Strip */}
        <div
          className={`p-4 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            integrityReport.is_valid
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
              : "bg-rose-500/10 border-rose-500/25 text-rose-400"
          }`}
        >
          <div className="flex items-start sm:items-center gap-2.5">
            {integrityReport.is_valid ? (
              <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
            ) : (
              <ShieldAlert className="h-4 w-4 shrink-0" />
            )}
            <div className="space-y-0.5">
              <div className="font-bold">
                {integrityReport.is_valid
                  ? "Cryptographic Chain Proof Intact"
                  : `Hash mismatch detected at event ${integrityReport.tampered_event_id}`}
              </div>
              <div className="text-[11px] font-mono tabular-nums tracking-tight opacity-85 break-all">
                Genesis: {integrityReport.genesis_hash} | Head:{" "}
                {integrityReport.latest_event_hash
                  ? `${integrityReport.latest_event_hash.slice(0, 24)}...`
                  : "No events logged yet"}
              </div>
            </div>
          </div>

          <MountedTimestamp
            value={integrityReport.checked_at}
            mode="timeWithSeconds"
            prefix="Audited "
            className="text-[11px] font-mono tabular-nums tracking-tight opacity-85 shrink-0"
          />
        </div>

        {verifyError && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs">
            {verifyError}
          </div>
        )}
      </div>

      {/* Chronological Event Timeline */}
      <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl p-6 shadow-lg shadow-black/20 space-y-4">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        />

        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-emerald-400" />
            <span>
              Cryptographic Event Timeline (
              <span className="font-mono tabular-nums tracking-tight">{initialEvents.length}</span>)
            </span>
          </h3>
          <span className="text-[11px] text-zinc-400 font-mono tracking-tight">
            Append-Only SHA-256 Chain
          </span>
        </div>

        {initialEvents.length > 0 ? (
          <div className="space-y-3">
            {initialEvents.map((ev, index) => {
              const payload = ev.eventPayload || {};
              const isBiometricEvent =
                ev.eventType === "passkey_verified" ||
                payload.biometricSigned === true ||
                Boolean(payload.publicKeyHash);
              const isDisputeResolved = ev.eventType === "dispute_resolved";
              const signerIdentity =
                typeof payload.signerName === "string" && payload.signerName
                  ? payload.signerName
                  : ev.actorName ||
                    (typeof payload.signerEmail === "string"
                      ? payload.signerEmail
                      : null) ||
                    ev.actorRole ||
                    "Verified Signer";

              return (
              <div
                key={ev.id}
                className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-950/65 hover:border-zinc-700 transition-all duration-200 space-y-2"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="h-5 w-5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono tabular-nums tracking-tight text-[10px] font-bold flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span className="text-xs font-bold text-zinc-100">
                      {formatEventTitle(ev.eventType)}
                    </span>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {ev.actorRole || "participant"}
                      {ev.actorName ? `: ${ev.actorName}` : ""}
                    </Badge>
                    {isBiometricEvent && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/45 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300 shadow-[0_0_18px_rgba(16,185,129,0.28)]">
                        <Fingerprint className="h-3 w-3 text-emerald-400" />
                        <span>Biometrically Signed &amp; Hashed</span>
                        <span className="font-mono text-emerald-200/95">
                          · {signerIdentity}
                        </span>
                      </span>
                    )}
                    {isDisputeResolved && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/45 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-semibold text-amber-300 shadow-[0_0_16px_rgba(245,158,11,0.22)]">
                        <Gavel className="h-3 w-3 text-amber-400" />
                        <span>PARTIALLY_REFUNDED</span>
                      </span>
                    )}
                  </div>

                  <span
                    suppressHydrationWarning
                    className="text-[11px] font-mono tabular-nums tracking-tight text-zinc-400 flex items-center gap-1"
                  >
                    <Clock className="h-3 w-3 text-zinc-500" />
                    <MountedTimestamp value={ev.timestamp} mode="datetime" />
                  </span>
                </div>

                {isBiometricEvent &&
                  (typeof payload.publicKeyHash === "string" ||
                    typeof payload.signatureDigest === "string") && (
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] px-3 py-2 text-[10px] font-mono text-zinc-300 space-y-0.5 break-all">
                      {typeof payload.publicKeyHash === "string" && (
                        <div>
                          <strong className="text-emerald-300">Public Key Hash:</strong>{" "}
                          {payload.publicKeyHash}
                        </div>
                      )}
                      {typeof payload.signatureDigest === "string" && (
                        <div>
                          <strong className="text-emerald-300">Signature Payload:</strong>{" "}
                          {payload.signatureDigest}
                        </div>
                      )}
                      {typeof payload.agreementHash === "string" && (
                        <div>
                          <strong className="text-emerald-300">Agreement SHA-256:</strong>{" "}
                          {payload.agreementHash}
                        </div>
                      )}
                    </div>
                  )}

                {isDisputeResolved && (
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 text-[11px] space-y-1.5">
                    {typeof payload.headline === "string" && payload.headline && (
                      <div className="font-bold text-amber-200">{payload.headline}</div>
                    )}
                    <div className="flex flex-wrap gap-3 font-mono text-[10px] text-zinc-300">
                      {typeof payload.refundId === "string" && (
                        <span>
                          <strong className="text-amber-300">Refund ID:</strong>{" "}
                          {payload.refundId}
                        </span>
                      )}
                      {typeof payload.amountRefunded === "number" && (
                        <span>
                          <strong className="text-emerald-300">Refunded:</strong>{" "}
                          {typeof payload.currency === "string" ? `${payload.currency} ` : ""}
                          {payload.amountRefunded.toFixed(2)}
                        </span>
                      )}
                      {typeof payload.captureId === "string" && (
                        <span>
                          <strong className="text-zinc-400">Capture:</strong>{" "}
                          {payload.captureId}
                        </span>
                      )}
                    </div>
                    {typeof payload.rationale === "string" && payload.rationale && (
                      <p className="text-zinc-400 leading-relaxed">{payload.rationale}</p>
                    )}
                  </div>
                )}

                {/* Payload Highlights */}
                {ev.eventPayload && Object.keys(ev.eventPayload).length > 0 && (
                  <div className="space-y-2 pt-1">
                    {typeof ev.eventPayload.imageUrl === "string" &&
                      ev.eventPayload.imageUrl.startsWith("data:image/") && (
                        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-zinc-900/70 p-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={ev.eventPayload.imageUrl}
                            alt={
                              typeof ev.eventPayload.fileName === "string"
                                ? ev.eventPayload.fileName
                                : "Verified Proof Thumbnail"
                            }
                            className="h-12 w-16 rounded object-cover border border-zinc-800 shrink-0"
                          />
                          <div className="min-w-0 text-[11px] space-y-0.5">
                            <p className="font-medium text-zinc-200 truncate">
                              {typeof ev.eventPayload.fileName === "string"
                                ? ev.eventPayload.fileName
                                : "Delivery Proof Image"}
                            </p>
                            {typeof ev.eventPayload.summary === "string" && (
                              <p className="text-zinc-400 line-clamp-2">
                                {ev.eventPayload.summary}
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(ev.eventPayload)
                        .filter(
                          ([k]) =>
                            k !== "imageUrl" &&
                            k !== "specChecklist" &&
                            k !== "summary" &&
                            k !== "biometricSigned" &&
                            k !== "passkeyVerified" &&
                            k !== "rationale" &&
                            k !== "headline" &&
                            k !== "claimNotes"
                        )
                        .slice(0, 5)
                        .map(([k, v]) => (
                          <span
                            key={k}
                            className="px-2 py-0.5 rounded-md bg-zinc-900/90 border border-zinc-800 text-[10px] text-zinc-400 font-mono tracking-tight"
                          >
                            <strong className="text-zinc-200">{k}:</strong>{" "}
                            {typeof v === "string"
                              ? v.slice(0, 48)
                              : JSON.stringify(v).slice(0, 48)}
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {/* Hash & Previous Link */}
                <div className="pt-2 border-t border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] font-mono tabular-nums tracking-tight text-zinc-400">
                  <div className="truncate">
                    Hash: <span className="text-zinc-200">{ev.eventHash.slice(0, 20)}...</span>{" "}
                    | Prev:{" "}
                    <span>
                      {ev.previousEventHash === "GENESIS_HASH"
                        ? "GENESIS_HASH"
                        : `${ev.previousEventHash.slice(0, 12)}...`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => copyHash(ev.id, ev.eventHash)}
                    className="inline-flex items-center gap-1 text-emerald-400 hover:underline cursor-pointer shrink-0 self-end sm:self-auto transition-all duration-200 active:scale-95"
                  >
                    {copiedEventId === ev.id ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-400" />
                        <span className="text-emerald-400">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" />
                        <span>Copy Event Hash</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <div className="border border-dashed border-zinc-800 bg-zinc-950/40 rounded-xl p-8 text-center space-y-2">
            <Archive className="h-8 w-8 text-zinc-500 mx-auto opacity-60" />
            <h4 className="text-sm font-bold text-zinc-100">
              Genesis Ledger Ready
            </h4>
            <p className="text-xs text-zinc-400 max-w-md mx-auto">
              Confirm terms, resolve scenarios, sign an agreement with your Passkey, or
              capture PayPal milestones to populate the tamper-evident audit chain.
            </p>
          </div>
        )}
      </div>

      {/* Neutral Dispute Reconstruction Modal */}
      <DisputeModal
        open={isDisputeOpen}
        onOpenChange={setIsDisputeOpen}
        transaction={transaction}
        participants={participants}
        activeAgreementVersion={activeAgreementVersion}
        messages={messages}
        milestones={milestones}
        paymentRecords={paymentRecords}
        events={initialEvents}
        driftAlerts={initialDriftAlerts}
        integrityReport={integrityReport}
      />

      {/* Autonomous AI Dispute Mediator & PayPal Partial Refund Engine */}
      <DisputeResolutionModal
        open={isAiDisputeOpen}
        onOpenChange={setIsAiDisputeOpen}
        transactionId={transaction.id}
        transactionTitle={transaction.title}
        onRefundExecuted={onRefundExecuted}
      />
    </div>
  );
}
