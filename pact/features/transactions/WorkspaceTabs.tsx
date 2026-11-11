"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Badge, MountedTimestamp } from "@/components/ui";
import {
  MessageSquare,
  Sparkles,
  FileCheck,
  CreditCard,
  Archive,
  Copy,
  Check,
  AlertTriangle,
  GitBranch,
  X,
} from "lucide-react";
import { TransactionStatus, ParticipantRole } from "@/types/transaction";

import { ExtractedTerm } from "@/types/term";
import { PredictiveScenario, ScenarioCoverageMetrics } from "@/types/scenario";
import { AgreementVersion } from "@/types/agreement";
import { mapRawAgreementVersion } from "@/lib/agreement/mapper";
import { isAgreementLockedOrActiveStatus } from "@/lib/agreement/status";
import {
  MilestoneStatus,
  PaymentMilestone,
  PaymentRecord,
} from "@/types/payment";
import { createClient } from "@/lib/supabase/client";
import type {
  StoredVisualProof,
  VisualProofPayoutReceipt,
  VisualProofSpecCheck,
} from "@/types/proof";
import {
  DriftAlert,
  LedgerIntegrityReport,
  TransactionEvent,
} from "@/types/vault";
import { ChatMessage, ConversationTab } from "@/components/workspace/ConversationTab";
import { ScenariosTab } from "@/components/workspace/ScenariosTab";
import { AgreementTab } from "@/components/workspace/AgreementTab";
import { PaymentsTab } from "@/components/workspace/PaymentsTab";
import { VaultTab } from "@/components/workspace/VaultTab";

export interface WorkspaceTabsProps {
  transaction: {
    id: string;
    title: string;
    description: string | null;
    category: string | null;
    status: TransactionStatus;
    inviteCode: string;
    totalAmount: number;
    currency: string;
    createdAt: string;
  };
  currentUser: {
    id: string;
    role: ParticipantRole | "observer";
  };
  participants: {
    buyer: { name: string; id: string } | null;
    seller: { name: string; id: string } | null;
  };
  initialMessages?: ChatMessage[];
  initialTerms?: ExtractedTerm[];
  initialScenarios?: PredictiveScenario[];
  initialCoverage?: ScenarioCoverageMetrics;
  initialAgreementVersions?: AgreementVersion[];
  initialMilestones?: PaymentMilestone[];
  initialPaymentRecords?: PaymentRecord[];
  initialEvents?: TransactionEvent[];
  initialDriftAlerts?: DriftAlert[];
  initialIntegrityReport?: LedgerIntegrityReport;
}

type TabType = "conversation" | "scenarios" | "agreement" | "payments" | "evidence";

export function WorkspaceTabs({
  transaction,
  currentUser,
  participants,
  initialMessages = [],
  initialTerms = [],
  initialScenarios = [],
  initialCoverage = {
    score: 0,
    resolvedCount: 0,
    totalCount: 0,
    openCount: 0,
    categoryBreakdown: {
      timeline_delay: { total: 0, resolved: 0 },
      scope_dispute: { total: 0, resolved: 0 },
      material_shortage: { total: 0, resolved: 0 },
      quality_rejection: { total: 0, resolved: 0 },
      cost_escalation: { total: 0, resolved: 0 },
      cancellation: { total: 0, resolved: 0 },
    },
    readinessTag: "vulnerable",
    disclaimer:
      "Scenario Coverage reflects mutual contingency preparedness against anticipated complications. It is an operational assurance score and does not constitute a legal guarantee or warranty.",
  },
  initialAgreementVersions = [],
  initialMilestones = [],
  initialPaymentRecords = [],
  initialEvents = [],
  initialDriftAlerts = [],
  initialIntegrityReport = {
    is_valid: true,
    total_events: initialEvents.length,
    tampered_event_id: null,
    checked_at: "",
    genesis_hash: "GENESIS_HASH",
    latest_event_hash:
      initialEvents.length > 0
        ? initialEvents[initialEvents.length - 1].eventHash
        : null,
  },
}: WorkspaceTabsProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = React.useState<TabType>("conversation");
  const [txOverride, setTxOverride] = React.useState<{
    base: WorkspaceTabsProps["transaction"];
    value: WorkspaceTabsProps["transaction"];
  } | null>(null);
  const [syncedMessages, setSyncedMessages] =
    React.useState<ChatMessage[]>(initialMessages);
  const [syncedTerms, setSyncedTerms] =
    React.useState<ExtractedTerm[]>(initialTerms);
  const [milestonesOverride, setMilestonesOverride] = React.useState<{
    base: PaymentMilestone[];
    value: PaymentMilestone[];
  } | null>(null);
  const [paymentRecordsOverride, setPaymentRecordsOverride] = React.useState<{
    base: PaymentRecord[];
    value: PaymentRecord[];
  } | null>(null);
  const [realtimeAgreementVersions, setRealtimeAgreementVersions] =
    React.useState<AgreementVersion[] | null>(null);

  const syncedTransaction = React.useMemo(
    () => (txOverride && txOverride.base === transaction ? txOverride.value : transaction),
    [txOverride, transaction]
  );

  const syncedMilestones = React.useMemo(
    () =>
      milestonesOverride && milestonesOverride.base === initialMilestones
        ? milestonesOverride.value
        : initialMilestones,
    [milestonesOverride, initialMilestones]
  );

  const syncedPaymentRecords = React.useMemo(
    () =>
      paymentRecordsOverride &&
      paymentRecordsOverride.base === initialPaymentRecords
        ? paymentRecordsOverride.value
        : initialPaymentRecords,
    [paymentRecordsOverride, initialPaymentRecords]
  );

  const effectiveAgreementVersions = React.useMemo(() => {
    if (!realtimeAgreementVersions || realtimeAgreementVersions.length === 0) {
      return initialAgreementVersions;
    }
    if (initialAgreementVersions.length === 0) {
      return realtimeAgreementVersions;
    }

    const scoreList = (list: AgreementVersion[]) => {
      const maxVersion = Math.max(...list.map((v) => v.versionNumber), 0);
      const totalApprovals = list.reduce(
        (sum, v) => sum + (v.approvals?.length || 0),
        0
      );
      const activeCount = list.filter(
        (v) =>
          isAgreementLockedOrActiveStatus(v.status) ||
          Boolean(v.isMutuallyApproved)
      ).length;
      return { maxVersion, count: list.length, totalApprovals, activeCount };
    };

    const initScore = scoreList(initialAgreementVersions);
    const rtScore = scoreList(realtimeAgreementVersions);

    if (rtScore.maxVersion !== initScore.maxVersion) {
      return rtScore.maxVersion > initScore.maxVersion
        ? realtimeAgreementVersions
        : initialAgreementVersions;
    }
    if (rtScore.count !== initScore.count) {
      return rtScore.count > initScore.count
        ? realtimeAgreementVersions
        : initialAgreementVersions;
    }
    if (rtScore.activeCount !== initScore.activeCount) {
      return rtScore.activeCount > initScore.activeCount
        ? realtimeAgreementVersions
        : initialAgreementVersions;
    }
    if (rtScore.totalApprovals !== initScore.totalApprovals) {
      return rtScore.totalApprovals > initScore.totalApprovals
        ? realtimeAgreementVersions
        : initialAgreementVersions;
    }

    return realtimeAgreementVersions;
  }, [initialAgreementVersions, realtimeAgreementVersions]);

  const activeAgreement = React.useMemo(
    () =>
      effectiveAgreementVersions.find(
        (v) =>
          isAgreementLockedOrActiveStatus(v.status) ||
          Boolean(v.isMutuallyApproved)
      ) || null,
    [effectiveAgreementVersions]
  );

  const paymentsAgreement = React.useMemo(
    () =>
      activeAgreement ||
      effectiveAgreementVersions.find(
        (v) =>
          (Array.isArray(v.approvals) && v.approvals.length > 0) ||
          Boolean(v.buyerApproved || v.sellerApproved || v.isMutuallyApproved)
      ) ||
      effectiveAgreementVersions[0] ||
      null,
    [activeAgreement, effectiveAgreementVersions]
  );

  const persistedVisualProof = React.useMemo<StoredVisualProof | null>(() => {
    const proofEvents = initialEvents.filter(
      (ev) => ev.eventType === "proof_verified" || ev.eventType === "proof_rejected"
    );
    const latestEvent = proofEvents[proofEvents.length - 1];
    if (latestEvent?.eventPayload && typeof latestEvent.eventPayload === "object") {
      const payload = latestEvent.eventPayload as Record<string, unknown>;
      if (typeof payload.isApproved === "boolean") {
        return {
          isApproved: payload.isApproved,
          matchConfidence:
            typeof payload.matchConfidence === "number" ? payload.matchConfidence : 0,
          specChecklist: Array.isArray(payload.specChecklist)
            ? (payload.specChecklist as VisualProofSpecCheck[])
            : [],
          summary:
            typeof payload.summary === "string"
              ? payload.summary
              : "Visual inspection recorded.",
          transactionId: transaction.id,
          milestoneId:
            typeof payload.milestoneId === "string" ? payload.milestoneId : null,
          agreementVersionId:
            typeof payload.agreementVersionId === "string"
              ? payload.agreementVersionId
              : null,
          fileName:
            typeof payload.fileName === "string" ? payload.fileName : undefined,
          imageUrl:
            typeof payload.imageUrl === "string" ? payload.imageUrl : undefined,
          verifiedAt:
            typeof payload.verifiedAt === "string"
              ? payload.verifiedAt
              : latestEvent.timestamp,
          provider:
            payload.provider === "gemini-vision"
              ? "gemini-vision"
              : "deterministic-fallback",
          ledgerEventId: latestEvent.id,
        };
      }
    }

    for (const rec of initialPaymentRecords) {
      const raw = rec.rawResponse;
      if (raw && typeof raw === "object" && "visualProof" in raw) {
        const vp = (raw as { visualProof?: StoredVisualProof }).visualProof;
        if (vp && typeof vp.isApproved === "boolean") {
          return vp;
        }
      }
    }

    return null;
  }, [initialEvents, initialPaymentRecords, transaction.id]);

  const [localVisualProof, setLocalVisualProof] =
    React.useState<StoredVisualProof | null>(null);
  const currentVisualProof = localVisualProof || persistedVisualProof;

  const persistedLatestPayout = (() => {
    const payoutEvents = initialEvents.filter(
      (ev) => ev.eventType === "paypal_payout_released"
    );
    const latestPayoutEv = payoutEvents[payoutEvents.length - 1];
    if (latestPayoutEv?.eventPayload && typeof latestPayoutEv.eventPayload === "object") {
      const p = latestPayoutEv.eventPayload as Record<string, unknown>;
      if (typeof p.payoutBatchId === "string") {
        return {
          executed: true,
          payoutBatchId: p.payoutBatchId,
          payoutItemId:
            typeof p.payoutItemId === "string" ? p.payoutItemId : undefined,
          batchStatus:
            typeof p.batchStatus === "string" ? p.batchStatus : "PENDING",
          amount: typeof p.amount === "number" ? p.amount : 0,
          currency: typeof p.currency === "string" ? p.currency : "USD",
          sellerEmail:
            typeof p.sellerEmail === "string" ? p.sellerEmail : undefined,
          captureId: typeof p.captureId === "string" ? p.captureId : undefined,
          milestoneId:
            typeof p.milestoneId === "string" ? p.milestoneId : null,
          milestoneTitle:
            typeof p.milestoneTitle === "string" ? p.milestoneTitle : undefined,
          isSimulated: Boolean(p.isSimulated),
          releasedAt:
            typeof p.releasedAt === "string"
              ? p.releasedAt
              : latestPayoutEv.timestamp,
          ledgerEventId: latestPayoutEv.id,
        } satisfies VisualProofPayoutReceipt;
      }
    }

    for (const rec of initialPaymentRecords) {
      const raw = rec.rawResponse;
      if (raw && typeof raw === "object" && "payout" in raw) {
        const payoutData = (raw as { payout?: VisualProofPayoutReceipt }).payout;
        if (payoutData?.payoutBatchId) {
          return {
            executed: true,
            payoutBatchId: payoutData.payoutBatchId,
            payoutItemId: payoutData.payoutItemId,
            batchStatus: payoutData.batchStatus,
            amount: payoutData.amount,
            currency: payoutData.currency,
            sellerEmail: payoutData.sellerEmail,
            releasedAt: payoutData.releasedAt,
            isSimulated: payoutData.isSimulated,
          } satisfies VisualProofPayoutReceipt;
        }
      }
    }

    return null;
  })();

  const [localLatestPayout, setLocalLatestPayout] =
    React.useState<VisualProofPayoutReceipt | null>(null);
  const currentLatestPayout = localLatestPayout || persistedLatestPayout;
  const [livePayPalNotice, setLivePayPalNotice] = React.useState<string | null>(
    null
  );

  const refreshPaymentsStateFromSupabase = React.useCallback(async () => {
    try {
      const supabase = createClient();
      const [txRes, versionsRes, milestonesRes, paymentsRes] = await Promise.all([
        supabase
          .from("transactions")
          .select(
            "id, title, description, category, status, invite_code, total_amount, currency, created_at"
          )
          .eq("id", transaction.id)
          .maybeSingle(),
        supabase
          .from("agreement_versions")
          .select(
            `
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
          `
          )
          .eq("transaction_id", transaction.id)
          .order("version_number", { ascending: false }),
        supabase
          .from("payment_milestones")
          .select("*")
          .eq("transaction_id", transaction.id)
          .order("sequence_order", { ascending: true }),
        supabase
          .from("payment_records")
          .select("*")
          .eq("transaction_id", transaction.id)
          .order("created_at", { ascending: false }),
      ]);

      if (txRes.data) {
        const txData = txRes.data;
        setTxOverride({
          base: transaction,
          value: {
            id: txData.id || transaction.id,
            title: txData.title || transaction.title,
            description: txData.description ?? transaction.description,
            category: txData.category ?? transaction.category,
            status: (txData.status || transaction.status) as TransactionStatus,
            inviteCode: txData.invite_code || transaction.inviteCode,
            totalAmount: Number(txData.total_amount ?? transaction.totalAmount) || 0,
            currency: txData.currency || transaction.currency,
            createdAt: txData.created_at || transaction.createdAt,
          },
        });
      }

      if (Array.isArray(versionsRes.data) && versionsRes.data.length > 0) {
        const mappedVersions = (
          versionsRes.data as Array<Record<string, unknown>>
        ).map((v) => mapRawAgreementVersion(v));
        setRealtimeAgreementVersions(mappedVersions);
      }

      const mappedPaymentRecords: PaymentRecord[] | null = Array.isArray(
        paymentsRes.data
      )
        ? (paymentsRes.data as Array<Record<string, unknown>>).map((r) => ({
            id: String(r.id || ""),
            milestoneId: String(r.milestone_id || ""),
            transactionId: String(r.transaction_id || transaction.id),
            payerId: String(r.payer_id || ""),
            paypalOrderId: String(r.paypal_order_id || ""),
            paypalCaptureId: (r.paypal_capture_id as string | null) ?? null,
            amount: Number(r.amount) || 0,
            currency: String(
              r.currency || txRes.data?.currency || transaction.currency || "USD"
            ),
            status: String(r.status || "CREATED"),
            rawResponse: (r.raw_response as Record<string, unknown>) || {},
            createdAt: String(r.created_at || ""),
          }))
        : null;

      if (mappedPaymentRecords) {
        setPaymentRecordsOverride({
          base: initialPaymentRecords,
          value: mappedPaymentRecords,
        });
      }

      if (Array.isArray(milestonesRes.data) && milestonesRes.data.length > 0) {
        const paymentLookup = mappedPaymentRecords || initialPaymentRecords;
        const mappedMilestones: PaymentMilestone[] = (
          milestonesRes.data as Array<Record<string, unknown>>
        ).map((m) => {
          const milestoneId = String(m.id || "");
          return {
            id: milestoneId,
            transactionId: String(m.transaction_id || transaction.id),
            agreementVersionId: String(m.agreement_version_id || ""),
            title: String(m.title || "Escrow Milestone"),
            description: (m.description as string | null) ?? null,
            amount: Number(m.amount) || 0,
            currency: String(
              m.currency || txRes.data?.currency || transaction.currency || "USD"
            ),
            sequenceOrder: Number(m.sequence_order) || 1,
            status:
              (String(m.status || "pending").toLowerCase() as MilestoneStatus) ||
              "pending",
            dueDate: (m.due_date as string | null) ?? null,
            createdAt: String(m.created_at || ""),
            updatedAt: String(m.updated_at || ""),
            latestPaymentRecord:
              paymentLookup.find((rec) => rec.milestoneId === milestoneId) ||
              null,
          };
        });
        setMilestonesOverride({
          base: initialMilestones,
          value: mappedMilestones,
        });
      }

      // Server fallback ensures demo/service-role backed records still refresh cleanly
      if (!txRes.data || txRes.error || versionsRes.error) {
        const res = await fetch(`/api/transactions/${transaction.id}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const payload = await res.json();
          if (payload.transaction) {
            setTxOverride({ base: transaction, value: payload.transaction });
          }
          if (Array.isArray(payload.agreementVersions)) {
            setRealtimeAgreementVersions(payload.agreementVersions);
          }
          if (Array.isArray(payload.milestones)) {
            setMilestonesOverride({
              base: initialMilestones,
              value: payload.milestones,
            });
          }
          if (Array.isArray(payload.paymentRecords)) {
            setPaymentRecordsOverride({
              base: initialPaymentRecords,
              value: payload.paymentRecords,
            });
          }
        }
      }
    } catch (err) {
      console.warn(
        "[WorkspaceTabs] Non-fatal Supabase state refresh warning:",
        err
      );
    } finally {
      router.refresh();
    }
  }, [transaction, initialMilestones, initialPaymentRecords, router]);

  const handleTabSelect = React.useCallback(
    (tabId: TabType) => {
      setActiveTab(tabId);
      if (tabId === "payments") {
        void refreshPaymentsStateFromSupabase();
      }
    },
    [refreshPaymentsStateFromSupabase]
  );

  // Subscribe to real-time buyer/seller PayPal webhook, payout, milestone, and agreement updates
  React.useEffect(() => {
    const supabase = createClient();
    const roleTopic =
      currentUser.role === "buyer" || currentUser.role === "seller"
        ? `transaction-workspace-${transaction.id}-${currentUser.role}`
        : null;

    const handleAgreementBroadcast = (payload: unknown) => {
      if (
        payload &&
        typeof payload === "object" &&
        "versions" in payload &&
        Array.isArray((payload as { versions?: unknown[] }).versions)
      ) {
        const mapped = (
          (payload as { versions: Array<Record<string, unknown>> }).versions ||
          []
        ).map((v) => mapRawAgreementVersion(v));
        if (mapped.length > 0) {
          setRealtimeAgreementVersions(mapped);
        }
      }
      void refreshPaymentsStateFromSupabase();
    };

    const workspaceChannel = supabase
      .channel(`transaction-workspace-${transaction.id}`)
      .on("broadcast", { event: "paypal_status_update" }, ({ payload }) => {
        if (payload && typeof payload === "object" && "summary" in payload) {
          setLivePayPalNotice(String((payload as { summary?: string }).summary || ""));
        }
        void refreshPaymentsStateFromSupabase();
      })
      .on("broadcast", { event: "agreement_compiled" }, ({ payload }) => {
        handleAgreementBroadcast(payload);
      })
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "transactions",
          filter: `id=eq.${transaction.id}`,
        },
        () => {
          void refreshPaymentsStateFromSupabase();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agreement_versions",
          filter: `transaction_id=eq.${transaction.id}`,
        },
        () => {
          void refreshPaymentsStateFromSupabase();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agreement_approvals",
          filter: `transaction_id=eq.${transaction.id}`,
        },
        () => {
          void refreshPaymentsStateFromSupabase();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payment_milestones",
          filter: `transaction_id=eq.${transaction.id}`,
        },
        () => {
          void refreshPaymentsStateFromSupabase();
        }
      )
      .subscribe();

    const roleChannel = roleTopic
      ? supabase
          .channel(roleTopic)
          .on("broadcast", { event: "paypal_status_update" }, ({ payload }) => {
            if (payload && typeof payload === "object" && "summary" in payload) {
              setLivePayPalNotice(
                String((payload as { summary?: string }).summary || "")
              );
            }
            void refreshPaymentsStateFromSupabase();
          })
          .on("broadcast", { event: "agreement_compiled" }, ({ payload }) => {
            handleAgreementBroadcast(payload);
          })
          .subscribe()
      : null;

    return () => {
      supabase.removeChannel(workspaceChannel);
      if (roleChannel) {
        supabase.removeChannel(roleChannel);
      }
    };
  }, [transaction.id, currentUser.role, refreshPaymentsStateFromSupabase]);

  const [copiedCode, setCopiedCode] = React.useState(false);
  const [localDetectedAlerts, setLocalDetectedAlerts] = React.useState<DriftAlert[]>([]);
  const [resolvedAlertIds, setResolvedAlertIds] = React.useState<Record<string, boolean>>({});
  const [processingDriftId, setProcessingDriftId] = React.useState<string | null>(null);
  const [driftBannerNotice, setDriftBannerNotice] = React.useState<string | null>(null);

  const allDriftAlerts = React.useMemo(() => {
    const byId = new Map<string, DriftAlert>();
    [...initialDriftAlerts, ...localDetectedAlerts].forEach((a) => {
      if (!byId.has(a.id)) {
        byId.set(a.id, a);
      }
    });
    return Array.from(byId.values());
  }, [initialDriftAlerts, localDetectedAlerts]);

  const openDriftAlerts = React.useMemo(
    () =>
      allDriftAlerts.filter(
        (a) => a.status === "open" && !resolvedAlertIds[a.id]
      ),
    [allDriftAlerts, resolvedAlertIds]
  );

  const handleDriftDetectedFromChat = (rawAlerts: Array<Record<string, unknown>>) => {
    const mapped: DriftAlert[] = rawAlerts.map((a) => ({
      id: a.id as string,
      transactionId: a.transaction_id as string,
      activeVersionId: a.active_version_id as string,
      sourceMessageId: (a.source_message_id as string | null) ?? null,
      termKey: a.term_key as string,
      originalValue: a.original_value as string,
      proposedValue: a.proposed_value as string,
      confidenceScore: Number(a.confidence_score) || 0.85,
      status: (a.status as DriftAlert["status"]) || "open",
      createdAt: a.created_at as string,
    }));
    setLocalDetectedAlerts((prev) => [...mapped, ...prev]);
  };

  const handleDriftAction = async (
    driftAlertId: string,
    action: "amend" | "dismiss"
  ) => {
    setProcessingDriftId(driftAlertId);
    setDriftBannerNotice(null);

    try {
      const res = await fetch("/api/ai/detect-drift", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driftAlertId,
          transactionId: transaction.id,
          action,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update drift alert");
      }

      setResolvedAlertIds((prev) => ({ ...prev, [driftAlertId]: true }));

      if (action === "amend") {
        setDriftBannerNotice(
          `Amendment Version V${data.newVersionNumber} created. Both parties can now review and sign in Pillar 3.`
        );
        setActiveTab("agreement");
      }
      router.refresh();
    } catch (err) {
      setDriftBannerNotice(
        err instanceof Error ? err.message : "Failed to process drift alert"
      );
    } finally {
      setProcessingDriftId(null);
    }
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(transaction.inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const tabs: Array<{ id: TabType; label: string; icon: React.ElementType; badge?: string }> = [
    { id: "conversation", label: "Conversation", icon: MessageSquare },
    { id: "scenarios", label: "Scenarios", icon: Sparkles },
    { id: "agreement", label: "Agreement", icon: FileCheck },
    { id: "payments", label: "Payments", icon: CreditCard },
    { id: "evidence", label: "Vault", icon: Archive },
  ];

  return (
    <div className="space-y-6">
      {/* Workspace Header Shell */}
      <div className="group relative overflow-hidden bg-zinc-950/70 backdrop-blur-xl rounded-2xl border border-zinc-800/80 p-6 shadow-xl space-y-4 transition-all duration-200 hover:border-zinc-700/80">
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent transition-opacity duration-200 ${
            isAgreementLockedOrActiveStatus(syncedTransaction.status)
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-100"
          }`}
        />
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-[11px] uppercase font-semibold">
                {syncedTransaction.category || "Custom Commerce"}
              </Badge>
              <Badge
                variant={
                  String(syncedTransaction.status).toLowerCase() === "active"
                    ? "success"
                    : isAgreementLockedOrActiveStatus(syncedTransaction.status)
                    ? "assurance"
                    : "warning"
                }
                pulse={isAgreementLockedOrActiveStatus(syncedTransaction.status)}
                className="capitalize"
              >
                {syncedTransaction.status}
              </Badge>
              <Badge variant="secondary" className="capitalize text-xs">
                Role: {currentUser.role}
              </Badge>
              <span className="font-mono tracking-tight text-[11px] text-zinc-400">
                ID #{syncedTransaction.id.slice(0, 8)}
              </span>
              <MountedTimestamp
                value={syncedTransaction.createdAt}
                mode="date"
                prefix="Created "
                className="font-mono tracking-tight text-[11px] text-zinc-500"
              />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-zinc-100">
              {syncedTransaction.title}
            </h1>
          </div>

          {/* Quick Invite Code Display */}
          <div className="flex items-center gap-2 bg-zinc-950/75 p-2.5 rounded-xl border border-zinc-800/90 backdrop-blur-sm">
            <div className="flex flex-col text-left">
              <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">
                Invite Code
              </span>
              <span className="font-mono tracking-widest text-sm font-extrabold text-emerald-400">
                {transaction.inviteCode}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={copyInviteCode}
              className="h-8 px-2.5 ml-2 gap-1.5 text-xs cursor-pointer active:scale-95 transition-all duration-200"
            >
              {copiedCode ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-semibold">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Share</span>
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Participant Status Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-zinc-800/70">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 font-bold flex items-center justify-center text-xs">
              B
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Buyer
              </span>
              <span className="text-sm font-semibold text-zinc-100">
                {participants.buyer?.name || (
                  <span className="text-amber-400/90 font-medium">
                    Awaiting Buyer
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-xs">
              S
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Seller
              </span>
              <span className="text-sm font-semibold text-zinc-100">
                {participants.seller?.name || (
                  <span className="text-amber-400/90 font-medium">
                    Awaiting Seller (Share code)
                  </span>
                )}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 sm:justify-end">
            <div className="flex flex-col sm:text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Target Budget
              </span>
              <span className="font-mono tabular-nums tracking-tight text-lg font-black text-zinc-100">
                {transaction.currency}{" "}
                {transaction.totalAmount.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Floating Agreement Drift Alert Banner */}
        {(openDriftAlerts.length > 0 || driftBannerNotice) && (
          <div className="pt-4 border-t border-zinc-800/70 space-y-2.5">
            {openDriftAlerts.map((alert) => {
              const targetNextVersion =
                (activeAgreement?.versionNumber ||
                  effectiveAgreementVersions[0]?.versionNumber ||
                  1) + 1;
              return (
                <div
                  key={alert.id}
                  className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 backdrop-blur-sm flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="warning" pulse className="text-[10px] font-bold">
                          Agreement Drift Detected
                        </Badge>
                        <span className="font-bold text-zinc-100">
                          {alert.termKey}
                        </span>
                        <span className="text-[10px] font-mono tracking-tight text-zinc-400">
                          Confidence {Math.round(alert.confidenceScore * 100)}%
                        </span>
                      </div>
                      <p className="text-zinc-400">
                        <strong className="text-zinc-200">Contracted:</strong>{" "}
                        {alert.originalValue}
                      </p>
                      <p className="text-zinc-100 font-medium">
                        <strong>Chat Proposal:</strong> {alert.proposedValue}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant="assurance"
                      onClick={() => handleDriftAction(alert.id, "amend")}
                      disabled={processingDriftId === alert.id}
                      className="text-xs gap-1.5 cursor-pointer"
                    >
                      <GitBranch className="h-3.5 w-3.5" />
                      <span>
                        {processingDriftId === alert.id
                          ? "Compiling Amendment..."
                          : `Create Amendment Version (V${targetNextVersion})`}
                      </span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => handleDriftAction(alert.id, "dismiss")}
                      disabled={processingDriftId === alert.id}
                      className="text-xs gap-1 cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Dismiss</span>
                    </Button>
                  </div>
                </div>
              );
            })}

            {driftBannerNotice && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-emerald-300 flex items-center justify-between">
                <span>{driftBannerNotice}</span>
                <button
                  type="button"
                  onClick={() => setDriftBannerNotice(null)}
                  className="text-[11px] font-semibold text-emerald-400 hover:underline transition-all duration-200 active:scale-95 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Live PayPal Webhook / Realtime Status Notification */}
      {livePayPalNotice && (
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 backdrop-blur-md px-4 py-3 text-xs text-sky-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2 w-2 rounded-full bg-sky-400 animate-ping shrink-0" />
            <span className="font-medium truncate">{livePayPalNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setLivePayPalNotice(null)}
            className="text-[11px] font-semibold text-sky-300 hover:underline shrink-0 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 5-Pillar Tabs Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto p-1.5 rounded-2xl bg-zinc-950/70 backdrop-blur-xl border border-zinc-800/80 scrollbar-none">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabSelect(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl transition-all duration-200 active:scale-95 whitespace-nowrap cursor-pointer ${
                isActive
                  ? "bg-zinc-800/90 text-emerald-400 border border-emerald-500/30 shadow-[0_0_16px_-4px_rgba(16,185,129,0.28)]"
                  : "text-zinc-400 border border-transparent hover:text-zinc-100 hover:bg-zinc-800/50"
              }`}
            >
              <Icon className={`h-4 w-4 ${isActive ? "text-emerald-400" : ""}`} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab Panels */}

      {/* 1. Conversation Tab: Live Realtime Chat & AI Extracted Terms */}
      {activeTab === "conversation" && (
        <ConversationTab
          transactionId={transaction.id}
          currentUserId={currentUser.id}
          currentUserRole={currentUser.role}
          initialMessages={syncedMessages}
          initialTerms={syncedTerms}
          participants={participants}
          onMessagesUpdated={setSyncedMessages}
          onTermsUpdated={setSyncedTerms}
          onDriftDetected={handleDriftDetectedFromChat}
        />
      )}

      {/* 2. Scenarios Tab (Predictive Risk & Mutual Contingency System) */}
      {activeTab === "scenarios" && (
        <ScenariosTab
          transactionId={transaction.id}
          initialScenarios={initialScenarios}
          initialCoverage={initialCoverage}
          currentUserRole={currentUser.role}
          currencySymbol={transaction.currency === "INR" ? "₹" : "$"}
        />
      )}

      {/* 3. Agreement Builder Tab (Pillar 3: Immutable Versioned Contract Engine) */}
      {activeTab === "agreement" && (
        <AgreementTab
          key={effectiveAgreementVersions
            .map(
              (v) =>
                `${v.id}:${v.status}:${v.contentHash}:${v.approvals?.length || 0}`
            )
            .join("|")}
          transactionId={syncedTransaction.id}
          initialVersions={effectiveAgreementVersions}
          initialEvents={initialEvents}
          currentUserRole={currentUser.role}
          participants={participants}
          onAgreementLocked={() => {
            void refreshPaymentsStateFromSupabase();
          }}
        />
      )}

      {/* 4. Payments Tab (Pillar 4: PayPal Milestone Payment Coordination) */}
      {activeTab === "payments" && (
        <PaymentsTab
          key={`payments-${syncedTransaction.id}`}
          transactionId={syncedTransaction.id}
          transactionTitle={syncedTransaction.title}
          transactionCategory={syncedTransaction.category}
          transactionStatus={syncedTransaction.status}
          transaction={{
            id: syncedTransaction.id,
            status: syncedTransaction.status,
            title: syncedTransaction.title,
            category: syncedTransaction.category,
            totalAmount: syncedTransaction.totalAmount,
            currency: syncedTransaction.currency,
          }}
          totalAmount={syncedTransaction.totalAmount}
          currency={syncedTransaction.currency}
          currentUserRole={currentUser.role}
          agreement={paymentsAgreement}
          agreementVersions={effectiveAgreementVersions}
          activeAgreementVersion={
            activeAgreement
              ? {
                  id: activeAgreement.id,
                  versionNumber: activeAgreement.versionNumber,
                  contentHash: activeAgreement.contentHash,
                  title: activeAgreement.title,
                  sections: activeAgreement.sections,
                  status: activeAgreement.status,
                  approvals: activeAgreement.approvals,
                  buyerApproved: activeAgreement.buyerApproved,
                  sellerApproved: activeAgreement.sellerApproved,
                  isMutuallyApproved: activeAgreement.isMutuallyApproved,
                }
              : null
          }
          initialMilestones={syncedMilestones}
          initialPaymentRecords={syncedPaymentRecords}
          initialVisualProof={currentVisualProof}
          initialLatestPayout={currentLatestPayout}
          onProofVerified={(proof, payout) => {
            setLocalVisualProof(proof);
            if (payout) {
              setLocalLatestPayout(payout);
            }
            void refreshPaymentsStateFromSupabase();
          }}
        />
      )}

      {/* 5. Evidence Vault Tab (Pillar 5: Hash-Chained Ledger & Dispute Intelligence) */}
      {activeTab === "evidence" && (
        <VaultTab
          transaction={{
            id: syncedTransaction.id,
            title: syncedTransaction.title,
            category: syncedTransaction.category,
            status: syncedTransaction.status,
            totalAmount: syncedTransaction.totalAmount,
            currency: syncedTransaction.currency,
            createdAt: syncedTransaction.createdAt,
          }}
          participants={participants}
          activeAgreementVersion={
            activeAgreement ||
            effectiveAgreementVersions.find((v) => v.isMutuallyApproved) ||
            null
          }
          messages={syncedMessages}
          milestones={syncedMilestones}
          paymentRecords={syncedPaymentRecords}
          initialEvents={initialEvents}
          initialDriftAlerts={allDriftAlerts}
          initialIntegrityReport={initialIntegrityReport}
          onRefundExecuted={() => {
            void refreshPaymentsStateFromSupabase();
          }}
        />
      )}
    </div>
  );
}
