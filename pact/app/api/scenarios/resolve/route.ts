import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateScenarioCoverage } from "@/lib/scenarios/coverage";
import { logTransactionEvent } from "@/lib/ledger/events";
import { z } from "zod";

const resolveContingencySchema = z.object({
  scenarioId: z.string().uuid("Invalid scenario ID"),
  transactionId: z.string().uuid("Invalid transaction ID"),
  agreedAction: z.string().min(3, "Agreed action must be at least 3 characters").max(1000),
  priceImpactType: z.enum(["none", "additional_cost", "discount", "refund"]).default("none"),
  priceImpactValue: z.number().min(0).default(0),
  timelineImpactDays: z.number().int().default(0),
  actionType: z.enum(["propose", "approve", "reject"]).default("propose"),
  resolutionId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = resolveContingencySchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues?.[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const {
      scenarioId,
      transactionId,
      agreedAction,
      priceImpactType,
      priceImpactValue,
      timelineImpactDays,
      actionType,
      resolutionId,
    } = validated.data;

    const supabase = await createClient();

    // 1. Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Identify user role in this transaction
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

    const userRole: "buyer" | "seller" = participant?.role || (tx.creator_id === user.id ? "buyer" : "seller");

    // 3. Handle Action Types
    if (actionType === "approve" && resolutionId) {
      // Fetch existing resolution
      const { data: resRecord, error: resError } = await supabase
        .from("scenario_resolutions")
        .select("*")
        .eq("id", resolutionId)
        .single();

      if (resError || !resRecord) {
        return NextResponse.json({ error: "Resolution record not found" }, { status: 404 });
      }

      const isBuyer = userRole === "buyer";
      const newBuyerApproved = isBuyer ? true : resRecord.buyer_approved;
      const newSellerApproved = !isBuyer ? true : resRecord.seller_approved;
      const bothApproved = newBuyerApproved && newSellerApproved;

      const { data: updatedResolution, error: updateError } = await supabase
        .from("scenario_resolutions")
        .update({
          buyer_approved: newBuyerApproved,
          seller_approved: newSellerApproved,
          buyer_approved_at: isBuyer ? new Date().toISOString() : resRecord.buyer_approved_at,
          seller_approved_at: !isBuyer ? new Date().toISOString() : resRecord.seller_approved_at,
          status: bothApproved ? "accepted" : "draft",
        })
        .eq("id", resolutionId)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      // If both approved, mark scenario as resolved
      if (bothApproved) {
        await supabase
          .from("scenarios")
          .update({ status: "resolved" })
          .eq("id", scenarioId);

        await logTransactionEvent(
          transactionId,
          "scenario_resolved",
          user.id,
          {
            scenarioId,
            resolutionId,
            agreedAction: updatedResolution.agreed_action,
            priceImpactType: updatedResolution.price_impact_type,
            priceImpactValue: updatedResolution.price_impact_value,
            timelineImpactDays: updatedResolution.timeline_impact_days,
          },
          supabase
        );
      }

      const coverage = await calculateScenarioCoverage(transactionId, supabase);

      return NextResponse.json({
        success: true,
        resolution: updatedResolution,
        scenarioStatus: bothApproved ? "resolved" : "resolving",
        coverage,
      });
    }

    // Default: Propose new resolution (preset or custom)
    const isBuyer = userRole === "buyer";
    const buyerApproved = isBuyer;
    const sellerApproved = !isBuyer;

    const { data: newResolution, error: createError } = await supabase
      .from("scenario_resolutions")
      .insert({
        scenario_id: scenarioId,
        transaction_id: transactionId,
        proposed_by: user.id,
        agreed_action: agreedAction,
        price_impact_type: priceImpactType,
        price_impact_value: priceImpactValue,
        timeline_impact_days: timelineImpactDays,
        buyer_approved: buyerApproved,
        seller_approved: sellerApproved,
        buyer_approved_at: buyerApproved ? new Date().toISOString() : null,
        seller_approved_at: sellerApproved ? new Date().toISOString() : null,
        status: "draft",
      })
      .select()
      .single();

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    // Update scenario status to 'resolving'
    await supabase
      .from("scenarios")
      .update({ status: "resolving" })
      .eq("id", scenarioId);

    const coverage = await calculateScenarioCoverage(transactionId, supabase);

    return NextResponse.json({
      success: true,
      resolution: newResolution,
      scenarioStatus: "resolving",
      coverage,
    });
  } catch (err) {
    console.error("Unexpected error in /api/scenarios/resolve:", err);
    return NextResponse.json(
      { error: "Internal server error resolving scenario" },
      { status: 500 }
    );
  }
}

