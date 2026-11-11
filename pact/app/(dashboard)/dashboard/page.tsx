import * as React from "react";
import Link from "next/link";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { resolveDemoAccountByEmail } from "@/lib/auth/demo-accounts";
import {
  ACTIVE_DEMO_WORKSPACE_ID,
  CANONICAL_DEMO_INVITE_CODE,
  ensureDemoParticipantAccess,
  hasUsableServiceRoleKey,
} from "@/lib/auth/demo-provision";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
  MountedTimestamp,
} from "@/components/ui";
import {
  PlusCircle,
  UserPlus,
  ArrowUpRight,
  Shield,
  Clock,
  Briefcase,
  Users,
} from "lucide-react";
import { TransactionStatus, ParticipantRole } from "@/types/transaction";
import { LoadDemoButton } from "@/components/dashboard/LoadDemoButton";
import { QuickJoinCodeBox } from "@/components/dashboard/QuickJoinCodeBox";
import { DemoJudgeSwitcher } from "@/components/auth/DemoJudgeSwitcher";

interface TransactionCardData {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: TransactionStatus;
  total_amount: number;
  currency: string;
  invite_code: string;
  updated_at: string;
  myRole: ParticipantRole | "creator";
  counterpartName: string | null;
  counterpartRole: ParticipantRole | null;
}

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let transactionCards: TransactionCardData[] = [];

  if (user) {
    const demoAccount = resolveDemoAccountByEmail(user.email);
    if (demoAccount) {
      await ensureDemoParticipantAccess(supabase, user);
    }

    const readClient =
      demoAccount && hasUsableServiceRoleKey() ? createAdminClient() : supabase;

    // 1. Get user's participant records
    const { data: participations } = await readClient
      .from("transaction_participants")
      .select("transaction_id, role")
      .eq("user_id", user.id);

    const userTxIds = participations?.map((p) => p.transaction_id) || [];

    // Also include transactions created by the user
    const { data: createdTxs } = await readClient
      .from("transactions")
      .select("id")
      .eq("creator_id", user.id);

    const createdTxIds = createdTxs?.map((t) => t.id) || [];
    const allTxIds = Array.from(new Set([...userTxIds, ...createdTxIds]));

    if (allTxIds.length > 0) {
      const { data: rawTransactions } = await readClient
        .from("transactions")
        .select(`
          id,
          title,
          description,
          category,
          status,
          total_amount,
          currency,
          invite_code,
          updated_at,
          creator_id
        `)
        .in("id", allTxIds)
        .order("updated_at", { ascending: false });

      if (rawTransactions) {
        // Fetch all participants for these transactions to display counterpart info
        const { data: allParticipants } = await readClient
          .from("transaction_participants")
          .select(`
            transaction_id,
            user_id,
            role,
            profiles (full_name)
          `)
          .in("transaction_id", allTxIds);

        transactionCards = rawTransactions.map((tx) => {
          const myParticipation = participations?.find(
            (p) => p.transaction_id === tx.id
          );
          const myRole: ParticipantRole | "creator" =
            myParticipation?.role || "creator";

          const txParticipants =
            allParticipants?.filter((p) => p.transaction_id === tx.id) || [];
          const counterpart = txParticipants.find(
            (p) => p.user_id !== user.id
          );

          // Type narrowing for joined profile
          const profileData = counterpart?.profiles as unknown as { full_name: string | null } | null;

          return {
            id: tx.id,
            title: tx.title,
            description: tx.description,
            category: tx.category,
            status: tx.status as TransactionStatus,
            total_amount: Number(tx.total_amount) || 0,
            currency: tx.currency || "INR",
            invite_code: tx.invite_code,
            updated_at: tx.updated_at,
            myRole,
            counterpartName: profileData?.full_name || null,
            counterpartRole: counterpart?.role as ParticipantRole | null,
          };
        });

        transactionCards.sort((a, b) => {
          const score = (item: TransactionCardData) =>
            item.id === ACTIVE_DEMO_WORKSPACE_ID
              ? 2
              : item.invite_code?.toUpperCase() === CANONICAL_DEMO_INVITE_CODE
              ? 1
              : 0;
          return score(b) - score(a);
        });
      }
    }
  }

  const getStatusBadgeVariant = (status: TransactionStatus) => {
    switch (status) {
      case "active":
        return "success";
      case "locked":
        return "assurance";
      case "completed":
        return "info";
      case "disputed":
        return "destructive";
      case "draft":
      default:
        return "warning";
    }
  };

  return (
    <div className="relative space-y-8 pt-2">
      {/* Massive Watermarked Background Display Typography */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none absolute -top-10 left-0 right-0 z-0 overflow-hidden"
      >
        <span className="text-[6rem] sm:text-[9.5rem] lg:text-[12rem] font-black tracking-tighter uppercase text-zinc-900/40 leading-none whitespace-nowrap">
          ASSURED
        </span>
      </div>

      {/* Dashboard Header Banner */}
      <div className="relative z-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 pb-6 border-b border-zinc-800/80">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <Badge variant="assurance" pulse className="text-[11px]">
              Live Assurance Hub
            </Badge>
            <span className="font-mono tracking-tight text-[11px] text-zinc-400">
              {transactionCards.length} ACTIVE WORKSPACES
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-zinc-100 uppercase">
            Transaction Assurance Hub
          </h1>
          <p className="text-sm text-zinc-400 mt-1.5 max-w-2xl">
            Coordinate agreements, monitor milestone releases, and protect custom transactions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <LoadDemoButton variant="secondary" className="text-xs rounded-full px-4" />
          <Link
            href="/transactions/create"
            className="group backdrop-blur-xl bg-zinc-900/90 border border-zinc-700/60 text-zinc-100 rounded-full px-6 py-2.5 text-xs sm:text-sm font-semibold tracking-wide hover:bg-white hover:text-black transition-all duration-300 shadow-2xl active:scale-95 flex items-center gap-2.5"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Create Transaction</span>
            <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
          <Link
            href="/transactions/join"
            className="group backdrop-blur-xl bg-zinc-950/80 border border-zinc-800/80 text-zinc-300 rounded-full px-5 py-2.5 text-xs sm:text-sm font-semibold tracking-wide hover:bg-zinc-800/90 hover:text-white hover:border-zinc-500/50 transition-all duration-300 shadow-xl active:scale-95 flex items-center gap-2"
          >
            <UserPlus className="h-4 w-4" />
            <span>Join via Code</span>
          </Link>
        </div>
      </div>

      {/* 1-Click Judge Quick-Launch Switcher & Quick Join Box */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div className="lg:col-span-2">
          <DemoJudgeSwitcher
            variant="dashboard"
            currentEmail={user?.email ?? null}
          />
        </div>
        <div className="lg:col-span-1 flex flex-col justify-center">
          <QuickJoinCodeBox />
        </div>
      </div>

      {/* Transactions Grid or Empty State */}
      {transactionCards.length > 0 ? (
        <div className="relative z-10 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-emerald-400" />
              <span>Your Transactions</span>
              <span className="font-mono tracking-tight text-sm text-zinc-400">
                ({transactionCards.length})
              </span>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {transactionCards.map((tx) => {
              const isLiveStatus = tx.status === "active" || tx.status === "locked";
              return (
                <Card
                  key={tx.id}
                  glow={isLiveStatus}
                  interactive
                  className="flex flex-col justify-between"
                >
                  <CardHeader className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        variant={getStatusBadgeVariant(tx.status)}
                        pulse={isLiveStatus}
                        className="capitalize"
                      >
                        {tx.status}
                      </Badge>
                      <span className="font-mono tracking-tight text-[11px] font-medium text-zinc-400">
                        #{tx.id.slice(0, 8)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                        {tx.category || "Custom Commerce"}
                      </span>
                      <CardTitle className="text-base font-bold line-clamp-1 text-zinc-100 group-hover:text-emerald-400 transition-colors duration-200">
                        {tx.title}
                      </CardTitle>
                    </div>

                    {tx.description && (
                      <CardDescription className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                        {tx.description}
                      </CardDescription>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-3 pt-1">
                    <div className="flex items-center justify-between text-xs py-2.5 px-3.5 rounded-xl bg-zinc-950/75 border border-zinc-800/80">
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase text-zinc-500 font-semibold tracking-wider">
                          Budget
                        </span>
                        <span className="font-mono tabular-nums tracking-tight font-bold text-zinc-100 text-sm">
                          {tx.currency}{" "}
                          {tx.total_amount.toLocaleString("en-US", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>

                      <div className="flex flex-col text-right">
                        <span className="text-[10px] uppercase text-zinc-500 font-semibold tracking-wider">
                          Invite · Role
                        </span>
                        <span className="text-xs font-semibold capitalize text-zinc-200 flex items-center gap-1.5 justify-end">
                          <span className="font-mono tracking-tight text-emerald-400">
                            {tx.invite_code}
                          </span>
                          <span className="text-zinc-600">·</span>
                          <span>{tx.myRole}</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-zinc-400">
                      <span className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 text-zinc-500" />
                        {tx.counterpartName ? (
                          <span>
                            With <strong className="text-zinc-200">{tx.counterpartName}</strong>
                          </span>
                        ) : (
                          <span className="text-amber-400/90 font-medium">
                            Awaiting Counterpart
                          </span>
                        )}
                      </span>

                      <span
                        suppressHydrationWarning
                        className="flex items-center gap-1 text-[11px] font-mono tracking-tight text-zinc-400"
                      >
                        <Clock className="h-3 w-3 text-zinc-500" />
                        <MountedTimestamp value={tx.updated_at} mode="date" />
                      </span>
                    </div>
                  </CardContent>

                  <CardFooter className="pt-3 border-t border-zinc-800/70">
                    <Link
                      href={`/transactions/${tx.id}`}
                      className="group/cta w-full inline-flex items-center justify-center gap-2 rounded-full bg-zinc-950/90 border border-zinc-700/60 px-5 py-2.5 text-xs font-semibold tracking-wide text-zinc-100 hover:bg-white hover:text-black hover:border-white transition-all duration-300 shadow-lg active:scale-95"
                    >
                      <span>Launch Workspace</span>
                      <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5" />
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        /* Empty State */
        <Card className="relative z-10 border-dashed border-2 border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl py-16 text-center">
          <CardContent className="max-w-md mx-auto space-y-5">
            <div className="h-16 w-16 mx-auto rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_24px_-4px_rgba(16,185,129,0.25)]">
              <Shield className="h-8 w-8 text-emerald-400" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-xl font-black tracking-tight text-zinc-100 uppercase">
                No Transactions Yet
              </h3>
              <p className="text-sm text-zinc-400">
                Start by creating a new custom commerce agreement or join an existing transaction with an invite code.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 pt-2">
              <LoadDemoButton variant="secondary" className="w-full sm:w-auto rounded-full" />
              <Link
                href="/transactions/create"
                className="group w-full sm:w-auto backdrop-blur-xl bg-zinc-900/90 border border-zinc-700/60 text-zinc-100 rounded-full px-6 py-3 text-xs font-semibold tracking-wide hover:bg-white hover:text-black transition-all duration-300 shadow-2xl active:scale-95 flex items-center justify-center gap-2.5"
              >
                <PlusCircle className="h-4 w-4" />
                <span>Create Transaction</span>
                <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
              <Link href="/transactions/join" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto gap-2 rounded-full">
                  <UserPlus className="h-4 w-4" />
                  <span>Join via Invite Code</span>
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

