import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logTransactionEvent } from "@/lib/ledger/events";
import { executeSellerMilestonePayout } from "@/lib/paypal/payouts";
import {
  normalizeBase64Image,
  verifyDeliveryProofWithVision,
} from "@/services/ai/vision";
import type { StoredVisualProof } from "@/types/proof";
import { VerifyProofJsonRequestSchema } from "@/validations/proof";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_STORED_PREVIEW_CHARS = 120_000;

function sanitizePreviewUrl(candidate?: string | null): string | undefined {
  if (!candidate) return undefined;
  const trimmed = candidate.trim();
  if (
    trimmed.startsWith("data:image/") &&
    trimmed.length <= MAX_STORED_PREVIEW_CHARS
  ) {
    return trimmed;
  }
  return undefined;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const contentType = request.headers.get("content-type") || "";
    let transactionId = "";
    let milestoneId: string | null = null;
    let fileName = "deliverable-proof.jpg";
    let mimeType = "image/jpeg";
    let imageBase64 = "";
    let previewDataUrl: string | undefined;
    let lockedContract: unknown;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const txField = formData.get("transactionId");
      const milestoneField = formData.get("milestoneId");
      const contractField = formData.get("lockedContract");
      const previewField = formData.get("previewDataUrl");
      const imageEntry = formData.get("image") || formData.get("file");

      transactionId = typeof txField === "string" ? txField.trim() : "";
      milestoneId =
        typeof milestoneField === "string" && milestoneField.trim()
          ? milestoneField.trim()
          : null;
      previewDataUrl =
        typeof previewField === "string"
          ? sanitizePreviewUrl(previewField)
          : undefined;

      if (typeof contractField === "string" && contractField.trim()) {
        try {
          lockedContract = JSON.parse(contractField);
        } catch {
          lockedContract = contractField;
        }
      }

      if (imageEntry instanceof File) {
        if (imageEntry.size === 0) {
          return NextResponse.json(
            { error: "Uploaded image file is empty." },
            { status: 400 }
          );
        }
        if (imageEntry.size > MAX_UPLOAD_BYTES) {
          return NextResponse.json(
            { error: "Image exceeds the 10MB verification limit." },
            { status: 400 }
          );
        }
        fileName = imageEntry.name || fileName;
        mimeType = imageEntry.type || mimeType;
        const arrayBuffer = await imageEntry.arrayBuffer();
        imageBase64 = Buffer.from(arrayBuffer).toString("base64");
        if (!previewDataUrl && imageBase64.length <= MAX_STORED_PREVIEW_CHARS) {
          previewDataUrl = `data:${mimeType};base64,${imageBase64}`;
        }
      } else if (typeof imageEntry === "string" && imageEntry.trim()) {
        const normalized = normalizeBase64Image(imageEntry);
        imageBase64 = normalized.base64;
        mimeType = normalized.mimeType;
        previewDataUrl =
          previewDataUrl || sanitizePreviewUrl(imageEntry);
      }
    } else {
      const rawBody = await request.json().catch(() => null);
      const parsed = VerifyProofJsonRequestSchema.safeParse(rawBody);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Invalid request payload.",
            details: parsed.error.flatten(),
          },
          { status: 400 }
        );
      }

      transactionId = parsed.data.transactionId;
      milestoneId = parsed.data.milestoneId ?? null;
      fileName = parsed.data.fileName || fileName;
      lockedContract = parsed.data.lockedContract;

      const rawImage = parsed.data.imageDataUrl || parsed.data.imageBase64 || "";
      if (rawImage) {
        const normalized = normalizeBase64Image(
          rawImage,
          parsed.data.mimeType || "image/jpeg"
        );
        imageBase64 = normalized.base64;
        mimeType = parsed.data.mimeType || normalized.mimeType;
      }

      previewDataUrl =
        sanitizePreviewUrl(parsed.data.previewDataUrl) ||
        sanitizePreviewUrl(parsed.data.imageDataUrl);
    }

    if (!transactionId) {
      return NextResponse.json(
        { error: "Missing transactionId." },
        { status: 400 }
      );
    }

    if (!imageBase64) {
      return NextResponse.json(
        { error: "Please attach a delivery proof image." },
        { status: 400 }
      );
    }

    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .select("id, title, description, category, total_amount, currency, creator_id")
      .eq("id", transactionId)
      .single();

    if (txError || !transaction) {
      return NextResponse.json(
        { error: "Transaction not found." },
        { status: 404 }
      );
    }

    const { data: participant } = await supabase
      .from("transaction_participants")
      .select("user_id, role")
      .eq("transaction_id", transactionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (transaction.creator_id !== user.id && !participant) {
      return NextResponse.json(
        { error: "Forbidden: Not a participant of this transaction." },
        { status: 403 }
      );
    }

    const { data: agreements } = await supabase
      .from("agreement_versions")
      .select("id, version_number, content_hash, title, sections, status")
      .eq("transaction_id", transactionId)
      .order("version_number", { ascending: false });

    const activeAgreement =
      agreements?.find((ag) => ag.status === "active") || agreements?.[0] || null;

    const { data: terms } = await supabase
      .from("extracted_terms")
      .select("term_key, term_value, category, status")
      .eq("transaction_id", transactionId)
      .neq("status", "rejected");

    const effectiveContract =
      lockedContract ?? {
        agreement: activeAgreement
          ? {
              id: activeAgreement.id,
              versionNumber: activeAgreement.version_number,
              title: activeAgreement.title,
              status: activeAgreement.status,
              contentHash: activeAgreement.content_hash,
              sections: activeAgreement.sections,
            }
          : null,
        confirmedTerms: terms || [],
        description: transaction.description,
      };

    const visionResult = await verifyDeliveryProofWithVision({
      imageBase64,
      mimeType,
      fileName,
      lockedContract: effectiveContract,
      transactionContext: {
        id: transaction.id,
        title: transaction.title,
        category: transaction.category || undefined,
        totalAmount: Number(transaction.total_amount || 0),
        currency: transaction.currency,
      },
    });

    const verifiedAt = new Date().toISOString();
    const auditPayload: Record<string, unknown> = {
      isApproved: visionResult.isApproved,
      matchConfidence: visionResult.matchConfidence,
      specChecklist: visionResult.specChecklist,
      summary: visionResult.summary,
      provider: visionResult.provider,
      fileName,
      milestoneId,
      agreementVersionId: activeAgreement?.id ?? null,
      verifiedAt,
      ...(previewDataUrl ? { imageUrl: previewDataUrl } : {}),
    };

    const ledgerEvent = await logTransactionEvent(
      transactionId,
      visionResult.isApproved ? "proof_verified" : "proof_rejected",
      user.id,
      auditPayload,
      supabase
    );

    const storedProof: StoredVisualProof = {
      isApproved: visionResult.isApproved,
      matchConfidence: visionResult.matchConfidence,
      specChecklist: visionResult.specChecklist,
      summary: visionResult.summary,
      transactionId,
      milestoneId,
      agreementVersionId: activeAgreement?.id ?? null,
      fileName,
      imageUrl: previewDataUrl,
      verifiedAt,
      provider: visionResult.provider,
      ledgerEventId: ledgerEvent?.id ?? null,
    };

    const recordsQuery = supabase
      .from("payment_records")
      .select("id, raw_response")
      .eq("transaction_id", transactionId);

    if (milestoneId) {
      recordsQuery.eq("milestone_id", milestoneId);
    }

    const { data: existingRecords } = await recordsQuery;
    if (existingRecords && existingRecords.length > 0) {
      await Promise.all(
        existingRecords.map((record) => {
          const prevRaw =
            record.raw_response &&
            typeof record.raw_response === "object" &&
            !Array.isArray(record.raw_response)
              ? (record.raw_response as Record<string, unknown>)
              : {};
          return supabase
            .from("payment_records")
            .update({
              raw_response: {
                ...prevRaw,
                visualProof: storedProof,
              },
            })
            .eq("id", record.id);
        })
      );
    }

    let payoutReceipt = null;
    if (visionResult.isApproved) {
      try {
        payoutReceipt = await executeSellerMilestonePayout({
          supabase,
          actorUserId: user.id,
          transactionId,
          milestoneId,
          triggerSource: "gemini_vision_approval",
        });
      } catch (payoutErr) {
        console.warn("[verify-proof] Automated seller payout failed:", payoutErr);
        payoutReceipt = {
          executed: false,
          skippedReason:
            payoutErr instanceof Error
              ? payoutErr.message
              : "Automated seller payout deferred.",
        };
      }
    }

    return NextResponse.json(
      { proof: storedProof, payout: payoutReceipt },
      { status: 200 }
    );
  } catch (err) {
    console.error("[verify-proof] Error verifying delivery proof:", err);
    return NextResponse.json(
      { error: "Failed to verify visual delivery proof." },
      { status: 500 }
    );
  }
}

