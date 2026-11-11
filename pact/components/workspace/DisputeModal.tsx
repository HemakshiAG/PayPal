"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MountedTimestamp } from "@/components/ui/mounted-timestamp";
import {
  Scale,
  FileCheck,
  CreditCard,
  MessageSquare,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { AgreementVersion } from "@/types/agreement";
import { PaymentMilestone, PaymentRecord } from "@/types/payment";
import {
  DriftAlert,
  LedgerIntegrityReport,
  TransactionEvent,
} from "@/types/vault";
import { ChatMessage } from "./ConversationTab";

interface DisputeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: {
    id: string;
    title: string;
    status: string;
    totalAmount: number;
    currency: string;
    createdAt: string;
  };
  participants: {
    buyer: { id: string; name: string } | null;
    seller: { id: string; name: string } | null;
  };
  activeAgreementVersion: AgreementVersion | null;
  messages: ChatMessage[];
  milestones: PaymentMilestone[];
  paymentRecords: PaymentRecord[];
  events: TransactionEvent[];
  driftAlerts: DriftAlert[];
  integrityReport: LedgerIntegrityReport | null;
}

type DisputeViewSection = "agreement" | "payments" | "messages" | "events";

export function DisputeModal({
  open,
  onOpenChange,
  transaction,
  participants,
  activeAgreementVersion,
  messages,
  milestones,
  paymentRecords,
  events,
  driftAlerts,
  integrityReport,
}: DisputeModalProps) {
  const [section, setSection] = React.useState<DisputeViewSection>("agreement");
  const currencySymbol = transaction.currency === "INR" ? "₹" : "$";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="gap-1 text-[11px] font-bold">
              <Scale className="h-3 w-3" />
              Dispute Intelligence Reconstruction
            </Badge>
            {integrityReport && (
              <Badge
                variant={integrityReport.is_valid ? "success" : "destructive"}
                className="text-[10px] font-bold"
              >
                {integrityReport.is_valid
                  ? `Chain Verified (${integrityReport.total_events} Events)`
                  : "Chain Integrity Warning"}
              </Badge>
            )}
          </div>
          <DialogTitle className="text-xl font-black">
            Neutral Evidence & Chronology Reconstruction
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            PACT neutrally compiles confirmed agreement terms, verified PayPal records,
            timestamped chat history, and cryptographic ledger hashes for review without
            assigning legal fault or ruling on validity.
          </DialogDescription>
        </DialogHeader>

        {/* Neutrality Notice */}
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-start gap-2.5 mb-4">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
          <span>
            <strong>Informational Audit Only:</strong> This reconstruction aggregates
            verbatim transaction records and SHA-256 digests so both parties or an
            independent mediator can evaluate facts objectively.
          </span>
        </div>

        {/* Section Switcher */}
        <div className="flex flex-wrap gap-2 pb-3 border-b border-zinc-800/80 mb-4">
          <Button
            type="button"
            size="sm"
            variant={section === "agreement" ? "default" : "outline"}
            onClick={() => setSection("agreement")}
            className="text-xs gap-1.5 cursor-pointer transition-all duration-200 active:scale-95"
          >
            <FileCheck className="h-3.5 w-3.5" />
            Contract Terms
          </Button>
          <Button
            type="button"
            size="sm"
            variant={section === "payments" ? "default" : "outline"}
            onClick={() => setSection("payments")}
            className="text-xs gap-1.5 cursor-pointer transition-all duration-200 active:scale-95"
          >
            <CreditCard className="h-3.5 w-3.5" />
            <span>
              Payments (<span className="font-mono tabular-nums tracking-tight">{paymentRecords.length}</span>)
            </span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={section === "messages" ? "default" : "outline"}
            onClick={() => setSection("messages")}
            className="text-xs gap-1.5 cursor-pointer transition-all duration-200 active:scale-95"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>
              Messages (<span className="font-mono tabular-nums tracking-tight">{messages.length}</span>)
            </span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant={section === "events" ? "default" : "outline"}
            onClick={() => setSection("events")}
            className="text-xs gap-1.5 cursor-pointer transition-all duration-200 active:scale-95"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>
              Audit Chain (<span className="font-mono tabular-nums tracking-tight">{events.length}</span>)
            </span>
          </Button>
        </div>

        {/* Content Areas */}
        <div className="space-y-4 min-h-[260px] text-xs">
          {section === "agreement" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/65">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">
                    Parties
                  </span>
                  <p className="font-semibold text-zinc-100 mt-1">
                    Buyer: {participants.buyer?.name || "Unassigned"}
                  </p>
                  <p className="font-semibold text-zinc-100">
                    Seller: {participants.seller?.name || "Unassigned"}
                  </p>
                </div>
                <div className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/65">
                  <span className="text-[10px] font-bold uppercase text-zinc-400">
                    Active Locked Baseline
                  </span>
                  {activeAgreementVersion ? (
                    <div className="mt-1 space-y-1">
                      <p className="font-bold text-zinc-100 font-mono tracking-tight">
                        Version V{activeAgreementVersion.versionNumber} (
                        {activeAgreementVersion.status.toUpperCase()})
                      </p>
                      <p className="font-mono tracking-tight text-[10px] text-zinc-400 break-all">
                        SHA-256: {activeAgreementVersion.contentHash}
                      </p>
                    </div>
                  ) : (
                    <p className="text-zinc-400 mt-1">
                      No mutually locked agreement version recorded yet.
                    </p>
                  )}
                </div>
              </div>

              {driftAlerts.length > 0 && (
                <div className="p-3 rounded-xl border border-amber-500/25 bg-amber-500/10 space-y-2">
                  <h4 className="font-bold text-zinc-100">
                    Recorded Off-Contract Drift Alerts (
                    <span className="font-mono tabular-nums tracking-tight">{driftAlerts.length}</span>)
                  </h4>
                  {driftAlerts.map((d) => (
                    <div
                      key={d.id}
                      className="p-2 rounded-lg bg-zinc-950/80 border border-zinc-800/80 text-[11px] flex flex-col gap-1"
                    >
                      <div className="flex items-center justify-between">
                        <strong className="text-zinc-100">{d.termKey}</strong>
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {d.status}
                        </Badge>
                      </div>
                      <span className="text-zinc-400">
                        Contracted Baseline: {d.originalValue}
                      </span>
                      <span className="text-zinc-200">
                        Chat Proposal: {d.proposedValue}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {activeAgreementVersion && (
                <div className="space-y-2">
                  <h4 className="font-bold text-zinc-100">
                    Confirmed Agreement Sections (
                    <span className="font-mono tabular-nums tracking-tight">
                      {activeAgreementVersion.sections.length}
                    </span>)
                  </h4>
                  <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                    {activeAgreementVersion.sections.map((sec, idx) => (
                      <div
                        key={sec.sectionId}
                        className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/65"
                      >
                        <div className="font-bold text-zinc-100 mb-1">
                          <span className="font-mono tracking-tight mr-1">{idx + 1}.</span>
                          {sec.title}
                        </div>
                        <ul className="space-y-1 text-[11px] text-zinc-400 list-disc pl-4">
                          {sec.items.map((item, iIdx) => (
                            <li key={iIdx}>{item.content}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {section === "payments" && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/65 flex items-center justify-between">
                <span className="text-zinc-300">Total Contract Value</span>
                <strong className="text-sm font-mono tabular-nums tracking-tight text-zinc-100">
                  {currencySymbol}
                  {transaction.totalAmount.toLocaleString("en-US")} {transaction.currency}
                </strong>
              </div>

              {milestones.length > 0 ? (
                <div className="space-y-2">
                  {milestones.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/65 flex items-center justify-between gap-2"
                    >
                      <div>
                        <div className="font-bold text-zinc-100">
                          <span className="font-mono tracking-tight mr-1">#{m.sequenceOrder}</span>
                          {m.title}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          Status: {m.status.toUpperCase()}
                        </div>
                      </div>
                      <div className="text-right font-bold font-mono tabular-nums tracking-tight text-zinc-100">
                        {currencySymbol}
                        {Number(m.amount).toLocaleString("en-US")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-zinc-400">No milestones recorded.</p>
              )}

              {paymentRecords.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h4 className="font-bold text-zinc-100">
                    PayPal Verification Records
                  </h4>
                  {paymentRecords.map((rec) => (
                    <div
                      key={rec.id}
                      className="p-2.5 rounded-xl border border-zinc-800/80 bg-zinc-950/65 font-mono tabular-nums tracking-tight text-[10px] space-y-0.5 text-zinc-200"
                    >
                      <div>
                        Order: {rec.paypalOrderId} | Capture:{" "}
                        {rec.paypalCaptureId || "Pending"}
                      </div>
                      <div suppressHydrationWarning className="text-zinc-400">
                        Amount: {currencySymbol}
                        {Number(rec.amount).toLocaleString("en-US")} {rec.currency} | Status: {rec.status} |{" "}
                        <MountedTimestamp value={rec.createdAt} mode="datetime" />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {section === "messages" && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {messages.length > 0 ? (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/65 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[11px]">
                      <strong className="text-zinc-100">
                        {msg.profiles?.full_name || "Participant"} (
                        {msg.profiles?.role || "member"})
                      </strong>
                      <MountedTimestamp
                        value={msg.created_at}
                        mode="datetime"
                        className="font-mono tabular-nums tracking-tight text-zinc-400"
                      />
                    </div>
                    <p className="text-zinc-200 leading-relaxed">{msg.content}</p>
                    <span className="text-[10px] font-mono tracking-tight text-zinc-500">
                      Message ID: {msg.id}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-zinc-400">No chat messages logged.</p>
              )}
            </div>
          )}

          {section === "events" && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {events.length > 0 ? (
                events.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3 rounded-xl border border-zinc-800/80 bg-zinc-950/65 space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="font-mono tracking-tight text-[10px]">
                        {ev.eventType}
                      </Badge>
                      <MountedTimestamp
                        value={ev.timestamp}
                        mode="datetime"
                        className="font-mono tabular-nums tracking-tight text-[10px] text-zinc-400"
                      />
                    </div>
                    <div className="font-mono tracking-tight text-[10px] text-zinc-400 break-all">
                      Hash: {ev.eventHash}
                    </div>
                    <div className="font-mono tracking-tight text-[10px] text-zinc-500 break-all">
                      Prev: {ev.previousEventHash}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-zinc-400">
                  No hash-chained events logged in ledger yet.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer transition-all duration-200 active:scale-95"
          >
            Close Reconstruction
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

