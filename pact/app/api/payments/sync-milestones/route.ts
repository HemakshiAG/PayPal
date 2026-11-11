import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveDemoAccountByEmail } from "@/lib/auth/demo-accounts";
import { hasUsableServiceRoleKey } from "@/lib/auth/demo-provision";
import {
  hasAgreementSignatures,
  isAgreementLockedOrActiveStatus,
} from "@/lib/agreement/status";
import { syncMilestonesSchema } from "@/validations/payment";
import { syncMilestonesForActiveAgreement } from "@/services/payment/milestones";
import { AgreementSection } from "@/types/agreement";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = syncMilestonesSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues?.[0]?.message || "Invalid payload" },
        { status: 400 }
      );
    }

    const { transactionId } = validated.data;
    const sessionClient = await createClient();

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

    const { data: participant } = await supabase
      .from("transaction_participants")
      .select("role")
      .eq("transaction_id", transactionId)
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: tx } = await supabase
      .from("transactions")
      .select("creator_id, total_amount, currency, status")
      .eq("id", transactionId)
      .single();

    if (!tx || (!participant && tx.creator_id !== user.id && !demoAccount)) {
      return NextResponse.json(
        { error: "Forbidden: Not a transaction participant" },
        { status: 403 }
      );
    }

    // Check active, locked, or signed agreement version
    const { data: versions } = await supabase
      .from("agreement_versions")
      .select("*, agreement_approvals(id, role)")
      .eq("transaction_id", transactionId)
      .order("version_number", { ascending: false });

    const allVersions = versions || [];
    const activeVersion =
      allVersions.find((v) => isAgreementLockedOrActiveStatus(v.status)) ||
      allVersions.find((v) => hasAgreementSignatures(v)) ||
      (isAgreementLockedOrActiveStatus(tx.status)
        ? allVersions[0]
        : undefined);

    if (!activeVersion) {
      return NextResponse.json(
        {
          error:
            "Cannot initialize milestone payments: No active or signed agreement version found. Both parties must approve an agreement in Pillar 3 first.",
        },
        { status: 400 }
      );
    }

    const milestones = await syncMilestonesForActiveAgreement(
      supabase,
      transactionId,
      activeVersion.id,
      Number(tx.total_amount) || 0,
      tx.currency || "INR",
      (Array.isArray(activeVersion.sections) ? activeVersion.sections : []) as AgreementSection[]
    );

    return NextResponse.json({
      success: true,
      milestones,
      activeAgreementVersionId: activeVersion.id,
      activeAgreementVersionNumber: activeVersion.version_number,
    });
  } catch (err) {
    console.error("Unexpected error in /api/payments/sync-milestones:", err);
    return NextResponse.json(
      { error: "Internal server error syncing milestones" },
      { status: 500 }
    );
  }
}

