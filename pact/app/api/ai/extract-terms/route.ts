import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extractTermsSchema } from "@/validations/term";
import {
  DYNAMIC_EXTRACTION_SYSTEM_PROMPT,
  GEMINI_EXTRACTION_RESPONSE_SCHEMA,
  extractTermsFromConversation,
} from "@/services/ai/extraction";
import { normalizeExtractedTermDraft } from "@/lib/terms/normalize";
import { persistAndReconcileExtractedTerms } from "@/lib/terms/reconcile";
import { broadcastExtractedTermsUpdate } from "@/lib/realtime/broadcast";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const validated = extractTermsSchema.safeParse(json);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues?.[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { transactionId, messages: clientMessages } = validated.data;
    const supabase = await createClient();

    // 1. Authenticate user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Verify transaction participant permission
    const { data: participant } = await supabase
      .from("transaction_participants")
      .select("id, role")
      .eq("transaction_id", transactionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!participant) {
      const { data: tx } = await supabase
        .from("transactions")
        .select("creator_id")
        .eq("id", transactionId)
        .maybeSingle();

      if (!tx || tx.creator_id !== user.id) {
        return NextResponse.json(
          { error: "Forbidden: You are not a participant in this transaction" },
          { status: 403 }
        );
      }
    }

    // 3. Retrieve chronological conversation history and merge any unsaved client messages
    const { data: dbMessages, error: msgError } = await supabase
      .from("messages")
      .select("*")
      .eq("transaction_id", transactionId)
      .order("created_at", { ascending: true });

    if (msgError) {
      return NextResponse.json(
        { error: "Failed to fetch messages: " + msgError.message },
        { status: 500 }
      );
    }

    const dbRows = (dbMessages || []) as Array<{
      id: string;
      content: string;
      sender_id?: string;
      [key: string]: unknown;
    }>;
    const seenIds = new Set(dbRows.map((m) => m.id));
    const seenContents = new Set(
      dbRows.map((m) => (m.content || "").trim().toLowerCase())
    );

    const extraClientRows = (clientMessages || [])
      .map((m, idx) => ({
        id: m.id || `client-msg-${idx}`,
        content: (m.content || m.message_text || "").trim(),
        sender_id: m.sender_id,
      }))
      .filter(
        (m) =>
          m.content.length > 0 &&
          !seenIds.has(m.id) &&
          !seenContents.has(m.content.toLowerCase())
      );

    const mergedMessages = [...dbRows, ...extraClientRows];

    if (mergedMessages.length === 0) {
      return NextResponse.json({
        success: true,
        terms: [],
        newTermsExtractedCount: 0,
        revisedTermsCount: 0,
        message: "No conversation messages found to extract terms from.",
      });
    }

    // 4. Execute Dynamic Zero-Shot Gemini AI extraction
    // Uses DYNAMIC_EXTRACTION_SYSTEM_PROMPT and GEMINI_EXTRACTION_RESPONSE_SCHEMA
    const extractionResult = await extractTermsFromConversation(
      transactionId,
      mergedMessages
    );

    const validDbMessageIds = new Set(dbRows.map((m) => m.id));
    const normalizedDrafts = extractionResult.terms.map((raw, index) =>
      normalizeExtractedTermDraft(raw, index, dbRows)
    );

    // 5. Dynamic Entity Resolution & Deduplication:
    // Reconcile extracted terms against existing transaction terms in memory & DB,
    // updating changed entities to `REVISED` instead of inserting duplicate cards.
    const reconciled = await persistAndReconcileExtractedTerms({
      supabase,
      transactionId,
      drafts: normalizedDrafts,
      validDbMessageIds,
    });

    const responseTerms = reconciled.terms.map((term) => ({
      ...term,
      status: term.apiStatus === "REVISED" ? "REVISED" : term.status,
    }));

    // Broadcast reconciled terms over `chat-room:${transactionId}` so both windows update immediately
    await broadcastExtractedTermsUpdate(
      transactionId,
      responseTerms as Array<Record<string, unknown>>,
      supabase
    );

    return NextResponse.json({
      success: true,
      terms: responseTerms,
      newTermsExtractedCount: reconciled.newTermsCount,
      revisedTermsCount: reconciled.revisedTermsCount,
      provider: extractionResult.provider,
      modelUsed: extractionResult.modelUsed,
      schemaEnforced: Boolean(GEMINI_EXTRACTION_RESPONSE_SCHEMA),
      systemPromptVersion:
        DYNAMIC_EXTRACTION_SYSTEM_PROMPT.length > 0 ? "zero-shot-v2" : "v1",
      summaryNote: extractionResult.summaryNote,
    });
  } catch (err: unknown) {
    const errorMsg =
      err instanceof Error ? err.message : "Internal extraction error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
