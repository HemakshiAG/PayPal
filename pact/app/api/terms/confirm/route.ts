import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { confirmTermSchema } from "@/validations/term";
import { logTransactionEvent } from "@/lib/ledger/events";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const validated = confirmTermSchema.safeParse(json);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues?.[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { termId, status } = validated.data;
    const supabase = await createClient();

    // 1. Authenticate user
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch the term to get transaction_id
    const { data: term, error: fetchError } = await supabase
      .from("extracted_terms")
      .select("id, transaction_id")
      .eq("id", termId)
      .single();

    if (fetchError || !term) {
      return NextResponse.json({ error: "Term not found" }, { status: 404 });
    }

    // 3. Verify participant permission
    const { data: participant } = await supabase
      .from("transaction_participants")
      .select("id, role")
      .eq("transaction_id", term.transaction_id)
      .eq("user_id", user.id)
      .single();

    if (!participant) {
      return NextResponse.json(
        { error: "Forbidden: You are not a participant in this transaction" },
        { status: 403 }
      );
    }

    // 4. Update term status
    const { data: updatedTerm, error: updateError } = await supabase
      .from("extracted_terms")
      .update({ status })
      .eq("id", termId)
      .select("*")
      .single();

    if (updateError || !updatedTerm) {
      return NextResponse.json(
        { error: "Failed to update term status: " + updateError?.message },
        { status: 500 }
      );
    }

    // Append cryptographic audit event to tamper-evident ledger
    await logTransactionEvent(
      term.transaction_id,
      status === "confirmed" ? "term_confirmed" : "term_rejected",
      user.id,
      {
        termId: updatedTerm.id,
        termKey: updatedTerm.term_key,
        termValue: updatedTerm.term_value,
        category: updatedTerm.category,
        classification: updatedTerm.classification,
        sourceMessageIds: updatedTerm.source_message_ids,
        status,
      },
      supabase
    );

    return NextResponse.json({
      success: true,
      term: updatedTerm,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}

