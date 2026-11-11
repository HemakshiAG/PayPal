"use client";

import * as React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
} from "@/components/ui";
import {
  Sparkles,
  Check,
  X,
  FileText,
  DollarSign,
  Calendar,
  AlertCircle,
  Clock,
  Layers,
  RefreshCw,
} from "lucide-react";
import { ExtractedTerm, TermCategory, TermClassification, TermStatus } from "@/types/term";
import {
  normalizeConfidencePercent,
  normalizeTermCategory,
  normalizeTermForClient,
  normalizeTermStatus,
} from "@/lib/terms/normalize";

export interface ExtractedTermsPanelProps {
  transactionId: string;
  initialTerms?: ExtractedTerm[];
  messages?: Array<{
    id?: string;
    content?: string;
    sender_id?: string;
    created_at?: string;
  }>;
  onTermsUpdated?: (nextTerms: ExtractedTerm[]) => void;
  onTermStatusChange?: (termId: string, newStatus: TermStatus) => void;
  onJumpToMessage?: (messageId: string) => void;
}

export function ExtractedTermsPanel({
  transactionId,
  initialTerms = [],
  messages = [],
  onTermsUpdated,
  onTermStatusChange,
  onJumpToMessage,
}: ExtractedTermsPanelProps) {
  const [localTerms, setLocalTerms] = React.useState<ExtractedTerm[] | null>(null);
  const terms = React.useMemo(
    () => (localTerms ?? initialTerms).map((t, index) => normalizeTermForClient(t, index)),
    [localTerms, initialTerms]
  );
  const [isExtracting, setIsExtracting] = React.useState(false);
  const [updatingTermId, setUpdatingTermId] = React.useState<string | null>(null);
  const [activeCategory, setActiveCategory] = React.useState<TermCategory | "all">("all");

  const commitTermsState = React.useCallback(
    (nextTerms: ExtractedTerm[]) => {
      const normalized = nextTerms.map((t, index) =>
        normalizeTermForClient(t, index)
      );
      if (onTermsUpdated) {
        onTermsUpdated(normalized);
        setLocalTerms(null);
      } else {
        setLocalTerms(normalized);
      }
    },
    [onTermsUpdated]
  );

  // Run manual re-scan passing full negotiation chat messages to overwrite stale/invalid state
  const handleRunExtraction = async () => {
    setIsExtracting(true);
    try {
      const res = await fetch("/api/ai/extract-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          messages: messages.map((m) => ({
            id: m.id,
            content: m.content,
            sender_id: m.sender_id,
            created_at: m.created_at,
          })),
        }),
      });
      const data = await res.json();
      if (Array.isArray(data.terms)) {
        commitTermsState(data.terms);
      }
    } catch (err) {
      console.error("Failed to extract terms:", err);
    } finally {
      setIsExtracting(false);
    }
  };

  // Confirm or reject a term
  const handleUpdateStatus = async (termId: string, status: "confirmed" | "rejected") => {
    setUpdatingTermId(termId);
    try {
      const res = await fetch("/api/terms/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termId, status }),
      });
      const data = await res.json();
      if (data.success && data.term) {
        const nextStatus = normalizeTermStatus(data.term.status);
        commitTermsState(
          terms.map((t) => (t.id === termId ? { ...t, status: nextStatus } : t))
        );
        onTermStatusChange?.(termId, status);
      }
    } catch (err) {
      console.error("Failed to update term status:", err);
    } finally {
      setUpdatingTermId(null);
    }
  };

  const getCategoryIcon = (category: TermCategory) => {
    switch (category) {
      case "financial":
        return <DollarSign className="h-4 w-4 text-emerald-400" />;
      case "timeline":
        return <Calendar className="h-4 w-4 text-sky-400" />;
      case "specification":
        return <FileText className="h-4 w-4 text-violet-400" />;
      case "condition":
      default:
        return <AlertCircle className="h-4 w-4 text-amber-400" />;
    }
  };

  const getClassificationBadge = (classification: TermClassification) => {
    switch (classification) {
      case "explicitly_agreed":
        return (
          <Badge suppressHydrationWarning variant="success" className="text-[10px] py-0 px-2">
            Explicitly Agreed
          </Badge>
        );
      case "inferred":
        return (
          <Badge suppressHydrationWarning variant="warning" className="text-[10px] py-0 px-2">
            Inferred
          </Badge>
        );
      case "ai_recommended":
        return (
          <Badge suppressHydrationWarning variant="info" className="text-[10px] py-0 px-2">
            AI Recommended
          </Badge>
        );
      case "disputed":
        return (
          <Badge suppressHydrationWarning variant="destructive" className="text-[10px] py-0 px-2">
            Disputed
          </Badge>
        );
      case "unresolved":
      default:
        return (
          <Badge suppressHydrationWarning variant="secondary" className="text-[10px] py-0 px-2">
            Unresolved
          </Badge>
        );
    }
  };

  const filteredTerms =
    activeCategory === "all"
      ? terms
      : terms.filter((t) => normalizeTermCategory(t.category) === activeCategory);

  const pendingCount = terms.filter((t) => normalizeTermStatus(t.status) === "pending").length;
  const revisedCount = terms.filter((t) => normalizeTermStatus(t.status) === "revised").length;
  const confirmedCount = terms.filter((t) => normalizeTermStatus(t.status) === "confirmed").length;

  return (
    <Card glow className="flex flex-col h-[560px] border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl shadow-xl">
      {/* Header */}
      <CardHeader className="py-3 px-4 border-b border-zinc-800/80 flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-sm font-extrabold text-zinc-100 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <span>AI Extracted Terms</span>
          </CardTitle>
          <CardDescription className="text-[11px] font-mono tracking-tight text-zinc-400">
            {pendingCount} pending{revisedCount > 0 ? ` • ${revisedCount} revised` : ""} • {confirmedCount} confirmed
          </CardDescription>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={handleRunExtraction}
          isLoading={isExtracting}
          className="h-8 gap-1.5 text-xs cursor-pointer"
        >
          {!isExtracting && <RefreshCw className="h-3 w-3" />}
          <span>Scan Chat</span>
        </Button>
      </CardHeader>

      {/* Category Filter Chips */}
      <div className="px-4 py-2 border-b border-zinc-800/80 flex items-center gap-1.5 overflow-x-auto text-[11px] scrollbar-none bg-zinc-950/50">
        {[
          { id: "all", label: "All" },
          { id: "specification", label: "Specifications" },
          { id: "financial", label: "Financial" },
          { id: "timeline", label: "Timeline" },
          { id: "condition", label: "Conditions" },
        ].map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id as TermCategory | "all")}
            className={`px-2.5 py-1 rounded-lg font-semibold whitespace-nowrap transition-all duration-200 active:scale-95 cursor-pointer ${
              activeCategory === cat.id
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : "text-zinc-400 border border-transparent hover:bg-zinc-800/60 hover:text-zinc-100"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Terms Feed */}
      <CardContent className="flex-1 p-3 overflow-y-auto space-y-3">
        {filteredTerms.length > 0 ? (
          filteredTerms.map((term) => {
            const isUpdating = updatingTermId === term.id;
            const termStatus = normalizeTermStatus(term.status);
            const displayTitle =
              term.title || term.name || term.termKey || term.term_key || "Specification";
            const displayValue =
              term.term_value || term.value || term.details || term.termValue || "Not specified";
            const confidencePct = Math.round(
              normalizeConfidencePercent(
                term.confidence_score ?? term.confidence ?? term.confidenceScore,
                90
              )
            );
            return (
              <div
                key={term.id}
                className={`p-3.5 rounded-xl border transition-all duration-200 text-xs space-y-2 backdrop-blur-sm ${
                  termStatus === "confirmed"
                    ? "bg-emerald-500/5 border-emerald-500/25"
                    : termStatus === "rejected"
                    ? "bg-rose-500/5 border-rose-500/20 opacity-60"
                    : termStatus === "revised"
                    ? "bg-amber-500/5 border-amber-500/35 hover:border-amber-400/50"
                    : "bg-zinc-950/60 border-zinc-800/80 hover:border-emerald-500/35"
                }`}
              >
                {/* Term Top Row: Category + Classification + Confidence */}
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    {getCategoryIcon(normalizeTermCategory(term.category))}
                    <span className="font-bold text-zinc-100">{displayTitle}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {termStatus === "revised" && (
                      <Badge
                        suppressHydrationWarning
                        variant="warning"
                        className="text-[10px] py-0 px-2 gap-1"
                      >
                        <RefreshCw className="h-2.5 w-2.5" /> REVISED
                      </Badge>
                    )}
                    {getClassificationBadge(term.classification)}
                    <span
                      suppressHydrationWarning
                      className="text-[10px] font-mono tabular-nums tracking-tight text-zinc-400"
                      title="Extraction confidence score"
                    >
                      {confidencePct}%
                    </span>
                  </div>
                </div>

                {/* Term Value Description */}
                <p className="text-zinc-200 text-xs leading-relaxed pl-5 font-medium">
                  {displayValue}
                </p>

                {/* Footer with Source Message Link & Confirmation Buttons */}
                <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800/60 pl-5 text-[10px]">
                  <div>
                    {term.sourceMessageIds && term.sourceMessageIds.length > 0 ? (
                      <button
                        onClick={() => onJumpToMessage?.(term.sourceMessageIds[0])}
                        className="inline-flex items-center gap-1 text-zinc-400 hover:text-emerald-400 transition-all duration-200 active:scale-95 cursor-pointer"
                        title="Jump to source message in chat"
                      >
                        <Clock className="h-3 w-3" />
                        <span>
                          {term.source_quote ? `Quote: "${term.source_quote}"` : "Source Quote Cited"}
                        </span>
                      </button>
                    ) : (
                      <span className="text-zinc-500 italic">
                        {term.source_quote ? `Quote: "${term.source_quote}"` : "Inferred from context"}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5">
                    {termStatus === "confirmed" ? (
                      <Badge suppressHydrationWarning variant="success" className="text-[10px] py-0 px-2 gap-1">
                        <Check className="h-3 w-3" /> Confirmed
                      </Badge>
                    ) : termStatus === "rejected" ? (
                      <Badge suppressHydrationWarning variant="destructive" className="text-[10px] py-0 px-2 gap-1">
                        <X className="h-3 w-3" /> Rejected
                      </Badge>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(term.id, "rejected")}
                          className="h-7 w-7 p-0 text-rose-400 hover:bg-rose-500/15 hover:border-rose-500/30 cursor-pointer"
                          title="Reject Term"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="assurance"
                          disabled={isUpdating}
                          onClick={() => handleUpdateStatus(term.id, "confirmed")}
                          className="h-7 px-2.5 text-xs gap-1 cursor-pointer"
                          title="Confirm Term for Agreement"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Confirm</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-16 px-4 space-y-2 border border-dashed border-zinc-800 rounded-xl my-4">
            <Layers className="h-8 w-8 text-zinc-500 mx-auto opacity-50" />
            <p className="text-xs font-semibold text-zinc-200">No extracted terms yet</p>
            <p className="text-[11px] text-zinc-400 max-w-xs mx-auto">
              Discuss project deliverables, pricing, and timelines in the chat. PACT will automatically parse and classify commitments here.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRunExtraction}
              isLoading={isExtracting}
              className="mt-2 text-xs h-8"
            >
              <span>Scan Messages Now</span>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
