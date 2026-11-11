import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveDemoAccountByEmail } from "@/lib/auth/demo-accounts";
import { hasUsableServiceRoleKey } from "@/lib/auth/demo-provision";
import {
  hasAgreementSignatures as hasVersionSignatures,
  isAgreementLockedOrActiveStatus,
} from "@/lib/agreement/status";
import { createOrderSchema } from "@/validations/payment";
import { createPayPalSandboxOrder } from "@/lib/paypal/client";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();
    const normalizedBody = {
      milestoneId: rawBody.milestoneId ?? rawBody.milestone_id,
      transactionId: rawBody.transactionId ?? rawBody.transaction_id,
    };

    const validated = createOrderSchema.safeParse(normalizedBody);
    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues?.[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { milestoneId, transactionId } = validated.data;
    const sessionClient = await createClient();

    // 1. Authenticate user
    const {
      data: { user },
      error: authError,
    } = await sessionClient.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const demoAccount = resolveDemoAccountByEmail(user.email);
    const supabase =
      demoAccount && hasUsableServiceRoleKey()
        ? createAdminClient()
        : sessionClient;

    // 2. Verify participant role (Buyer authorization)
    const { data: participant } = await supabase
      .from("transaction_participants")
      .select("role")
      .eq("transaction_id", transactionId)
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: tx } = await supabase
      .from("transactions")
      .select("creator_id, title, status")
      .eq("id", transactionId)
      .single();

    if (!tx || (!participant && tx.creator_id !== user.id && !demoAccount)) {
      return NextResponse.json(
        { error: "Forbidden: You are not a participant in this transaction" },
        { status: 403 }
      );
    }

    const userRole =
      participant?.role ||
      demoAccount?.role ||
      (tx.creator_id === user.id ? "buyer" : "seller");
    if (userRole !== "buyer") {
      return NextResponse.json(
        { error: "Forbidden: Only the Buyer can initiate PayPal milestone payments" },
        { status: 403 }
      );
    }

    // 3. Fetch milestone & validate active/locked or signed agreement status
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
        { error: "This milestone has already been paid" },
        { status: 400 }
      );
    }

    const { data: allAgreementVersions } = await supabase
      .from("agreement_versions")
      .select("id, status, version_number, agreement_approvals(id, role)")
      .eq("transaction_id", transactionId)
      .order("version_number", { ascending: false });

    const milestoneAgreement = (allAgreementVersions || []).find(
      (v) => v.id === milestone.agreement_version_id
    );

    const isTxLockedOrActive = isAgreementLockedOrActiveStatus(tx.status);
    const isMilestoneAgreementLockedOrActive = isAgreementLockedOrActiveStatus(
      milestoneAgreement?.status
    );
    const hasLockedOrActiveAgreement = (allAgreementVersions || []).some((v) =>
      isAgreementLockedOrActiveStatus(v.status)
    );
    const hasAgreementSignatures = (allAgreementVersions || []).some((v) =>
      hasVersionSignatures(v)
    );

    if (
      !isTxLockedOrActive &&
      !isMilestoneAgreementLockedOrActive &&
      !hasLockedOrActiveAgreement &&
      !hasAgreementSignatures
    ) {
      return NextResponse.json(
        {
          error:
            "Agreement version is not active. Both buyer and seller must mutually approve the agreement before milestone payments can proceed.",
        },
        { status: 400 }
      );
    }

    // 4. Create PayPal Sandbox Order
    const orderResult = await createPayPalSandboxOrder({
      amount: Number(milestone.amount),
      currency: milestone.currency || "INR",
      milestoneId: milestone.id,
      transactionId,
      description: `PACT ${tx.title} - ${milestone.title}`,
    });

    // 5. Log initial tracking row in payment_records
    const { error: recordError } = await supabase
      .from("payment_records")
      .insert({
        milestone_id: milestone.id,
        transaction_id: transactionId,
        payer_id: user.id,
        paypal_order_id: orderResult.orderId,
        amount: Number(milestone.amount),
        currency: milestone.currency || "INR",
        status: orderResult.status,
        raw_response: orderResult.rawResponse,
      });

    if (recordError) {
      console.error("Failed to insert payment_records row:", recordError);
      return NextResponse.json(
        { error: "Failed to record order tracking entry" },
        { status: 500 }
      );
    }

    // 6. Update milestone status to processing
    await supabase
      .from("payment_milestones")
      .update({ status: "processing" })
      .eq("id", milestone.id);

    return NextResponse.json({
      success: true,
      orderId: orderResult.orderId,
      status: orderResult.status,
      approvalUrl: orderResult.approvalUrl,
      isSimulated: orderResult.isSimulated,
      amount: Number(milestone.amount),
      currency: milestone.currency || "INR",
    });
  } catch (err) {
    console.error("Error in /api/payments/create-order:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Internal server error creating PayPal order",
      },
      { status: 500 }
    );
  }
}

