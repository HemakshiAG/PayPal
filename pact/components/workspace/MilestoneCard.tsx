"use client";
import * as React from "react";
import { PaymentMilestone, MilestoneStatus } from "@/types/payment";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MountedTimestamp } from "@/components/ui/mounted-timestamp";
import { PayPalCheckoutButton } from "./PayPalCheckoutButton";
import {
  CheckCircle2,
  Clock,
  Hourglass,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  Lock,
} from "lucide-react";

interface MilestoneCardProps {
  milestone: PaymentMilestone;
  currentUserRole: "buyer" | "seller" | "observer";
  isAgreementActive: boolean;
  isVisualProofVerified?: boolean;
  onPaymentCompleted: (payload: {
    milestoneId: string;
    orderId: string;
    captureId: string;
    isSimulated: boolean;
  }) => void;
  onPaymentError?: (message: string) => void;
}

export function MilestoneCard({
  milestone,
  currentUserRole,
  isAgreementActive,
  isVisualProofVerified = false,
  onPaymentCompleted,
  onPaymentError,
}: MilestoneCardProps) {
  if (!milestone) {
    return null;
  }

  const safeCurrency = (milestone?.currency || "USD").toUpperCase();
  const currencySymbol = safeCurrency === "INR" ? "₹" : "$";
  const safeAmount = Number.isFinite(Number(milestone?.amount))
    ? Number(milestone.amount)
    : 0;
  const safeStatus = String(
    milestone?.status || "pending"
  ).toLowerCase() as MilestoneStatus;

  const getStatusBadge = (status: MilestoneStatus) => {
    switch (status) {
      case "paid":
        return (
          <Badge variant="success" className="text-[11px] font-bold gap-1">
            <CheckCircle2 className="h-3 w-3" />
            <span>Paid & Verified</span>
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="warning" pulse className="text-[11px] font-bold gap-1">
            <Hourglass className="h-3 w-3 animate-spin" />
            <span>Processing</span>
          </Badge>
        );
      case "disputed":
        return (
          <Badge variant="destructive" className="text-[11px] font-bold gap-1">
            <AlertTriangle className="h-3 w-3" />
            <span>Disputed</span>
          </Badge>
        );
      case "refunded":
        return (
          <Badge variant="secondary" className="text-[11px] font-bold">
            Refunded
          </Badge>
        );
      case "pending":
      default:
        return (
          <Badge variant="outline" className="text-[11px] font-semibold gap-1">
            <Clock className="h-3 w-3" />
            <span>Pending Payment</span>
          </Badge>
        );
    }
  };

  const canPay =
    currentUserRole === "buyer" &&
    isAgreementActive &&
    (safeStatus === "pending" || safeStatus === "processing");

  return (
    <Card
      glow={safeStatus === "paid"}
      className={`border backdrop-blur-md transition-all duration-200 ${
        safeStatus === "paid"
          ? "border-emerald-500/35 bg-emerald-500/10"
          : "border-zinc-800/80 bg-zinc-900/60 hover:border-emerald-500/35"
      }`}
    >
      <CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Info & Schedule */}
        <div className="space-y-2 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono tabular-nums tracking-tight font-bold text-xs">
              #{milestone?.sequenceOrder || 1}
            </span>
            <h3 className="text-sm font-bold text-zinc-100">
              {milestone?.title || "Escrow Milestone"}
            </h3>
            {getStatusBadge(safeStatus)}
          </div>

          {milestone?.description && (
            <p className="text-xs text-zinc-400 leading-relaxed max-w-2xl">
              {milestone.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4 pt-1 text-[11px] text-zinc-400">
            {milestone?.dueDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-zinc-500" />
                Target Due:{" "}
                <strong
                  suppressHydrationWarning
                  className="font-mono tabular-nums tracking-tight text-zinc-200"
                >
                  <MountedTimestamp value={milestone.dueDate} mode="date" />
                </strong>
              </span>
            )}

            {safeStatus === "paid" && milestone?.latestPaymentRecord && (
              <span className="flex items-center gap-1 text-emerald-400 font-mono tracking-tight text-[10px]">
                <ShieldCheck className="h-3.5 w-3.5" />
                Capture ID:{" "}
                {milestone.latestPaymentRecord.paypalCaptureId ||
                  milestone.latestPaymentRecord.paypalOrderId ||
                  "CAPTURED"}
              </span>
            )}
          </div>
        </div>

        {/* Right: Amount & PayPal Action */}
        <div className="flex flex-col sm:items-end justify-center gap-2 shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-zinc-800/80">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black font-mono tabular-nums tracking-tight text-zinc-100">
              {currencySymbol}
              {safeAmount.toFixed(2)}
            </span>
            <span className="text-xs font-mono tracking-tight font-semibold text-zinc-400">
              {safeCurrency}
            </span>
          </div>

          {canPay && (
            <div className="flex flex-col sm:items-end gap-1.5 w-full sm:w-auto">
              <PayPalCheckoutButton
                milestoneId={milestone.id}
                transactionId={milestone.transactionId}
                amount={safeAmount}
                currency={safeCurrency}
                disabled={!isVisualProofVerified}
                onPaymentCompleted={onPaymentCompleted}
                onPaymentError={onPaymentError}
              />
              {!isVisualProofVerified && (
                <span className="text-[11px] text-amber-400 flex items-center gap-1 font-medium">
                  <Lock className="h-3 w-3" />
                  Awaiting Gemini Vision Proof-of-Delivery
                </span>
              )}
            </div>
          )}

          {!isAgreementActive && safeStatus !== "paid" && (
            <span className="text-[11px] text-amber-400 flex items-center gap-1 font-medium">
              <Lock className="h-3 w-3" />
              Requires Active Mutual Agreement
            </span>
          )}

          {currentUserRole === "seller" &&
            safeStatus === "pending" &&
            isAgreementActive && (
              <span className="text-[11px] text-zinc-400 italic">
                Awaiting Buyer PayPal disbursement
              </span>
            )}
        </div>
      </CardContent>
    </Card>
  );
}
