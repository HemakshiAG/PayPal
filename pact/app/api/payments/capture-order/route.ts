import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { captureOrderSchema } from "@/validations/payment";
import { capturePayPalSandboxOrder } from "@/lib/paypal/client";
import { logTransactionEvent } from "@/lib/ledger/events";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const normalizedBody = {
      orderId: rawBody.orderId ?? rawBody.order_id,
      milestoneId: rawBody.milestoneId ?? rawBody.milestone_id,
      transactionId: rawBody.transactionId ?? rawBody.transaction_id,
    };

    const validated = captureOrderSchema.safeParse(normalizedBody);
    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues?.[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { orderId, milestoneId, transactionId } = validated.data;
    const supabase = await createClient();

    // 1. Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Verify participant permission
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

    // 3. Fetch milestone & payment record
    const { data: milestone, error: mError } = await supabase
      .from("payment_milestones")
      .select("*")
      .eq("id", milestoneId)
      .eq("transaction_id", transactionId)
      .single();

    if (mError || !milestone) {
      return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
    }

    if (milestone.status === "paid") {
      return NextResponse.json(
        { error: "Milestone is already marked as paid" },
        { status: 400 }
      );
    }

    // 4. Execute Server-Side PayPal Capture (Non-Negotiable Rule 11)
    const captureResult = await capturePayPalSandboxOrder(
      orderId,
      Number(milestone.amount),
      milestone.currency || "INR"
    );

    if (captureResult.status !== "COMPLETED") {
      await supabase
        .from("payment_records")
        .update({
          status: captureResult.status,
          raw_response: captureResult.rawResponse,
        })
        .eq("paypal_order_id", orderId);

      await supabase
        .from("payment_milestones")
        .update({ status: "pending" })
        .eq("id", milestoneId);

      return NextResponse.json(
        {
          error: `PayPal capture did not complete (status: ${captureResult.status})`,
          status: captureResult.status,
        },
        { status: 400 }
      );
    }

    // 5. Update payment_records with capture_id & raw PayPal response
    const { data: updatedRecord } = await supabase
      .from("payment_records")
      .update({
        paypal_capture_id: captureResult.captureId,
        status: "COMPLETED",
        raw_response: captureResult.rawResponse,
      })
      .eq("paypal_order_id", orderId)
      .select()
      .single();

    // 6. Update payment_milestones.status to 'paid'
    const { data: updatedMilestone } = await supabase
      .from("payment_milestones")
      .update({ status: "paid" })
      .eq("id", milestoneId)
      .select()
      .single();

    // 7. Recalculate overall transaction payment progress
    const { data: allMilestones } = await supabase
      .from("payment_milestones")
      .select("id, amount, status")
      .eq("transaction_id", transactionId);

    const paidTotal = (allMilestones || [])
      .filter((m) => m.status === "paid")
      .reduce((sum, m) => sum + Number(m.amount), 0);

    const allPaid =
      allMilestones &&
      allMilestones.length > 0 &&
      allMilestones.every((m) => m.status === "paid");

    if (allPaid) {
      await supabase
        .from("transactions")
        .update({ status: "completed" })
        .eq("id", transactionId);
    }

    // Append PayPal server-verified payment capture event to tamper-evident ledger
    await logTransactionEvent(
      transactionId,
      "payment_captured",
      user.id,
      {
        milestoneId,
        milestoneTitle: milestone.title,
        orderId: captureResult.orderId,
        captureId: captureResult.captureId,
        amount: captureResult.amount,
        currency: captureResult.currency,
        isSimulated: captureResult.isSimulated,
        allMilestonesPaid: Boolean(allPaid),
      },
      supabase
    );

    return NextResponse.json({
      success: true,
      captureId: captureResult.captureId,
      orderId: captureResult.orderId,
      status: "COMPLETED",
      isSimulated: captureResult.isSimulated,
      paidToDate: paidTotal,
      allMilestonesPaid: Boolean(allPaid),
      milestone: updatedMilestone,
      paymentRecord: updatedRecord,
    });
  } catch (err) {
    console.error("Error in /api/payments/capture-order:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Internal server error capturing PayPal order",
      },
      { status: 500 }
    );
  }
}

