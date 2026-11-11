"use client";

import React, { useRef, useState } from "react";
import { MountedTimestamp } from "@/components/ui/mounted-timestamp";
import type {
  StoredVisualProof,
  VerifyProofApiResponse,
  VisualProofPayoutReceipt,
} from "@/types/proof";

interface ProofOfDeliveryCardProps {
  transactionId: string;
  transactionTitle?: string;
  transactionCategory?: string;
  currentUserRole: "buyer" | "seller" | "observer";
  activeAgreementVersion?: {
    id: string;
    versionNumber: number;
    contentHash: string;
    title?: string;
    sections?: unknown;
  } | null;
  nextMilestoneId?: string | null;
  initialProof?: StoredVisualProof | null;
  initialPayout?: VisualProofPayoutReceipt | null;
  onProofVerified: (
    proof: StoredVisualProof | null,
    payout?: VisualProofPayoutReceipt | null
  ) => void;
}

async function createCompactPreviewDataUrl(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(undefined);
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        resolve(undefined);
        return;
      }

      const img = new Image();
      img.onerror = () => resolve(result.length <= 120_000 ? result : undefined);
      img.onload = () => {
        const maxSide = 520;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height, 1));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(result.length <= 120_000 ? result : undefined);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL("image/jpeg", 0.74);
        resolve(compressed.length <= 120_000 ? compressed : undefined);
      };
      img.src = result;
    };
    reader.readAsDataURL(file);
  });
}

async function createSampleDeliverableFile(title: string): Promise<File | null> {
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 460;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#0b0f17";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#10b981";
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, 680, 420);

  ctx.fillStyle = "#18181b";
  ctx.fillRect(48, 92, 624, 240);
  ctx.strokeStyle = "#3f3f46";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(48, 92, 624, 240);

  for (let i = 0; i < 4; i++) {
    const x = 76 + i * 146;
    ctx.fillStyle = "#09090b";
    ctx.fillRect(x, 126, 122, 168);
    ctx.strokeStyle = "#52525b";
    ctx.strokeRect(x, 126, 122, 168);
    ctx.fillStyle = "#e4e4e7";
    ctx.font = "bold 13px monospace";
    ctx.fillText(`LOT #0${i + 1}`, x + 18, 160);
    ctx.fillStyle = "#10b981";
    ctx.font = "11px monospace";
    ctx.fillText("SEALED POLY", x + 14, 266);
  }

  ctx.fillStyle = "#10b981";
  ctx.font = "bold 14px monospace";
  ctx.fillText("PACT VISUAL QC // DISPATCH READY", 48, 62);
  ctx.fillStyle = "#f4f4f5";
  ctx.font = "13px sans-serif";
  ctx.fillText(`Inspection Batch: ${title.slice(0, 48)}`, 48, 378);
  ctx.fillStyle = "#a1a1aa";
  ctx.font = "12px monospace";
  ctx.fillText("STATUS: BAGGED • COLORWAY CHECKED • READY FOR PAYPAL RELEASE", 48, 404);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png")
  );
  if (!blob) return null;
  return new File([blob], "pact-sample-deliverable.png", { type: "image/png" });
}

export function ProofOfDeliveryCard({
  transactionId,
  transactionTitle = "Commercial Order",
  transactionCategory,
  currentUserRole,
  activeAgreementVersion,
  nextMilestoneId,
  initialProof = null,
  initialPayout = null,
  onProofVerified,
}: ProofOfDeliveryCardProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [localProof, setLocalProof] = useState<StoredVisualProof | null>(null);
  const [localPayout, setLocalPayout] = useState<VisualProofPayoutReceipt | null>(null);
  const [localPreviewSrc, setLocalPreviewSrc] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isIssuingPayout, setIsIssuingPayout] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const proof = localProof ?? initialProof;
  const payout = localPayout ?? initialPayout;
  const previewSrc = localPreviewSrc ?? proof?.imageUrl ?? null;

  const canUpload = currentUserRole !== "observer";

  const analyzeFile = async (file: File) => {
    if (!canUpload) return;
    if (!file.type.startsWith("image/")) {
      setErrorMsg("Please upload a valid image file (PNG, JPG, or WebP).");
      return;
    }

    setErrorMsg(null);
    setIsScanning(true);

    const localObjectUrl = URL.createObjectURL(file);
    setLocalPreviewSrc(localObjectUrl);

    try {
      const compactPreview = await createCompactPreviewDataUrl(file);
      const lockedContractPayload = {
        transactionTitle,
        transactionCategory: transactionCategory || "Commercial",
        agreementVersion: activeAgreementVersion
          ? {
            id: activeAgreementVersion.id,
            versionNumber: activeAgreementVersion.versionNumber,
            contentHash: activeAgreementVersion.contentHash,
            title: activeAgreementVersion.title || transactionTitle,
            sections: activeAgreementVersion.sections || [],
          }
          : null,
      };

      const formData = new FormData();
      formData.append("image", file);
      formData.append("transactionId", transactionId);
      if (nextMilestoneId) {
        formData.append("milestoneId", nextMilestoneId);
      }
      if (compactPreview) {
        formData.append("previewDataUrl", compactPreview);
      }
      formData.append("lockedContract", JSON.stringify(lockedContractPayload));

      const response = await fetch("/api/ai/verify-proof", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as Partial<VerifyProofApiResponse> & {
        error?: string;
      };

      if (!response.ok || !payload.proof) {
        throw new Error(payload.error || "Visual verification failed.");
      }

      const verifiedProof = payload.proof;
      const verifiedPayout = payload.payout ?? null;
      setLocalProof(verifiedProof);
      if (verifiedPayout) {
        setLocalPayout(verifiedPayout);
      }
      if (verifiedProof.imageUrl) {
        setLocalPreviewSrc(verifiedProof.imageUrl);
      }
      onProofVerified(verifiedProof, verifiedPayout);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to inspect delivery proof."
      );
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void analyzeFile(file);
    }
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void analyzeFile(file);
    }
  };

  const handleRunSample = async () => {
    const sampleFile = await createSampleDeliverableFile(transactionTitle);
    if (sampleFile) {
      await analyzeFile(sampleFile);
    }
  };

  const handleReleaseSellerPayout = async () => {
    if (!proof?.isApproved || isIssuingPayout) return;
    setErrorMsg(null);
    setIsIssuingPayout(true);

    try {
      const res = await fetch("/api/payments/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          milestoneId: nextMilestoneId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.payout) {
        throw new Error(data.error || "Unable to issue PayPal seller payout");
      }
      setLocalPayout(data.payout as VisualProofPayoutReceipt);
      onProofVerified(proof, data.payout as VisualProofPayoutReceipt);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "Failed to trigger seller payout"
      );
    } finally {
      setIsIssuingPayout(false);
    }
  };

  const isApproved = Boolean(proof?.isApproved);

  return (
    <section
      aria-label="Gemini Vision Proof of Delivery"
      className="group relative overflow-hidden bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-xl rounded-xl p-6 shadow-2xl shadow-black/40 transition-all duration-200 hover:border-zinc-700/80"
    >
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${isApproved
            ? "via-emerald-500/60"
            : isScanning
              ? "via-emerald-400/80"
              : "via-amber-500/35"
          } to-transparent`}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
              VISUAL_DELIVERY_GATE // GEMINI_VISION
            </span>
            {isScanning ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 text-[11px] font-mono text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                SCANNING SPECS
              </span>
            ) : isApproved && proof ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/35 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.25)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {proof.matchConfidence}% Spec Match
              </span>
            ) : proof && !proof.isApproved ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-500/15 border border-rose-500/35 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-rose-300">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
                {proof.matchConfidence}% Match • Hold Active
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 px-2.5 py-0.5 text-[11px] font-mono text-amber-300">
                Payout Gated Until Proof Verified
              </span>
            )}
          </div>
          <h3 className="mt-1.5 text-lg font-semibold text-zinc-100">
            AI Proof-of-Delivery Inspection
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Seller uploads final deliverable photos so Gemini Vision audits quantity,
            colorway, and packaging against your locked SHA-256 contract before unlocking
            PayPal milestone release.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {proof && (
            <span className="rounded-md border border-zinc-800 bg-zinc-950/80 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
              {proof.provider === "gemini-vision" ? "Gemini Vision" : "Spec Engine"}
            </span>
          )}
          {canUpload && (
            <button
              type="button"
              disabled={isScanning}
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-zinc-700/80 bg-zinc-950/90 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-all duration-200 hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-50"
            >
              {proof ? "Re-upload Photo" : "Choose Photo"}
            </button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {errorMsg && (
        <div className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Upload / Visual Preview Scanner */}
        <div className="lg:col-span-5">
          {isScanning && previewSrc ? (
            <div className="relative h-60 w-full overflow-hidden rounded-xl border border-emerald-500/40 bg-zinc-950">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewSrc}
                alt="Scanning deliverable proof"
                className="h-full w-full object-cover opacity-55 brightness-90"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-emerald-500/10 via-transparent to-zinc-950/90" />
              <div className="animate-pact-scan pointer-events-none absolute inset-x-0 h-0.5 bg-emerald-400 shadow-[0_0_18px_4px_rgba(16,185,129,0.75)]" />
              <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg border border-emerald-500/30 bg-zinc-950/90 px-3 py-2 backdrop-blur-md">
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  Analyzing visual specs with Gemini Vision...
                </div>
                <p className="mt-0.5 font-mono text-[10px] text-zinc-400">
                  CROSS-CHECKING QUANTITY • COLORWAY • PACKAGING
                </p>
              </div>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                if (canUpload) setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => {
                if (canUpload && !isScanning) fileInputRef.current?.click();
              }}
              role={canUpload ? "button" : undefined}
              tabIndex={canUpload ? 0 : undefined}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && canUpload && !isScanning) {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={`relative flex flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed transition-all duration-200 ${previewSrc ? "h-60" : "min-h-[210px] p-5"
                } ${isDragging
                  ? "border-emerald-400 bg-emerald-500/10"
                  : isApproved
                    ? "border-emerald-500/35 bg-zinc-950/80 hover:border-emerald-400/60"
                    : "border-zinc-700/80 bg-zinc-950/60 hover:border-zinc-500/80"
                } ${canUpload ? "cursor-pointer" : "cursor-default"}`}
            >
              {previewSrc ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewSrc}
                    alt={proof?.fileName || "Uploaded proof of delivery"}
                    className="h-full w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-zinc-950/95 via-zinc-950/70 to-transparent px-3.5 py-2.5 flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-[11px] text-zinc-200">
                      {proof?.fileName || "proof-image"}
                    </span>
                    <span className="text-[11px] text-emerald-300 font-medium shrink-0">
                      Click to replace
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-center max-w-xs space-y-2.5">
                  <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-emerald-400">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      className="h-5 w-5"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-200">
                      Drop deliverable photo here or browse
                    </p>
                    <p className="text-xs text-zinc-400 mt-1">
                      PNG, JPG, or WebP up to 10MB • Verified against contract specs
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {canUpload && !isScanning && (
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <span className="font-mono text-[10px] text-zinc-500">
                HASHED TO VAULT ON VERIFICATION
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleRunSample();
                }}
                className="text-[11px] font-medium text-emerald-400 hover:text-emerald-300 underline underline-offset-4 transition-colors"
              >
                Use Sample Proof Image
              </button>
            </div>
          )}
        </div>

        {/* Right: Spec Verification Checklist & Payout Gate Status */}
        <div className="lg:col-span-7 space-y-3">
          {proof ? (
            <>
              <div
                className={`rounded-xl border p-4 ${isApproved
                    ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                    : "border-rose-500/30 bg-rose-500/[0.06]"
                  }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${isApproved
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-rose-500/20 text-rose-300"
                        }`}
                    >
                      {isApproved ? "✓" : "!"}
                    </span>
                    <span className="text-sm font-semibold text-zinc-100">
                      {isApproved
                        ? "Deliverable Approved — PayPal Release Unlocked"
                        : "Visual Discrepancy Detected — Payout Held"}
                    </span>
                  </div>
                  <MountedTimestamp
                    value={proof.verifiedAt}
                    mode="timeWithSeconds"
                    className="font-mono text-xs text-zinc-400"
                  />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-zinc-300">
                  {proof.summary}
                </p>

                {isApproved && (
                  <div className="mt-3 pt-3 border-t border-emerald-500/20 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    {payout?.executed ? (
                      <div className="flex flex-wrap items-center gap-2 text-emerald-300">
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-0.5 font-semibold">
                          ✓ PayPal Payout Dispatched
                        </span>
                        <span className="font-mono text-zinc-300">
                          Batch: {payout.payoutBatchId} · {payout.currency}{" "}
                          {Number(payout.amount || 0).toFixed(2)} → {payout.sellerEmail} (
                          {payout.batchStatus})
                        </span>
                      </div>
                    ) : (
                      <>
                        <span className="text-zinc-400">
                          {payout?.skippedReason ||
                            "Ready to disburse captured balance directly to Seller's PayPal account."}
                        </span>
                        {currentUserRole !== "observer" && (
                          <button
                            type="button"
                            disabled={isIssuingPayout}
                            onClick={handleReleaseSellerPayout}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-400/35 bg-indigo-500/15 px-3 py-1 font-semibold text-indigo-300 hover:bg-indigo-500/25 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {isIssuingPayout
                              ? "Issuing PayPal Payout..."
                              : "Trigger Seller Payout"}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                  Contract Spec Checklist (
                  {Array.isArray(proof?.specChecklist)
                    ? proof.specChecklist.length
                    : 0}
                  )
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {(Array.isArray(proof?.specChecklist)
                    ? proof.specChecklist
                    : []
                  ).map((item, idx) => {
                    const specTitle =
                      typeof item?.spec === "string"
                        ? item.spec
                        : "Specification Check";
                    return (
                      <div
                        key={`${specTitle}-${idx}`}
                        className={`flex items-start gap-3 rounded-lg border px-3.5 py-2.5 transition-colors ${
                          item?.passed
                            ? "border-emerald-500/20 bg-zinc-950/75"
                            : "border-rose-500/25 bg-rose-950/20"
                        }`}
                      >
                        <span
                          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                            item?.passed
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                          }`}
                        >
                          {item?.passed ? "✓" : "✕"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-zinc-100">
                            {item?.passed
                              ? `✓ ${specTitle.replace(/^✓\s*/, "")}`
                              : specTitle}
                          </p>
                          <p className="mt-0.5 text-[11px] text-zinc-400">
                            {item?.notes || ""}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/60 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-200">
                  Awaiting Visual Verification
                </span>
                <span className="font-mono text-[11px] text-amber-400">
                  PAYPAL_RELEASE: LOCKED
                </span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Upload a photo of the completed batch, packaged cartons, or milestone
                deliverable. Gemini Vision compares the image directly against your
                active contract checklist before the{" "}
                <span className="text-zinc-200 font-medium">
                  Release PayPal Milestone Payout
                </span>{" "}
                button unlocks.
              </p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {["Item Spec", "Batch Quantity", "Color & Finish", "Packaging"].map(
                  (label) => (
                    <div
                      key={label}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-[11px] text-zinc-400 flex items-center gap-2"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
                      {label}
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
