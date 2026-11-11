import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateScenariosSchema } from "@/validations/scenario";
import { generatePredictiveScenarios } from "@/services/ai/scenarios";
import { calculateScenarioCoverage } from "@/lib/scenarios/coverage";
import { ExtractedTermRow, MessageRow } from "@/types/database";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = generateScenariosSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues?.[0]?.message || "Invalid input payload" },
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

    // 2. Verify participant authorization
    const { data: participant } = await supabase
      .from("transaction_participants")
      .select("id, role")
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
        { error: "Forbidden: You are not an authorized participant in this transaction" },
        { status: 403 }
      );
    }

    // 3. Query existing extracted terms and messages
    const { data: terms } = await supabase
      .from("extracted_terms")
      .select("*")
      .eq("transaction_id", transactionId);

    const { data: messages } = await supabase
      .from("messages")
      .select("*")
      .eq("transaction_id", transactionId)
      .order("created_at", { ascending: true });

    // 4. Query existing scenarios to avoid duplicating identical open titles
    const { data: existingScenarios } = await supabase
      .from("scenarios")
      .select("id, title, status")
      .eq("transaction_id", transactionId);

    const existingTitles = new Set(
      (existingScenarios || []).map((s) => s.title.toLowerCase())
    );

    // 5. Generate scenarios
    const generated = await generatePredictiveScenarios(
      {
        id: tx.id,
        title: tx.title,
        description: tx.description,
        category: tx.category,
        totalAmount: Number(tx.total_amount) || 0,
        currency: tx.currency,
      },
      (terms as ExtractedTermRow[]) || [],
      (messages as MessageRow[]) || []
    );

    // 6. Filter out duplicates and insert new rows
    const toInsert = generated
      .filter((s) => !existingTitles.has(s.title.toLowerCase()))
      .map((s) => ({
        transaction_id: transactionId,
        category: s.category,
        title: s.title,
        description: s.description,
        severity: s.severity,
        consequence_chain: s.consequenceChain,
        recommended_resolutions: s.recommendedResolutions,
        status: "open",
      }));

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase
        .from("scenarios")
        .insert(toInsert);

      if (insertError) {
        console.error("Failed to insert generated scenarios:", insertError);
        return NextResponse.json(
          { error: "Failed to persist generated scenarios: " + insertError.message },
          { status: 500 }
        );
      }
    }

    // 7. Query all updated scenarios with resolutions
    const { data: allScenarios } = await supabase
      .from("scenarios")
      .select(`
        *,
        scenario_resolutions (*)
      `)
      .eq("transaction_id", transactionId)
      .order("created_at", { ascending: true });

    const coverage = await calculateScenarioCoverage(transactionId, supabase);

    return NextResponse.json({
      success: true,
      scenarios: allScenarios || [],
      coverage,
      insertedCount: toInsert.length,
    });
  } catch (err) {
    console.error("Unexpected error in /api/ai/generate-scenarios:", err);
    return NextResponse.json(
      { error: "Internal server error generating scenarios" },
      { status: 500 }
    );
  }
}

