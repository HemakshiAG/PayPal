import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendMessageSchema } from "@/validations/term";
import { extractTermsFromConversation } from "@/services/ai/extraction";
import { persistAndReconcileExtractedTerms } from "@/lib/terms/reconcile";
import { detectAgreementDrift } from "@/services/ai/drift";
import { logTransactionEvent } from "@/lib/ledger/events";
import { broadcastTransactionMessage } from "@/lib/realtime/broadcast";
import { AgreementSection } from "@/types/agreement";
import { ExtractedTermRow } from "@/types/database";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const validated = sendMessageSchema.safeParse(json);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues?.[0]?.message || "Invalid message data" },
        { status: 400 }
      );
    }

    const { transactionId, content } = validated.data;
    const supabase = await createClient();

    // 1. Authenticate user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Verify participant
    const { data: participant } = await supabase
      .from("transaction_participants")
      .select("id, role")
      .eq("transaction_id", transactionId)
      .eq("user_id", user.id)
      .single();

    if (!participant) {
      return NextResponse.json(
        { error: "Forbidden: You are not a participant in this transaction" },
        { status: 403 }
      );
    }

    // 3. Insert message
    const { data: message, error: insertError } = await supabase
      .from("messages")
      .insert({
        transaction_id: transactionId,
        sender_id: user.id,
        content,
      })
      .select(`
        id,
        transaction_id,
        sender_id,
        content,
        created_at,
        profiles (
          full_name,
          avatar_url,
          role
        )
      `)
      .single();

    if (insertError || !message) {
      return NextResponse.json(
        { error: "Failed to send message: " + insertError?.message },
        { status: 500 }
      );
    }

    // Broadcast immediate Realtime message event as a low-latency complement to postgres_changes
    await broadcastTransactionMessage(transactionId, message, supabase);

    // 4. Trigger automated term extraction on message send
    // Query recent messages to extract newly mentioned terms
    const { data: allMessages } = await supabase
      .from("messages")
      .select("*")
      .eq("transaction_id", transactionId)
      .order("created_at", { ascending: true });

    if (allMessages && allMessages.length > 0) {
      try {
        const extractionResult = await extractTermsFromConversation(
          transactionId,
          allMessages
        );

        if (extractionResult.terms.length > 0) {
          await persistAndReconcileExtractedTerms({
            supabase,
            transactionId,
            drafts: extractionResult.terms,
            validDbMessageIds: new Set(allMessages.map((m) => m.id)),
          });
        }
      } catch (extractErr) {
        console.warn("Background extraction warning:", extractErr);
      }
    }

    // 5. Phase 6 Agreement Drift Detection against Active Locked Agreement (if any)
    const createdDriftAlerts: Array<Record<string, unknown>> = [];
    try {
      const { data: activeVersion } = await supabase
        .from("agreement_versions")
        .select("id, version_number, sections")
        .eq("transaction_id", transactionId)
        .eq("status", "active")
        .order("version_number", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeVersion) {
        const { data: confirmedTerms } = await supabase
          .from("extracted_terms")
          .select("*")
          .eq("transaction_id", transactionId)
          .eq("status", "confirmed");

        const driftResult = await detectAgreementDrift({
          transactionId,
          messageContent: content,
          activeVersionNumber: activeVersion.version_number,
          sections: Array.isArray(activeVersion.sections)
            ? (activeVersion.sections as AgreementSection[])
            : [],
          confirmedTerms: (confirmedTerms as ExtractedTermRow[]) || [],
        });

        if (driftResult.hasDrift && driftResult.alerts.length > 0) {
          for (const candidate of driftResult.alerts) {
            const { data: alertRow, error: alertErr } = await supabase
              .from("drift_alerts")
              .insert({
                transaction_id: transactionId,
                active_version_id: activeVersion.id,
                source_message_id: message.id,
                term_key: candidate.termKey,
                original_value: candidate.originalValue,
                proposed_value: candidate.proposedValue,
                confidence_score: candidate.confidenceScore,
                status: "open",
              })
              .select("*")
              .single();

            if (!alertErr && alertRow) {
              createdDriftAlerts.push(alertRow);
              await logTransactionEvent(
                transactionId,
                "drift_detected",
                user.id,
                {
                  driftAlertId: alertRow.id,
                  activeVersionId: activeVersion.id,
                  activeVersionNumber: activeVersion.version_number,
                  termKey: candidate.termKey,
                  proposedValue: candidate.proposedValue,
                  sourceMessageId: message.id,
                },
                supabase
              );
            }
          }
        }
      }
    } catch (driftErr) {
      console.warn("Background drift detection warning:", driftErr);
    }

    return NextResponse.json({
      success: true,
      message,
      driftAlerts: createdDriftAlerts,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

