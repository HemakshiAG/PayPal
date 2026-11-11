import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeAgreementActor } from "@/lib/agreement/auth";
import { approveAgreementSchema } from "@/validations/agreement";
import { syncMilestonesForActiveAgreement } from "@/services/payment/milestones";
import { logTransactionEvent } from "@/lib/ledger/events";
import { broadcastAgreementUpdate } from "@/lib/realtime/broadcast";
import { AgreementSection } from "@/types/agreement";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = approveAgreementSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues?.[0]?.message || "Invalid approval payload" },
        { status: 400 }
      );
    }

    const { agreementVersionId, contentHash, passkeyVerification } = validated.data;
    const supabase = await createClient();

    // 1. Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch agreement version
    const { data: versionRecord, error: versionError } = await supabase
      .from("agreement_versions")
      .select("*")
      .eq("id", agreementVersionId)
      .single();

    if (versionError || !versionRecord) {
      return NextResponse.json(
        { error: "Agreement version not found" },
        { status: 404 }
      );
    }

    // 3. Cryptographic hash verification (Rule 9 & 10)
    if (versionRecord.content_hash !== contentHash) {
      return NextResponse.json(
        {
          error:
            "Integrity check failed: Submitted content hash does not match canonical database hash for this version.",
        },
        { status: 400 }
      );
    }

    if (versionRecord.status === "superseded" || versionRecord.status === "cancelled") {
      return NextResponse.json(
        {
          error:
            `Cannot approve a ${versionRecord.status} agreement version. Please view and approve the latest active or draft version.`,
        },
        { status: 400 }
      );
    }

    const transactionId = versionRecord.transaction_id;

    // 4. Verify participant role & auto-attach demo participant / seller_id if applicable
    const authResult = await authorizeAgreementActor(
      supabase,
      user,
      transactionId
    );
    if (!authResult.ok) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { dbClient, role: userRole, tx } = authResult;

    const { data: signerProfile } = await dbClient
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    const signerName =
      passkeyVerification?.signerName ||
      signerProfile?.full_name ||
      user.email?.split("@")[0] ||
      (userRole === "buyer" ? "Buyer" : "Seller");

    // 5. Insert approval (or ignore if already approved)
    const { data: existingApproval } = await dbClient
      .from("agreement_approvals")
      .select("*")
      .eq("agreement_version_id", agreementVersionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!existingApproval) {
      const { error: approvalError } = await dbClient
        .from("agreement_approvals")
        .insert({
          agreement_version_id: agreementVersionId,
          transaction_id: transactionId,
          user_id: user.id,
          role: userRole,
          content_hash: contentHash,
        });

      if (approvalError) {
        return NextResponse.json({ error: approvalError.message }, { status: 500 });
      }

      await logTransactionEvent(
        transactionId,
        "agreement_approved",
        user.id,
        {
          agreementVersionId,
          versionNumber: versionRecord.version_number,
          role: userRole,
          signerName,
          signerEmail: passkeyVerification?.signerEmail || user.email || null,
          contentHash,
          agreementHash: contentHash,
          biometricSigned: Boolean(passkeyVerification?.verified),
          passkeyVerified: Boolean(passkeyVerification?.verified),
          passkeyMode: passkeyVerification?.mode || "standard_session",
          credentialId: passkeyVerification?.credentialId || null,
          publicKeyHash: passkeyVerification?.publicKeyHash || null,
          signatureDigest: passkeyVerification?.signatureDigest || null,
          signaturePayload: passkeyVerification?.signaturePayload
            ? passkeyVerification.signaturePayload.slice(0, 64)
            : null,
        },
        dbClient
      );
    }

    // 6. Dual Approval Check (Non-Negotiable Rule 10)
    const { data: allApprovals } = await dbClient
      .from("agreement_approvals")
      .select("role")
      .eq("agreement_version_id", agreementVersionId);

    const hasBuyerApproved = allApprovals?.some((a) => a.role === "buyer");
    const hasSellerApproved = allApprovals?.some((a) => a.role === "seller");
    const isMutuallyApproved = Boolean(hasBuyerApproved && hasSellerApproved);

    if (isMutuallyApproved) {
      // Mark this version as ACTIVE
      await dbClient
        .from("agreement_versions")
        .update({ status: "active" })
        .eq("id", agreementVersionId);

      // Supersede other versions
      await dbClient
        .from("agreement_versions")
        .update({ status: "superseded" })
        .eq("transaction_id", transactionId)
        .neq("id", agreementVersionId);

      // Lock transaction status
      await dbClient
        .from("transactions")
        .update({ status: "locked" })
        .eq("id", transactionId);

      await logTransactionEvent(
        transactionId,
        "agreement_locked",
        user.id,
        {
          agreementVersionId,
          versionNumber: versionRecord.version_number,
          contentHash,
          agreementHash: contentHash,
          lockedByMutualApproval: true,
          biometricSigned: Boolean(passkeyVerification?.verified),
          signerName,
          publicKeyHash: passkeyVerification?.publicKeyHash || null,
          signatureDigest: passkeyVerification?.signatureDigest || null,
        },
        dbClient
      );

      // Phase 5 Sync: Automatically initialize payment milestone schedule from active agreement
      await syncMilestonesForActiveAgreement(
        dbClient,
        transactionId,
        agreementVersionId,
        Number(tx.total_amount) || 0,
        tx.currency || "INR",
        (Array.isArray(versionRecord.sections) ? versionRecord.sections : []) as AgreementSection[]
      );
    }

    // 7. Query updated version and all versions with approvals for Realtime sync
    const { data: allVersions } = await dbClient
      .from("agreement_versions")
      .select(`
        *,
        agreement_approvals (
          id,
          agreement_version_id,
          transaction_id,
          user_id,
          role,
          content_hash,
          approved_at,
          profiles (
            full_name,
            avatar_url
          )
        )
      `)
      .eq("transaction_id", transactionId)
      .order("version_number", { ascending: false });

    const updatedVersion =
      allVersions?.find((v) => v.id === agreementVersionId) || null;

    await broadcastAgreementUpdate(
      transactionId,
      {
        currentVersionId: agreementVersionId,
        agreement_version: `v${Number(versionRecord.version_number) || 1}.0`,
        sha256_hash: contentHash,
        versions: (allVersions as Array<Record<string, unknown>>) || [],
      },
      dbClient
    );

    return NextResponse.json({
      success: true,
      version: updatedVersion,
      isMutuallyApproved,
      message: isMutuallyApproved
        ? "Agreement mutually approved and locked! Transaction is now active."
        : `Approval recorded for ${userRole}. Awaiting counterparty approval.`,
    });
  } catch (err) {
    console.error("Unexpected error in /api/agreements/approve:", err);
    return NextResponse.json(
      { error: "Internal server error approving agreement" },
      { status: 500 }
    );
  }
}

