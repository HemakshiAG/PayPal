import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { detectDriftSchema, resolveDriftSchema } from "@/validations/vault";
import { detectAgreementDrift } from "@/services/ai/drift";
import { logTransactionEvent } from "@/lib/ledger/events";
import { AgreementSection } from "@/types/agreement";
import { ExtractedTermRow, ScenarioRow, ScenarioResolutionRow } from "@/types/database";
import {
  compileAgreementSections,
  TransactionSummaryForAgreement,
} from "@/services/agreement/builder";
import { computeCanonicalAgreementHash } from "@/lib/agreement/hash";

/**
 * POST /api/ai/detect-drift
 * Analyzes a newly sent message against the active approved agreement version ($V_n$).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = detectDriftSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues?.[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { transactionId, messageId, content } = validated.data;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: participant } = await supabase
      .from("transaction_participants")
      .select("role")
      .eq("transaction_id", transactionId)
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: tx } = await supabase
      .from("transactions")
      .select("creator_id")
      .eq("id", transactionId)
      .single();

    if (!tx || (!participant && tx.creator_id !== user.id)) {
      return NextResponse.json(
        { error: "Forbidden: Not an authorized transaction participant" },
        { status: 403 }
      );
    }

    // Check if an active approved agreement version exists
    const { data: activeVersion } = await supabase
      .from("agreement_versions")
      .select("*")
      .eq("transaction_id", transactionId)
      .eq("status", "active")
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!activeVersion) {
      return NextResponse.json({
        success: true,
        hasDrift: false,
        alerts: [],
        note: "No locked active agreement version to compare against.",
      });
    }

    const { data: confirmedTerms } = await supabase
      .from("extracted_terms")
      .select("*")
      .eq("transaction_id", transactionId)
      .eq("status", "confirmed");

    const result = await detectAgreementDrift({
      transactionId,
      messageContent: content,
      activeVersionNumber: activeVersion.version_number,
      sections: Array.isArray(activeVersion.sections)
        ? (activeVersion.sections as AgreementSection[])
        : [],
      confirmedTerms: (confirmedTerms as ExtractedTermRow[]) || [],
    });

    if (!result.hasDrift || result.alerts.length === 0) {
      return NextResponse.json({
        success: true,
        hasDrift: false,
        alerts: [],
      });
    }

    const insertedAlerts = [];
    for (const candidate of result.alerts) {
      const { data: inserted, error: insertError } = await supabase
        .from("drift_alerts")
        .insert({
          transaction_id: transactionId,
          active_version_id: activeVersion.id,
          source_message_id: messageId || null,
          term_key: candidate.termKey,
          original_value: candidate.originalValue,
          proposed_value: candidate.proposedValue,
          confidence_score: candidate.confidenceScore,
          status: "open",
        })
        .select("*")
        .single();

      if (!insertError && inserted) {
        insertedAlerts.push(inserted);
        await logTransactionEvent(
          transactionId,
          "drift_detected",
          user.id,
          {
            driftAlertId: inserted.id,
            activeVersionId: activeVersion.id,
            activeVersionNumber: activeVersion.version_number,
            termKey: candidate.termKey,
            proposedValue: candidate.proposedValue,
            sourceMessageId: messageId || null,
          },
          supabase
        );
      }
    }

    return NextResponse.json({
      success: true,
      hasDrift: insertedAlerts.length > 0,
      alerts: insertedAlerts,
    });
  } catch (err) {
    console.error("Error in POST /api/ai/detect-drift:", err);
    return NextResponse.json(
      { error: "Internal server error detecting agreement drift" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/ai/detect-drift
 * Resolves a drift alert either by dismissing it or creating an immutable Amendment Version (V_{n+1}).
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = resolveDriftSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues?.[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { driftAlertId, transactionId, action } = validated.data;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: participant } = await supabase
      .from("transaction_participants")
      .select("role")
      .eq("transaction_id", transactionId)
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: tx } = await supabase
      .from("transactions")
      .select("id, title, description, category, total_amount, currency, creator_id")
      .eq("id", transactionId)
      .single();

    if (!tx || (!participant && tx.creator_id !== user.id)) {
      return NextResponse.json(
        { error: "Forbidden: You are not an authorized participant" },
        { status: 403 }
      );
    }

    const { data: alertRow, error: alertError } = await supabase
      .from("drift_alerts")
      .select("*")
      .eq("id", driftAlertId)
      .eq("transaction_id", transactionId)
      .single();

    if (alertError || !alertRow) {
      return NextResponse.json({ error: "Drift alert not found" }, { status: 404 });
    }

    if (action === "dismiss") {
      const { data: dismissed } = await supabase
        .from("drift_alerts")
        .update({ status: "dismissed" })
        .eq("id", driftAlertId)
        .select("*")
        .single();

      await logTransactionEvent(
        transactionId,
        "drift_dismissed",
        user.id,
        {
          driftAlertId,
          termKey: alertRow.term_key,
        },
        supabase
      );

      return NextResponse.json({
        success: true,
        action: "dismissed",
        alert: dismissed,
      });
    }

    // Action === "amend": Record modified confirmed term & compile Amendment Version (V_{n+1}) (Rule 9)
    const lowerKey = (alertRow.term_key || "").toLowerCase();
    const inferredCategory: "timeline" | "financial" | "specification" | "condition" =
      lowerKey.includes("delivery") || lowerKey.includes("schedule") || lowerKey.includes("timeline")
        ? "timeline"
        : lowerKey.includes("price") || lowerKey.includes("budget") || lowerKey.includes("cost")
        ? "financial"
        : lowerKey.includes("spec") || lowerKey.includes("scope")
        ? "specification"
        : "condition";

    await supabase.from("extracted_terms").insert({
      transaction_id: transactionId,
      source_message_ids: alertRow.source_message_id ? [alertRow.source_message_id] : [],
      term_key: `${alertRow.term_key} (Amended)`,
      term_value: alertRow.proposed_value,
      category: inferredCategory,
      classification: "explicitly_agreed",
      confidence_score: Number(alertRow.confidence_score) || 0.9,
      status: "confirmed",
    });

    const { data: confirmedTerms } = await supabase
      .from("extracted_terms")
      .select("*")
      .eq("transaction_id", transactionId)
      .eq("status", "confirmed");

    const { data: rawScenarios } = await supabase
      .from("scenarios")
      .select(`
        *,
        scenario_resolutions (*)
      `)
      .eq("transaction_id", transactionId);

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
      (rawScenarios as Array<ScenarioRow & { scenario_resolutions?: ScenarioResolutionRow[] }>) || []
    );

    const contentHash = computeCanonicalAgreementHash(sections);

    // Fetch latest version number to guarantee V_{n+1}
    const { data: existingVersions } = await supabase
      .from("agreement_versions")
      .select("id, version_number, status")
      .eq("transaction_id", transactionId)
      .order("version_number", { ascending: false });

    const latestVersion =
      existingVersions && existingVersions.length > 0 ? existingVersions[0] : null;
    const nextVersionNumber = (latestVersion?.version_number || 0) + 1;

    if (latestVersion && (latestVersion.status === "active" || latestVersion.status === "draft")) {
      await supabase
        .from("agreement_versions")
        .update({ status: "superseded" })
        .eq("id", latestVersion.id);
    }

    const { data: newVersion, error: versionInsertErr } = await supabase
      .from("agreement_versions")
      .insert({
        transaction_id: transactionId,
        version_number: nextVersionNumber,
        content_hash: contentHash,
        title: `${tx.title} — Commercial Agreement Amendment V${nextVersionNumber}`,
        sections,
        status: "draft",
        created_by: user.id,
      })
      .select("*")
      .single();

    if (versionInsertErr || !newVersion) {
      return NextResponse.json(
        { error: versionInsertErr?.message || "Failed to create amendment version" },
        { status: 500 }
      );
    }

    // Reopen transaction from locked -> active for mutual re-signing of V_{n+1}
    await supabase
      .from("transactions")
      .update({ status: "active" })
      .eq("id", transactionId);

    const { data: amendedAlert } = await supabase
      .from("drift_alerts")
      .update({ status: "amended" })
      .eq("id", driftAlertId)
      .select("*")
      .single();

    await logTransactionEvent(
      transactionId,
      "drift_amended",
      user.id,
      {
        driftAlertId,
        termKey: alertRow.term_key,
        previousVersionNumber: latestVersion?.version_number || null,
        newVersionId: newVersion.id,
        newVersionNumber: nextVersionNumber,
        newContentHash: contentHash,
      },
      supabase
    );

    return NextResponse.json({
      success: true,
      action: "amended",
      newVersionId: newVersion.id,
      newVersionNumber: nextVersionNumber,
      contentHash,
      alert: amendedAlert,
    });
  } catch (err) {
    console.error("Error in PATCH /api/ai/detect-drift:", err);
    return NextResponse.json(
      { error: "Internal server error resolving drift alert" },
      { status: 500 }
    );
  }
}

