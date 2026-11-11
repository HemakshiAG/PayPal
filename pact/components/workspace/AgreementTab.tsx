"use client";
import * as React from "react";
import { AgreementVersion } from "@/types/agreement";
import { mapRawAgreementVersion } from "@/lib/agreement/mapper";
import type { PasskeyAssertionMetadata } from "@/types/passkey";
import type { TransactionEvent } from "@/types/vault";
import { AgreementViewer } from "./AgreementViewer";
import { VersionDiffViewer } from "./VersionDiffViewer";
import {
  AgreementVersionCard,
  type BiometricSignatureAudit,
  type GeneratedPayPalInvoiceInfo,
} from "./AgreementVersionCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileCheck,
  RotateCw,
  GitCompare,
  FileText,
  Sparkles,
  AlertCircle,
} from "lucide-react";

interface AgreementTabProps {
  transactionId: string;
  initialVersions: AgreementVersion[];
  initialEvents?: TransactionEvent[];
  currentUserRole: "buyer" | "seller" | "observer";
  participants: {
    buyer: { name: string; id: string } | null;
    seller: { name: string; id: string } | null;
  };
  onAgreementLocked?: () => void;
}

export function AgreementTab({
  transactionId,
  initialVersions,
  initialEvents = [],
  currentUserRole,
  participants,
  onAgreementLocked,
}: AgreementTabProps) {
  const [versions, setVersions] = React.useState<AgreementVersion[]>(initialVersions);
  const [selectedVersionId, setSelectedVersionId] = React.useState<string>(
    initialVersions.length > 0 ? initialVersions[0].id : ""
  );
  const [viewMode, setViewMode] = React.useState<"document" | "diff">("document");
  const [isCompiling, setIsCompiling] = React.useState(false);
  const [isApproving, setIsApproving] = React.useState(false);
  const [copiedHash, setCopiedHash] = React.useState(false);
  const [statusNotice, setStatusNotice] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [localBiometricAudits, setLocalBiometricAudits] = React.useState<
    BiometricSignatureAudit[]
  >([]);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = React.useState(false);
  const [localGeneratedInvoice, setLocalGeneratedInvoice] =
    React.useState<GeneratedPayPalInvoiceInfo | null>(null);

  // Active view version
  const currentVersion =
    versions.find((v) => v.id === selectedVersionId) || versions[0] || null;

  // Previous version for diffing
  const previousVersion = React.useMemo(() => {
    if (!currentVersion || versions.length < 2) return null;
    const sorted = [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
    const currIdx = sorted.findIndex((v) => v.id === currentVersion.id);
    return currIdx < sorted.length - 1 ? sorted[currIdx + 1] : null;
  }, [currentVersion, versions]);

  const copyHash = () => {
    if (!currentVersion) return;
    navigator.clipboard.writeText(currentVersion.contentHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleCompileAgreement = async () => {
    setIsCompiling(true);
    setErrorMessage(null);
    setStatusNotice(null);

    try {
      const res = await fetch("/api/agreements/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to compile agreement");
      }

      const mappedVersions: AgreementVersion[] = (data.versions || []).map(
        (v: Record<string, unknown>) => mapRawAgreementVersion(v)
      );

      setVersions(mappedVersions);
      if (data.currentVersionId) {
        setSelectedVersionId(data.currentVersionId);
      }
      setStatusNotice("Agreement compiled from latest confirmed terms and contingency protocols.");
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Error compiling agreement");
    } finally {
      setIsCompiling(false);
    }
  };

  const handleApproveAgreement = async (
    passkeyVerification?: PasskeyAssertionMetadata
  ) => {
    if (!currentVersion) return;
    setIsApproving(true);
    setErrorMessage(null);
    setStatusNotice(null);

    try {
      const res = await fetch("/api/agreements/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agreementVersionId: currentVersion.id,
          contentHash: currentVersion.contentHash,
          passkeyVerification,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to record approval");
      }

      if (passkeyVerification?.verified) {
        setLocalBiometricAudits((prev) => [
          ...prev,
          {
            signerName:
              passkeyVerification.signerName ||
              (currentUserRole === "seller"
                ? participants.seller?.name || "Seller"
                : participants.buyer?.name || "Buyer"),
            signerRole: currentUserRole,
            publicKeyHash:
              passkeyVerification.publicKeyHash || passkeyVerification.credentialId,
            signatureDigest: passkeyVerification.signatureDigest,
            signaturePayload: passkeyVerification.signaturePayload,
            credentialId: passkeyVerification.credentialId,
            agreementHash: currentVersion.contentHash,
            mode: passkeyVerification.mode,
            timestamp: passkeyVerification.authenticatorTimestamp,
          },
        ]);
      }

      if (data.version) {
        const updatedMapped = mapRawAgreementVersion(
          data.version as Record<string, unknown>
        );
        setVersions((prev) =>
          prev.map((v) => (v.id === updatedMapped.id ? updatedMapped : v))
        );
      }

      onAgreementLocked?.();

      if (data.isMutuallyApproved) {
        setStatusNotice(
          "MUTUAL BIOMETRIC APPROVAL ACHIEVED! Agreement is locked and active."
        );
      } else {
        setStatusNotice(
          data.message || "Your biometric signature has been recorded in Evidence Vault."
        );
      }
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : "Error approving agreement");
    } finally {
      setIsApproving(false);
    }
  };

  const currentBiometricAudits = React.useMemo<BiometricSignatureAudit[]>(() => {
    if (!currentVersion) return [];
    const seenKeys = new Set<string>();
    const results: BiometricSignatureAudit[] = [];

    for (const ev of initialEvents) {
      if (ev.eventType !== "passkey_verified" && ev.eventType !== "agreement_approved") {
        continue;
      }
      const p = ev.eventPayload || {};
      const matchesVersion =
        p.agreementVersionId === currentVersion.id ||
        p.agreementHash === currentVersion.contentHash ||
        p.contentHash === currentVersion.contentHash;
      if (!matchesVersion) continue;

      const credId = typeof p.credentialId === "string" ? p.credentialId : "";
      const pubHash = typeof p.publicKeyHash === "string" ? p.publicKeyHash : "";
      const sigDigest =
        typeof p.signatureDigest === "string" ? p.signatureDigest : "";
      if (!credId && !pubHash && !sigDigest) continue;

      const key = `${credId || ev.actorId}:${sigDigest}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);

      results.push({
        signerName:
          typeof p.signerName === "string" && p.signerName
            ? p.signerName
            : ev.actorName || ev.actorRole || "Participant",
        signerRole:
          typeof p.role === "string" ? p.role : ev.actorRole || undefined,
        publicKeyHash: pubHash || credId,
        signatureDigest: sigDigest || credId,
        signaturePayload:
          typeof p.signaturePayload === "string" ? p.signaturePayload : undefined,
        credentialId: credId,
        agreementHash:
          typeof p.agreementHash === "string"
            ? p.agreementHash
            : currentVersion.contentHash,
        mode:
          typeof p.mode === "string"
            ? p.mode
            : typeof p.passkeyMode === "string"
            ? p.passkeyMode
            : "webauthn_passkey",
        timestamp: ev.timestamp,
      });
    }

    for (const localAudit of localBiometricAudits) {
      if (localAudit.agreementHash !== currentVersion.contentHash) continue;
      const key = `${localAudit.credentialId}:${localAudit.signatureDigest}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        results.push(localAudit);
      }
    }

    return results;
  }, [currentVersion, initialEvents, localBiometricAudits]);

  const currentGeneratedInvoice = React.useMemo<GeneratedPayPalInvoiceInfo | null>(() => {
    if (localGeneratedInvoice) return localGeneratedInvoice;
    if (!currentVersion) return null;

    const matchingEvent = [...initialEvents]
      .reverse()
      .find(
        (ev) =>
          ev.eventType === "paypal_invoice_created" &&
          (ev.eventPayload?.agreementVersionId === currentVersion.id ||
            ev.eventPayload?.agreementHash === currentVersion.contentHash)
      );

    if (!matchingEvent?.eventPayload) return null;
    const p = matchingEvent.eventPayload;
    if (typeof p.invoiceId !== "string" || typeof p.invoiceNumber !== "string") {
      return null;
    }

    return {
      invoiceId: p.invoiceId,
      invoiceNumber: p.invoiceNumber,
      status: typeof p.status === "string" ? p.status : "SENT",
      recipientViewUrl:
        typeof p.recipientViewUrl === "string"
          ? p.recipientViewUrl
          : `https://www.sandbox.paypal.com/invoice/p/#${p.invoiceId}`,
      amount: typeof p.amount === "number" ? p.amount : 0,
      currency: typeof p.currency === "string" ? p.currency : "USD",
      isSimulated: Boolean(p.isSimulated),
    };
  }, [currentVersion, initialEvents, localGeneratedInvoice]);

  const handleGeneratePayPalInvoice = async () => {
    if (!currentVersion || isGeneratingInvoice) return;
    setIsGeneratingInvoice(true);
    setErrorMessage(null);
    setStatusNotice(null);

    try {
      const res = await fetch("/api/payments/create-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          agreementVersionId: currentVersion.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.invoice) {
        throw new Error(data.error || "Failed to generate PayPal invoice");
      }

      setLocalGeneratedInvoice(data.invoice as GeneratedPayPalInvoiceInfo);
      setStatusNotice(
        `Official PayPal Invoice ${data.invoice.invoiceNumber} generated and dispatched.`
      );
      onAgreementLocked?.();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Error generating PayPal invoice"
      );
    } finally {
      setIsGeneratingInvoice(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl p-6 shadow-lg shadow-black/20 space-y-4 transition-all duration-200 hover:border-emerald-500/35">
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent transition-opacity duration-200 ${
            currentVersion?.status === "active"
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
          }`}
        />

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="assurance">Pillar 3</Badge>
              <Badge variant="outline">Versioned Contract Engine</Badge>
              {currentVersion && (
                <Badge
                  variant={
                    currentVersion.status === "active"
                      ? "success"
                      : currentVersion.status === "superseded"
                      ? "secondary"
                      : "warning"
                  }
                  pulse={currentVersion.status === "active"}
                  className="uppercase text-xs font-mono tracking-tight font-bold"
                >
                  V{currentVersion.versionNumber} • {currentVersion.status}
                </Badge>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-zinc-100 flex items-center gap-2">
              <FileCheck className="h-6 w-6 text-emerald-400" />
              <span>Grouped Agreement & Versioning Engine</span>
            </h2>
            <p className="text-xs text-zinc-400 max-w-2xl">
              Clauses are synthesized into 13 formal contract sections with full source citations.
              Every modification generates an immutable SHA-256 version.
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Version Selector Dropdown */}
            {versions.length > 1 && (
              <select
                value={selectedVersionId}
                onChange={(e) => setSelectedVersionId(e.target.value)}
                className="h-9 text-xs font-mono tracking-tight rounded-xl border border-zinc-800 bg-zinc-950/80 px-3 font-medium text-zinc-100 cursor-pointer transition-all duration-200 hover:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    Version V{v.versionNumber} ({v.status.toUpperCase()})
                  </option>
                ))}
              </select>
            )}

            <Button
              onClick={handleCompileAgreement}
              disabled={isCompiling}
              className="gap-2 cursor-pointer text-xs active:scale-95 transition-all duration-200"
            >
              {isCompiling ? (
                <RotateCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span>{isCompiling ? "Compiling..." : "Compile / Sync Terms"}</span>
            </Button>
          </div>
        </div>

        {/* Version Card: SHA-256 Fingerprint, WebAuthn Biometric Signing & Mutual Lock */}
        {currentVersion && (
          <AgreementVersionCard
            transactionId={transactionId}
            version={currentVersion}
            currentUserRole={currentUserRole}
            participants={participants}
            isApproving={isApproving}
            copiedHash={copiedHash}
            biometricAudits={currentBiometricAudits}
            generatedInvoice={currentGeneratedInvoice}
            isGeneratingInvoice={isGeneratingInvoice}
            onCopyHash={copyHash}
            onApproveWithPasskey={handleApproveAgreement}
            onGeneratePayPalInvoice={handleGeneratePayPalInvoice}
          />
        )}

        {statusNotice && (
          <div className="p-3 rounded-xl bg-zinc-950/75 border border-emerald-500/25 text-xs text-zinc-200 flex items-center justify-between gap-3">
            <span>{statusNotice}</span>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="text-[11px] font-semibold text-emerald-400 hover:underline cursor-pointer transition-all duration-200 active:scale-95"
            >
              Dismiss
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs text-rose-400 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* View Switcher: Document vs Diff */}
      {currentVersion && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 bg-zinc-950/70 backdrop-blur-xl p-1 rounded-xl border border-zinc-800/80">
            <button
              type="button"
              onClick={() => setViewMode("document")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 active:scale-95 cursor-pointer ${
                viewMode === "document"
                  ? "bg-zinc-950 text-zinc-100 border border-zinc-700/80 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              <span>Agreement Document</span>
            </button>

            {previousVersion && (
              <button
                type="button"
                onClick={() => setViewMode("diff")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 active:scale-95 cursor-pointer ${
                  viewMode === "diff"
                    ? "bg-zinc-950 text-zinc-100 border border-zinc-700/80 shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <GitCompare className="h-3.5 w-3.5" />
                <span>
                  Version Diff (<span className="font-mono tracking-tight">V{previousVersion.versionNumber} vs V{currentVersion.versionNumber}</span>)
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {currentVersion ? (
        viewMode === "document" ? (
          <AgreementViewer sections={currentVersion.sections} />
        ) : previousVersion ? (
          <VersionDiffViewer
            oldVersion={previousVersion}
            newVersion={currentVersion}
          />
        ) : null
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40 backdrop-blur-md p-12 text-center space-y-3">
          <FileCheck className="h-10 w-10 text-zinc-500 mx-auto opacity-60" />
          <h3 className="text-sm font-bold text-zinc-100">No Agreement Version Compiled Yet</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            Click &quot;Compile / Sync Terms&quot; above to assemble confirmed terms and agreed contingencies into the 13-section PACT agreement.
          </p>
          <Button
            onClick={handleCompileAgreement}
            disabled={isCompiling}
            size="sm"
            className="mt-2 text-xs gap-1.5 cursor-pointer active:scale-95 transition-all duration-200"
          >
            <Sparkles className="h-3.5 w-3.5" />
            <span>Compile Version 1 Draft</span>
          </Button>
        </div>
      )}
    </div>
  );
}

