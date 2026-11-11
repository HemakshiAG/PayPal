import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyIntegritySchema } from "@/validations/vault";
import { verifyLedgerIntegrity } from "@/lib/ledger/events";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = verifyIntegritySchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues?.[0]?.message || "Invalid request payload" },
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

    // 2. Verify transaction participation
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
        { error: "Forbidden: You are not a participant in this transaction" },
        { status: 403 }
      );
    }

    // 3. Execute hash-chain verification audit
    const report = await verifyLedgerIntegrity(transactionId, supabase);

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err) {
    console.error("Error verifying ledger integrity:", err);
    return NextResponse.json(
      { error: "Internal server error verifying ledger integrity" },
      { status: 500 }
    );
  }
}

