import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authorizeAgreementActor } from "@/lib/agreement/auth";
import { compileAgreementSchema } from "@/validations/agreement";
import {
  compileAgreementSections,
  TransactionSummaryForAgreement,
} from "@/services/agreement/builder";
import { computeCanonicalAgreementHash } from "@/lib/agreement/hash";
import { logTransactionEvent } from "@/lib/ledger/events";
import {
  broadcastAgreementUpdate,
  broadcastWorkspaceStatusUpdate,
} from "@/lib/realtime/broadcast";
import {
  ExtractedTermRow,
  ScenarioRow,
  ScenarioResolutionRow,
} from "@/types/database";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = compileAgreementSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          error:
            validated.error.issues?.[0]?.message || "Invalid input payload",
        },
        { status: 400 }
      );
    }

    const { transactionId } = validated.data;
    const supabase = await createClient();

    // 1. Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Authorize participant (including buyer@pact.demo / seller@pact.demo) & backfill seller_id if null
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

    const { dbClient, tx } = authResult;

    // 3. Query confirmed terms and scenarios with resolutions
    const [{ data: confirmedTerms }, { data: rawScenarios }] = await Promise.all([
      dbClient
        .from("extracted_terms")
        .select("*")
        .eq("transaction_id", transactionId)
        .eq("status", "confirmed"),
      dbClient
        .from("scenarios")
        .select(
          `
          *,
          scenario_resolutions (*)
        `
        )
        .eq("transaction_id", transactionId),
    ]);

    // 4. Compile sections and compute canonical hash
    const txSummary: TransactionSummaryForAgreement = {
      id: tx.id,
      title: tx.title,
      description: tx.description,
      category: tx.category,
      totalAmount: Number(tx.total_amount) || 0,
      currency: tx.currency || "INR",
    };

    const sections = compileAgreementSections(
      txSummary,
      (confirmedTerms as ExtractedTermRow[]) || [],
      (rawScenarios as Array<
        ScenarioRow & { scenario_resolutions?: ScenarioResolutionRow[] }
      >) || []
    );

    const contentHash = computeCanonicalAgreementHash(sections);

    // 5. Check existing agreement versions
    const { data: existingVersions } = await dbClient
      .from("agreement_versions")
      .select("*")
      .eq("transaction_id", transactionId)
      .order("version_number", { ascending: false });

    const latestVersion =
      existingVersions && existingVersions.length > 0
        ? existingVersions[0]
        : null;

    let targetVersionId = latestVersion?.id as string | undefined;
    let activeVersionNumber = Number(latestVersion?.version_number) || 1;

    if (!latestVersion) {
      activeVersionNumber = 1;
      const { data: newVersion, error: insertError } = await dbClient
        .from("agreement_versions")
        .insert({
          transaction_id: transactionId,
          version_number: 1,
          content_hash: contentHash,
          title: `${tx.title} — Commercial Agreement V1`,
          sections,
          status: "draft",
          created_by: user.id,
        })
        .select()
        .single();

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
      }
      targetVersionId = newVersion.id;

      await logTransactionEvent(
        transactionId,
        "agreement_compiled",
        user.id,
        {
          agreementVersionId: newVersion.id,
          versionNumber: 1,
          contentHash,
        },
        dbClient
      );
    } else if (latestVersion.content_hash !== contentHash) {
      // Non-Negotiable Rule 9: Create Version N + 1 when canonical content hash changes
      if (
        latestVersion.status === "active" ||
        latestVersion.status === "draft"
      ) {
        await dbClient
          .from("agreement_versions")
          .update({ status: "superseded" })
          .eq("id", latestVersion.id);
      }

      const nextVersionNumber = Number(latestVersion.version_number) + 1;
      activeVersionNumber = nextVersionNumber;
      const { data: newVersion, error: insertError } = await dbClient
        .from("agreement_versions")
        .insert({
          transaction_id: transactionId,
          version_number: nextVersionNumber,
          content_hash: contentHash,
          title: `${tx.title} — Commercial Agreement V${nextVersionNumber}`,
          sections,
          status: "draft",
          created_by: user.id,
        })
        .select()
        .single();

      if (insertError) {
        return NextResponse.json(
          { error: insertError.message },
          { status: 500 }
        );
      }
      targetVersionId = newVersion.id;

      await logTransactionEvent(
        transactionId,
        "agreement_compiled",
        user.id,
        {
          agreementVersionId: newVersion.id,
          versionNumber: nextVersionNumber,
          previousVersionNumber: latestVersion.version_number,
          contentHash,
        },
        dbClient
      );
    }

    // 6. Query all versions with approvals for this transaction
    const { data: allVersions } = await dbClient
      .from("agreement_versions")
      .select(
        `
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
      `
      )
      .eq("transaction_id", transactionId)
      .order("version_number", { ascending: false });

    const agreementVersionTag = `v${activeVersionNumber}.0`;

    // Broadcast simultaneously so both Buyer and Seller workspaces flip from empty to compiled view
    await Promise.allSettled([
      broadcastAgreementUpdate(
        transactionId,
        {
          currentVersionId: targetVersionId || "",
          agreement_version: agreementVersionTag,
          sha256_hash: contentHash,
          versions: (allVersions as Array<Record<string, unknown>>) || [],
        },
        dbClient
      ),
      broadcastWorkspaceStatusUpdate(
        {
          transactionId,
          eventType: "agreement_compiled",
          status: "draft",
          summary: `Agreement ${agreementVersionTag} compiled with SHA-256 fingerprint ${contentHash.slice(
            0,
            12
          )}...`,
          metadata: {
            agreementVersionId: targetVersionId,
            agreement_version: agreementVersionTag,
            sha256_hash: contentHash,
          },
        },
        dbClient
      ),
    ]);

    return NextResponse.json({
      success: true,
      agreement_version: agreementVersionTag,
      sha256_hash: contentHash,
      versionNumber: activeVersionNumber,
      currentVersionId: targetVersionId,
      contentHash,
      versions: allVersions || [],
    });
  } catch (err) {
    console.error("Unexpected error in /api/agreements/compile:", err);
    return NextResponse.json(
      { error: "Internal server error compiling agreement" },
      { status: 500 }
    );
  }
}
