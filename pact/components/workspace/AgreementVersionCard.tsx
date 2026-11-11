"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PasskeySignButton } from "./PasskeySignButton";
import type { AgreementVersion } from "@/types/agreement";
import type { PasskeyAssertionMetadata } from "@/types/passkey";
import {
  Check,
  Copy,
  ExternalLink,
  Fingerprint,
  Lock,
  Receipt,
  RotateCw,
  ShieldCheck,
  UserCheck,
} from "lucide-react";

export interface GeneratedPayPalInvoiceInfo {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  recipientViewUrl: string;
  amount: number;
  currency: string;
  isSimulated?: boolean;
  simulationNotice?: string;
}

export interface BiometricSignatureAudit {
  signerName: string;
  signerRole?: "buyer" | "seller" | string;
  publicKeyHash: string;
  signatureDigest: string;
  signaturePayload?: string;
  credentialId: string;
  agreementHash: string;
  mode: string;
  timestamp: string;
}

interface AgreementVersionCardProps {
  transactionId: string;
  version: AgreementVersion;
  currentUserRole: "buyer" | "seller" | "observer";
  participants: {
    buyer: { name: string; id: string } | null;
    seller: { name: string; id: string } | null;
  };
  isApproving: boolean;
  copiedHash: boolean;
  biometricAudits?: BiometricSignatureAudit[];
  generatedInvoice?: GeneratedPayPalInvoiceInfo | null;
  isGeneratingInvoice?: boolean;
  onCopyHash: () => void;
  onApproveWithPasskey: (verification: PasskeyAssertionMetadata) => Promise<void>;
  onGeneratePayPalInvoice?: () => Promise<void>;
}

export function AgreementVersionCard({
  transactionId,
  version,
  currentUserRole,
  participants,
  isApproving,
  copiedHash,
  biometricAudits = [],
  generatedInvoice = null,
  isGeneratingInvoice = false,
  onCopyHash,
  onApproveWithPasskey,
  onGeneratePayPalInvoice,
}: AgreementVersionCardProps) {
  const hasBuyerApproved = Boolean(version.buyerApproved);
  const hasSellerApproved = Boolean(version.sellerApproved);
  const isMutuallyApproved = Boolean(version.isMutuallyApproved);

  return (
    <div className="space-y-4">
      {/* Cryptographic SHA-256 Agreement Fingerprint Bar */}
      <div className="p-3 rounded-xl bg-zinc-950/75 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
          <div className="flex flex-wrap items-baseline gap-1.5 font-mono tabular-nums tracking-tight text-[11px] min-w-0">
            <span className="font-bold text-zinc-200">
              Agreement SHA-256 (v{version.versionNumber}.0):
            </span>
            <span className="text-zinc-400 break-all">{version.contentHash}</span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onCopyHash}
          className="h-7 px-2.5 text-[11px] gap-1 cursor-pointer shrink-0 self-end sm:self-auto active:scale-95 transition-all duration-200"
        >
          {copiedHash ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" />
              <span className="text-emerald-400 font-semibold">Copied SHA-256</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy Hash</span>
            </>
          )}
        </Button>
      </div>

      {/* Appended Biometric Signatures & Public Key Hashes */}
      {biometricAudits.length > 0 && (
        <div className="space-y-2 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/45 bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.28)]">
              <Fingerprint className="h-3.5 w-3.5 text-emerald-400" />
              <span>Biometrically Signed &amp; Hashed</span>
            </span>
            <span className="font-mono text-[10px] text-emerald-300/80 uppercase tracking-wider">
              {biometricAudits.length} WebAuthn Proof
              {biometricAudits.length === 1 ? "" : "s"} Appended
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 pt-1">
            {biometricAudits.map((audit, idx) => (
              <div
                key={`${audit.credentialId}-${idx}`}
                className="rounded-lg border border-emerald-500/20 bg-zinc-950/80 p-3 text-[11px] font-mono space-y-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-emerald-300 font-semibold">
                    Signer: {audit.signerName}
                    {audit.signerRole ? ` (${audit.signerRole})` : ""}
                  </span>
                  <span className="text-zinc-400 text-[10px]">
                    {audit.mode === "webauthn_passkey"
                      ? "Hardware Passkey"
                      : "Digital Touch ID"}
                  </span>
                </div>
                <div className="text-zinc-400 break-all">
                  <span className="text-zinc-200">Public Key Hash:</span>{" "}
                  {audit.publicKeyHash}
                </div>
                <div className="text-zinc-400 break-all">
                  <span className="text-zinc-200">Signature Payload:</span>{" "}
                  {audit.signatureDigest}
                </div>
                <div className="text-zinc-400 break-all">
                  <span className="text-zinc-200">Bound Agreement SHA-256:</span>{" "}
                  {audit.agreementHash}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dual Mutual Approval Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        {/* Buyer Approval Card */}
        <div
          className={`p-4 rounded-xl border transition-all duration-200 ${
            hasBuyerApproved
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-zinc-800/80 bg-zinc-950/65 hover:border-zinc-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
              <UserCheck className="h-4 w-4 text-emerald-400" />
              Buyer Approval: {participants.buyer?.name || "Buyer"}
            </span>
            <Badge
              variant={hasBuyerApproved ? "success" : "outline"}
              className="text-[10px] font-semibold"
            >
              {hasBuyerApproved ? "Approved & Signed" : "Awaiting Signature"}
            </Badge>
          </div>

          <p className="text-[11px] text-zinc-400">
            {hasBuyerApproved
              ? "Buyer has formally approved this exact SHA-256 agreement fingerprint."
              : "Click below to verify via Touch ID, Face ID, or Windows Hello."}
          </p>

          {currentUserRole === "buyer" &&
            !hasBuyerApproved &&
            version.status !== "superseded" && (
              <PasskeySignButton
                transactionId={transactionId}
                agreementVersionId={version.id}
                versionNumber={version.versionNumber}
                contentHash={version.contentHash}
                userId={participants.buyer?.id}
                disabled={isApproving}
                onApprovedWithPasskey={onApproveWithPasskey}
              />
            )}
        </div>

        {/* Seller Approval Card */}
        <div
          className={`p-4 rounded-xl border transition-all duration-200 ${
            hasSellerApproved
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-zinc-800/80 bg-zinc-950/65 hover:border-zinc-700"
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
              <UserCheck className="h-4 w-4 text-emerald-400" />
              Seller Approval: {participants.seller?.name || "Seller"}
            </span>
            <Badge
              variant={hasSellerApproved ? "success" : "outline"}
              className="text-[10px] font-semibold"
            >
              {hasSellerApproved ? "Approved & Signed" : "Awaiting Signature"}
            </Badge>
          </div>

          <p className="text-[11px] text-zinc-400">
            {hasSellerApproved
              ? "Seller has formally approved this exact SHA-256 agreement fingerprint."
              : "Click below to verify via Touch ID, Face ID, or Windows Hello."}
          </p>

          {currentUserRole === "seller" &&
            !hasSellerApproved &&
            version.status !== "superseded" && (
              <PasskeySignButton
                transactionId={transactionId}
                agreementVersionId={version.id}
                versionNumber={version.versionNumber}
                contentHash={version.contentHash}
                userId={participants.seller?.id}
                disabled={isApproving}
                onApprovedWithPasskey={onApproveWithPasskey}
              />
            )}
        </div>
      </div>

      {/* Mutual Activation Alert & Optional PayPal Invoice Generation */}
      {isMutuallyApproved && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 shrink-0 text-emerald-400" />
              <span>
                <strong>MUTUAL LOCK ACTIVE:</strong> Both parties have approved Agreement
                Version{" "}
                <span className="font-mono tracking-tight">
                  v{version.versionNumber}.0
                </span>
                . The commercial contract is locked and PayPal milestone funding is active.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Badge variant="success" pulse className="text-[10px] font-bold">
                ACTIVE CONTRACT
              </Badge>
              {onGeneratePayPalInvoice && currentUserRole !== "observer" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isGeneratingInvoice}
                  onClick={onGeneratePayPalInvoice}
                  className="h-7 px-3 text-[11px] font-semibold border-sky-500/35 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25 hover:text-sky-200 gap-1.5 cursor-pointer active:scale-95 transition-all duration-200"
                >
                  {isGeneratingInvoice ? (
                    <>
                      <RotateCw className="h-3 w-3 animate-spin" />
                      <span>Generating Invoice...</span>
                    </>
                  ) : (
                    <>
                      <Receipt className="h-3 w-3 text-sky-400" />
                      <span>
                        {generatedInvoice
                          ? "Regenerate PayPal Invoice"
                          : "Generate PayPal Invoice"}
                      </span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          {generatedInvoice && (
            <div className="rounded-lg border border-sky-500/25 bg-zinc-950/75 p-3 flex flex-wrap items-center justify-between gap-3 text-[11px]">
              <div className="space-y-0.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-sky-300 flex items-center gap-1.5">
                    <Receipt className="h-3.5 w-3.5 text-sky-400" />
                    Official PayPal Invoice Dispatched
                  </span>
                  <Badge variant="outline" className="font-mono text-[10px] border-sky-500/30 text-sky-300">
                    {generatedInvoice.status}
                  </Badge>
                  {generatedInvoice.isSimulated && (
                    <span className="text-[10px] text-amber-300/90 font-mono">
                      (Sandbox Preview)
                    </span>
                  )}
                </div>
                <div className="font-mono text-zinc-400 flex flex-wrap gap-3">
                  <span>
                    <strong className="text-zinc-200">Invoice #:</strong>{" "}
                    {generatedInvoice.invoiceNumber}
                  </span>
                  <span>
                    <strong className="text-zinc-200">Amount:</strong>{" "}
                    {generatedInvoice.currency} {generatedInvoice.amount.toFixed(2)}
                  </span>
                </div>
              </div>

              <a
                href={generatedInvoice.recipientViewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 font-semibold text-sky-300 hover:bg-sky-500/20 transition-colors shrink-0"
              >
                <span>Open PayPal Invoice</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

