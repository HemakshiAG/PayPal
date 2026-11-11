import * as React from "react";
import { notFound, redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveDemoAccountByEmail } from "@/lib/auth/demo-accounts";
import {
  ensureDemoParticipantAccess,
  hasUsableServiceRoleKey,
} from "@/lib/auth/demo-provision";
import { ensureDefaultMilestonesForTransaction } from "@/lib/transactions/service";
import { WorkspaceTabs } from "@/features/transactions/WorkspaceTabs";
import { TransactionStatus, ParticipantRole } from "@/types/transaction";
import { ExtractedTerm } from "@/types/term";
import {
  PredictiveScenario,
  ScenarioCategory,
  ScenarioSeverity,
  ScenarioStatus,
} from "@/types/scenario";
import {
  AgreementVersion,
  AgreementSection,
  AgreementApproval,
} from "@/types/agreement";
import { PaymentMilestone, PaymentRecord, MilestoneStatus } from "@/types/payment";
import {
  DriftAlert,
  DriftAlertStatus,
  TransactionEvent,
} from "@/types/vault";
import { verifyLedgerIntegrity } from "@/lib/ledger/events";
import { computeScenarioCoverage } from "@/lib/scenarios/coverage";
import { normalizeTermForClient } from "@/lib/terms/normalize";
import { ChatMessage } from "@/components/workspace/ConversationTab";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessionClient = await createClient();

  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user) {
    redirect(`/login?redirectTo=/transactions/${id}`);
  }

  const demoAccount = resolveDemoAccountByEmail(user.email);
  if (demoAccount) {
    await ensureDemoParticipantAccess(sessionClient, user, id);
  }

  const supabase =
    demoAccount && hasUsableServiceRoleKey()
      ? createAdminClient()
      : sessionClient;

  // 1. Fetch transaction record
  const { data: transaction, error: txError } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .single();

  if (txError || !transaction) {
    notFound();
  }

  // 2. Fetch participants with profiles
  const { data: participants } = await supabase
    .from("transaction_participants")
    .select(`
      id,
      user_id,
      role,
      joined_at,
      profiles (
        full_name,
        avatar_url,
        role
      )
    `)
    .eq("transaction_id", id);

  // Check if current user is participant or creator
  const isCreator = transaction.creator_id === user.id;
  const myParticipantRecord = participants?.find((p) => p.user_id === user.id);

  if (!isCreator && !myParticipantRecord) {
    redirect("/dashboard");
  }

  // 3. Fetch initial conversation messages
  const { data: initialMessages } = await supabase
    .from("messages")
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
    .eq("transaction_id", id)
    .order("created_at", { ascending: true });

  // 4. Fetch initial extracted terms
  const { data: initialTerms } = await supabase
    .from("extracted_terms")
    .select("*")
    .eq("transaction_id", id)
    .order("created_at", { ascending: false });

  // 5. Fetch initial scenarios and their resolutions
  const { data: rawScenarios } = await supabase
    .from("scenarios")
    .select(`
      *,
      scenario_resolutions (*)
    `)
    .eq("transaction_id", id)
    .order("created_at", { ascending: true });

  const initialCoverage = computeScenarioCoverage(
    (rawScenarios || []).map((s: Record<string, unknown>) => ({
      category: s.category as string,
      status: s.status as string,
    }))
  );

  const initialScenarios: PredictiveScenario[] = (rawScenarios || []).map(
    (s: Record<string, unknown>) => {
      const resolutions =
        (s.scenario_resolutions as Array<Record<string, unknown>>) || [];
      const activeRes =
        resolutions.length > 0
          ? {
              id: resolutions[0].id as string,
              scenarioId: resolutions[0].scenario_id as string,
              transactionId: resolutions[0].transaction_id as string,
              proposedBy: resolutions[0].proposed_by as string,
              agreedAction: resolutions[0].agreed_action as string,
              priceImpactType: resolutions[0].price_impact_type as
                | "none"
                | "additional_cost"
                | "discount"
                | "refund",
              priceImpactValue: Number(resolutions[0].price_impact_value) || 0,
              timelineImpactDays:
                Number(resolutions[0].timeline_impact_days) || 0,
              buyerApproved: Boolean(resolutions[0].buyer_approved),
              sellerApproved: Boolean(resolutions[0].seller_approved),
              buyerApprovedAt: resolutions[0].buyer_approved_at as string | null,
              sellerApprovedAt: resolutions[0].seller_approved_at as string | null,
              status: resolutions[0].status as "draft" | "accepted" | "rejected",
              createdAt: resolutions[0].created_at as string,
              updatedAt: resolutions[0].updated_at as string,
            }
          : null;

      return {
        id: s.id as string,
        transactionId: s.transaction_id as string,
        category: s.category as ScenarioCategory,
        title: s.title as string,
        description: s.description as string,
        severity: s.severity as ScenarioSeverity,
        consequenceChain: Array.isArray(s.consequence_chain)
          ? s.consequence_chain
          : [],
        recommendedResolutions: Array.isArray(s.recommended_resolutions)
          ? s.recommended_resolutions
          : [],
        status: s.status as ScenarioStatus,
        createdAt: s.created_at as string,
        updatedAt: s.updated_at as string,
        activeResolution: activeRes,
      };
    }
  );

  // 6. Fetch initial agreement versions and approvals
  const { data: rawAgreementVersions } = await supabase
    .from("agreement_versions")
    .select(`
      *,
      agreement_approvals (
        id,
        agreement_version_id,
        transaction_id,
        user_id,
        role,
        content_hash,
        approved_at,
        profiles (
          full_name,
          avatar_url
        )
      )
    `)
    .eq("transaction_id", id)
    .order("version_number", { ascending: false });

  const initialAgreementVersions: AgreementVersion[] = (
    rawAgreementVersions || []
  ).map((v: Record<string, unknown>) => {
    const rawApprovals =
      (v.agreement_approvals as Array<Record<string, unknown>>) || [];
    const approvals: AgreementApproval[] = rawApprovals.map((a) => {
      const prof = a.profiles as unknown as {
        full_name: string | null;
        avatar_url: string | null;
      } | null;
      return {
        id: a.id as string,
        agreementVersionId: a.agreement_version_id as string,
        transactionId: a.transaction_id as string,
        userId: a.user_id as string,
        role: a.role as "buyer" | "seller",
        contentHash: a.content_hash as string,
        approvedAt: a.approved_at as string,
        profile: prof
          ? { fullName: prof.full_name, avatarUrl: prof.avatar_url }
          : undefined,
      };
    });

    const buyerApp = approvals.find((a) => a.role === "buyer");
    const sellerApp = approvals.find((a) => a.role === "seller");

    return {
      id: v.id as string,
      transactionId: v.transaction_id as string,
      versionNumber: v.version_number as number,
      contentHash: v.content_hash as string,
      title: v.title as string,
      sections: Array.isArray(v.sections)
        ? (v.sections as AgreementSection[])
        : [],
      status: v.status as "draft" | "active" | "superseded" | "cancelled",
      createdBy: v.created_by as string,
      createdAt: v.created_at as string,
      approvals,
      buyerApproved: Boolean(buyerApp),
      sellerApproved: Boolean(sellerApp),
      isMutuallyApproved: Boolean(buyerApp && sellerApp),
    };
  });

  // 7. Fetch Payment Milestones and Payment Records (Phase 5)
  const { data: fetchedMilestones } = await supabase
    .from("payment_milestones")
    .select("*")
    .eq("transaction_id", id)
    .order("sequence_order", { ascending: true });

  const rawMilestones =
    fetchedMilestones && fetchedMilestones.length > 0
      ? fetchedMilestones
      : await ensureDefaultMilestonesForTransaction(supabase, user.id, {
          id: transaction.id,
          title: transaction.title,
          description: transaction.description,
          category: transaction.category,
          total_amount: Number(transaction.total_amount) || 0,
          currency: transaction.currency || "USD",
          creator_id: transaction.creator_id,
        });

  const { data: rawPaymentRecords } = await supabase
    .from("payment_records")
    .select("*")
    .eq("transaction_id", id)
    .order("created_at", { ascending: false });

  const initialPaymentRecords: PaymentRecord[] = (
    rawPaymentRecords || []
  ).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    milestoneId: r.milestone_id as string,
    transactionId: r.transaction_id as string,
    payerId: r.payer_id as string,
    paypalOrderId: r.paypal_order_id as string,
    paypalCaptureId: (r.paypal_capture_id as string | null) ?? null,
    amount: Number(r.amount) || 0,
    currency: (r.currency as string) || transaction.currency || "INR",
    status: (r.status as string) || "CREATED",
    rawResponse: (r.raw_response as Record<string, unknown>) || {},
    createdAt: r.created_at as string,
  }));

  const initialMilestones: PaymentMilestone[] = (rawMilestones || []).map(
    (m: Record<string, unknown>) => {
      const milestoneId = m.id as string;
      const latestRecord =
        initialPaymentRecords.find((rec) => rec.milestoneId === milestoneId) ||
        null;
      const normalizedStatus = String(
        m.status || "pending"
      ).toLowerCase() as MilestoneStatus;
      return {
        id: milestoneId,
        transactionId: m.transaction_id as string,
        agreementVersionId: m.agreement_version_id as string,
        title: (m.title as string) || "Escrow Milestone",
        description: (m.description as string | null) ?? null,
        amount: Number(m.amount) || 0,
        currency: (m.currency as string) || transaction.currency || "INR",
        sequenceOrder: Number(m.sequence_order) || 1,
        status: normalizedStatus,
        dueDate: (m.due_date as string | null) ?? null,
        createdAt: m.created_at as string,
        updatedAt: m.updated_at as string,
        latestPaymentRecord: latestRecord,
      };
    }
  );

  // Identify buyer and seller
  const buyerParticipant = participants?.find((p) => p.role === "buyer");
  const sellerParticipant = participants?.find((p) => p.role === "seller");

  const buyerProfile = buyerParticipant?.profiles as unknown as { full_name: string | null } | null;
  const sellerProfile = sellerParticipant?.profiles as unknown as { full_name: string | null } | null;

  const buyer = buyerParticipant
    ? {
        id: buyerParticipant.user_id,
        name: buyerProfile?.full_name || "Buyer",
      }
    : null;

  const seller = sellerParticipant
    ? {
        id: sellerParticipant.user_id,
        name: sellerProfile?.full_name || "Seller",
      }
    : null;

  const currentUserRole: ParticipantRole | "observer" =
    myParticipantRecord?.role || (isCreator ? "buyer" : "observer");

  // 8. Fetch Tamper-Evident Ledger Events, Drift Alerts & Verify Chain Integrity (Phase 6)
  const { data: rawEvents } = await supabase
    .from("transaction_events")
    .select("*")
    .eq("transaction_id", id)
    .order("timestamp", { ascending: true })
    .order("id", { ascending: true });

  const initialEvents: TransactionEvent[] = (rawEvents || []).map(
    (ev: Record<string, unknown>) => {
      const actorId = ev.actor_id as string;
      const matchedParticipant = participants?.find((p) => p.user_id === actorId);
      const prof = matchedParticipant?.profiles as unknown as {
        full_name: string | null;
      } | null;

      return {
        id: ev.id as string,
        transactionId: ev.transaction_id as string,
        eventType: ev.event_type as string,
        actorId,
        actorName:
          prof?.full_name ||
          (actorId === buyer?.id
            ? buyer?.name
            : actorId === seller?.id
            ? seller?.name
            : "Participant"),
        actorRole:
          (matchedParticipant?.role as "buyer" | "seller") ||
          (actorId === buyer?.id ? "buyer" : actorId === seller?.id ? "seller" : "observer"),
        timestamp: ev.timestamp as string,
        eventPayload: (ev.event_payload as Record<string, unknown>) || {},
        previousEventHash: ev.previous_event_hash as string,
        eventHash: ev.event_hash as string,
      };
    }
  );

  const { data: rawDriftAlerts } = await supabase
    .from("drift_alerts")
    .select("*")
    .eq("transaction_id", id)
    .order("created_at", { ascending: false });

  const initialDriftAlerts: DriftAlert[] = (rawDriftAlerts || []).map(
    (d: Record<string, unknown>) => ({
      id: d.id as string,
      transactionId: d.transaction_id as string,
      activeVersionId: d.active_version_id as string,
      sourceMessageId: (d.source_message_id as string | null) ?? null,
      termKey: d.term_key as string,
      originalValue: d.original_value as string,
      proposedValue: d.proposed_value as string,
      confidenceScore: Number(d.confidence_score) || 0.85,
      status: (d.status as DriftAlertStatus) || "open",
      createdAt: d.created_at as string,
    })
  );

  const initialIntegrityReport = await verifyLedgerIntegrity(id, supabase);
  const normalizedInitialTerms: ExtractedTerm[] = (initialTerms || []).map(
    (row, idx) => normalizeTermForClient(row, idx)
  );

  return (
    <div className="space-y-6">
      <WorkspaceTabs
        transaction={{
          id: transaction.id,
          title: transaction.title,
          description: transaction.description,
          category: transaction.category,
          status: transaction.status as TransactionStatus,
          inviteCode: transaction.invite_code,
          totalAmount: Number(transaction.total_amount) || 0,
          currency: transaction.currency || "INR",
          createdAt: transaction.created_at,
        }}
        currentUser={{
          id: user.id,
          role: currentUserRole,
        }}
        participants={{
          buyer,
          seller,
        }}
        initialMessages={(initialMessages as unknown as ChatMessage[]) || []}
        initialTerms={normalizedInitialTerms}
        initialScenarios={initialScenarios}
        initialCoverage={initialCoverage}
        initialAgreementVersions={initialAgreementVersions}
        initialMilestones={initialMilestones}
        initialPaymentRecords={initialPaymentRecords}
        initialEvents={initialEvents}
        initialDriftAlerts={initialDriftAlerts}
        initialIntegrityReport={initialIntegrityReport}
      />
    </div>
  );
}
