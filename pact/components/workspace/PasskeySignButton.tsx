"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Fingerprint,
  KeyRound,
  RotateCw,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import {
  isWebAuthnAvailable,
  signAgreementWithBiometrics,
} from "@/lib/webauthn/passkey";
import type { PasskeyAssertionMetadata } from "@/types/passkey";

interface PasskeySignButtonProps {
  transactionId: string;
  agreementVersionId: string;
  versionNumber: number;
  contentHash: string;
  userId?: string;
  disabled?: boolean;
  onApprovedWithPasskey: (verification: PasskeyAssertionMetadata) => Promise<void>;
}

export function PasskeySignButton({
  transactionId,
  agreementVersionId,
  versionNumber,
  contentHash,
  userId = "current-user",
  disabled = false,
  onApprovedWithPasskey,
}: PasskeySignButtonProps) {
  const [webAuthnSupported, setWebAuthnSupported] = React.useState(false);
  const [isSigning, setIsSigning] = React.useState(false);
  const [statusLabel, setStatusLabel] = React.useState<string | null>(null);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setWebAuthnSupported(isWebAuthnAvailable());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleBiometricSign = async (forceFallback = false) => {
    setIsSigning(true);
    setErrorMsg(null);
    setStatusLabel("Initializing biometric signature...");

    try {
      const verification = await signAgreementWithBiometrics({
        transactionId,
        agreementVersionId,
        contentHash,
        userId,
        forceFallback,
        onStatusChange: (status) => setStatusLabel(status),
      });

      setStatusLabel("Appending cryptographic signature to agreement...");
      await onApprovedWithPasskey(verification);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Failed to complete biometric passkey approval"
      );
    } finally {
      setIsSigning(false);
      setStatusLabel(null);
    }
  };

  return (
    <div className="space-y-2 mt-3">
      <Button
        type="button"
        size="sm"
        variant="assurance"
        onClick={() => handleBiometricSign(false)}
        disabled={disabled || isSigning}
        className="w-full text-xs gap-2 cursor-pointer active:scale-95 transition-all duration-200"
      >
        {isSigning ? (
          <RotateCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Fingerprint className="h-3.5 w-3.5" />
        )}
        <span>
          {isSigning
            ? statusLabel || "Confirming Biometric Signature..."
            : `Lock & Sign Agreement (v${versionNumber}.0)`}
        </span>
      </Button>

      <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 text-emerald-400" />
          {webAuthnSupported
            ? "Touch ID / Face ID / Windows Hello + Silent Fallback"
            : "Digital Touch ID Simulation (ECDSA P-256) Active"}
        </span>

        <button
          type="button"
          disabled={disabled || isSigning}
          onClick={() => handleBiometricSign(true)}
          className="inline-flex items-center gap-1 text-emerald-400 hover:underline cursor-pointer disabled:opacity-50 transition-all duration-200 active:scale-95"
        >
          <KeyRound className="h-3 w-3" />
          <span>Digital Touch ID</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
