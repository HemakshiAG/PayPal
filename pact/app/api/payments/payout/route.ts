import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sellerPayoutSchema } from "@/validations/payment";
import { executeSellerMilestonePayout } from "@/lib/paypal/payouts";

export async function POST(req: NextRequest) {
  try {
    const rawBody = (await req.json()) as Record<string, unknown>;
    const normalized = {
      transactionId: rawBody.transactionId ?? rawBody.transaction_id,
      milestoneId: rawBody.milestoneId ?? rawBody.milestone_id,
      captureId: rawBody.captureId ?? rawBody.capture_id,
      recipientEmail: rawBody.recipientEmail ?? rawBody.recipient_email,
    };

    const validated = sellerPayoutSchema.safeParse(normalized);
    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues?.[0]?.message || "Invalid payout request" },
        { status: 400 }
      );
    }

    const { transactionId, milestoneId, captureId, recipientEmail } = validated.data;
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [{ data: participant }, { data: tx }] = await Promise.all([
      supabase
        .from("transaction_participants")
        .select("role")
        .eq("transaction_id", transactionId)
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("transactions")
        .select("creator_id")
        .eq("id", transactionId)
        .maybeSingle(),
    ]);

    if (!tx || (!participant && tx.creator_id !== user.id)) {
      return NextResponse.json(
        { error: "Forbidden: Not an authorized transaction participant" },
        { status: 403 }
      );
    }

    const payout = await executeSellerMilestonePayout({
      supabase,
      actorUserId: user.id,
      transactionId,
      milestoneId: milestoneId ?? null,
      captureId: captureId ?? null,
      recipientEmail,
      triggerSource: "manual_payout_api",
    });

    if (!payout.executed) {
      return NextResponse.json(
        {
          error:
            payout.skippedReason ||
            "No eligible captured PayPal milestone balance available for seller payout.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      payout,
    });
  } catch (err) {
    console.error("[payments/payout] Error issuing seller payout:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Internal server error processing PayPal seller payout",
      },
      { status: 500 }
    );
  }
}

