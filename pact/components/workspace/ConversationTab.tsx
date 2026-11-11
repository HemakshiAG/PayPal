"use client";

import * as React from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
  Button,
  Badge,
} from "@/components/ui";
import { MessageSquare, Send, ShieldCheck } from "lucide-react";
import { ExtractedTermsPanel } from "./ExtractedTermsPanel";
import {
  ChatStream,
  normalizeChatMessage,
  upsertChatMessage,
  type ChatMessage,
} from "./ChatStream";
import { createClient } from "@/lib/supabase/client";
import { ExtractedTerm } from "@/types/term";
import { ParticipantRole } from "@/types/transaction";
import { normalizeTermForClient } from "@/lib/terms/normalize";

export type { ChatMessage };

export interface ConversationTabProps {
  transactionId: string;
  currentUserId: string;
  currentUserRole: ParticipantRole | "observer";
  initialMessages?: ChatMessage[];
  initialTerms?: ExtractedTerm[];
  participants: {
    buyer: { name: string; id: string } | null;
    seller: { name: string; id: string } | null;
  };
  onMessagesUpdated?: (nextMessages: ChatMessage[]) => void;
  onTermsUpdated?: (nextTerms: ExtractedTerm[]) => void;
  onDriftDetected?: (alerts: Array<Record<string, unknown>>) => void;
}

export function ConversationTab({
  transactionId,
  currentUserId,
  currentUserRole,
  initialMessages = [],
  initialTerms = [],
  participants,
  onMessagesUpdated,
  onTermsUpdated,
  onDriftDetected,
}: ConversationTabProps) {
  const supabase = React.useMemo(() => createClient(), []);
  const [messages, setMessages] = React.useState<ChatMessage[]>(initialMessages);
  const [terms, setTerms] = React.useState<ExtractedTerm[]>(() =>
    initialTerms.map((t, idx) => normalizeTermForClient(t, idx))
  );
  const [inputMessage, setInputMessage] = React.useState("");
  const [highlightedMessageId, setHighlightedMessageId] = React.useState<
    string | null
  >(null);

  const messagesRef = React.useRef<ChatMessage[]>(initialMessages);
  const chatChannelRef = React.useRef<RealtimeChannel | null>(null);

  React.useEffect(() => {
    messagesRef.current = messages;
    onMessagesUpdated?.(messages);
  }, [messages, onMessagesUpdated]);

  React.useEffect(() => {
    onTermsUpdated?.(terms);
  }, [terms, onTermsUpdated]);

  const fetchLatestMessages = React.useCallback(async () => {
    try {
      const { data: latestMsgs, error } = await supabase
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
        .eq("transaction_id", transactionId)
        .order("created_at", { ascending: true });

      if (error || !latestMsgs) return;

      const normalizedFetched = latestMsgs.map((row) =>
        normalizeChatMessage(
          row as unknown as Record<string, unknown>,
          transactionId
        )
      );

      setMessages((prev) => {
        let next = [...normalizedFetched];
        for (const pendingTemp of prev.filter((m) => m.id.startsWith("temp-"))) {
          const alreadyPersisted = next.some(
            (persisted) =>
              persisted.sender_id === pendingTemp.sender_id &&
              persisted.content.trim() === pendingTemp.content.trim()
          );
          if (!alreadyPersisted) {
            next = [...next, pendingTemp];
          }
        }
        return next;
      });
    } catch (err) {
      console.error("Error refetching messages:", err);
    }
  }, [supabase, transactionId]);

  const refreshExtractedTerms = React.useCallback(
    async (pushedTerms?: ExtractedTerm[]) => {
      if (Array.isArray(pushedTerms) && pushedTerms.length > 0) {
        setTerms(pushedTerms.map((t, idx) => normalizeTermForClient(t, idx)));
        return;
      }

      try {
        const { data: latestTerms } = await supabase
          .from("extracted_terms")
          .select("*")
          .eq("transaction_id", transactionId)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false });

        if (latestTerms) {
          setTerms(
            latestTerms.map((row, idx) => normalizeTermForClient(row, idx))
          );
        }
      } catch (err) {
        console.error("Error refreshing terms on realtime update:", err);
      }
    },
    [supabase, transactionId]
  );

  // Lightweight cross-tab / window focus refetch so states never drift out of sync
  const syncLatestWorkspaceData = React.useCallback(async () => {
    await Promise.all([fetchLatestMessages(), refreshExtractedTerms()]);
  }, [fetchLatestMessages, refreshExtractedTerms]);

  const triggerBackgroundExtraction = React.useCallback(
    (snapshot: ChatMessage[]) => {
      void fetch("/api/ai/extract-terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          messages: snapshot.map((m) => ({
            id: m.id,
            content: m.content,
            sender_id: m.sender_id,
            created_at: m.created_at,
          })),
        }),
      })
        .then((res) => res.json())
        .then((termsData) => {
          if (Array.isArray(termsData?.terms)) {
            setTerms(
              termsData.terms.map((row: unknown, idx: number) =>
                normalizeTermForClient(row, idx)
              )
            );
          }
        })
        .catch((err) => {
          console.warn("Background AI term extraction skipped:", err);
        });
    },
    [transactionId]
  );

  const triggerBackgroundDriftCheck = React.useCallback(
    (messageId: string, content: string) => {
      void fetch("/api/ai/detect-drift", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactionId,
          messageId,
          content,
        }),
      })
        .then((res) => res.json())
        .then((driftData) => {
          if (Array.isArray(driftData?.alerts) && driftData.alerts.length > 0) {
            onDriftDetected?.(driftData.alerts);
          }
        })
        .catch(() => {});
    },
    [transactionId, onDriftDetected]
  );

  // Optimistic Send + Direct Supabase Insert + Asynchronous Non-Blocking AI Extraction
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = inputMessage.trim();
    if (!content) return;

    setInputMessage("");

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimisticMsg: ChatMessage = {
      id: tempId,
      transaction_id: transactionId,
      sender_id: currentUserId,
      content,
      created_at: new Date().toISOString(),
      profiles: {
        full_name:
          currentUserRole === "buyer"
            ? participants.buyer?.name || "Buyer"
            : participants.seller?.name || "Seller",
        avatar_url: null,
        role: currentUserRole,
      },
    };

    const nextSnapshot = [...messagesRef.current, optimisticMsg];
    setMessages((prev) => [...prev, optimisticMsg]);

    // 1. Insert message immediately into Supabase `messages` table
    let persistedMsg: ChatMessage | null = null;
    try {
      const { data: insertedRow, error: insertError } = await supabase
        .from("messages")
        .insert({
          transaction_id: transactionId,
          sender_id: currentUserId,
          content,
        })
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
        .single();

      if (!insertError && insertedRow) {
        persistedMsg = normalizeChatMessage(
          insertedRow as unknown as Record<string, unknown>,
          transactionId
        );
      } else {
        // Fallback through server API route if direct insert hits RLS/profile edge case
        const res = await fetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionId, content }),
        });
        const data = await res.json();
        if (data?.success && data.message) {
          persistedMsg = normalizeChatMessage(
            data.message as Record<string, unknown>,
            transactionId
          );
          if (Array.isArray(data.driftAlerts) && data.driftAlerts.length > 0) {
            onDriftDetected?.(data.driftAlerts);
          }
        }
      }
    } catch (err) {
      console.error("Failed to insert chat message:", err);
    }

    if (!persistedMsg) return;

    // 2. Reconcile temporary optimistic bubble with confirmed database message cleanly
    const reconciledSnapshot = nextSnapshot.map((m) =>
      m.id === tempId ? persistedMsg : m
    );
    setMessages((prev) => upsertChatMessage(prev, persistedMsg));

    // Emit broadcast mirror over active `chat-room:${transactionId}` channel for zero-lag delivery
    if (chatChannelRef.current) {
      void chatChannelRef.current.send({
        type: "broadcast",
        event: "new_message",
        payload: { message: persistedMsg },
      });
    }

    // 3. Asynchronously trigger Gemini term extraction & drift detection in the background
    triggerBackgroundExtraction(reconciledSnapshot);
    triggerBackgroundDriftCheck(persistedMsg.id, content);
  };

  const handleJumpToMessage = (messageId: string) => {
    setHighlightedMessageId(messageId);
    const element = document.getElementById(`msg-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setTimeout(() => {
      setHighlightedMessageId(null);
    }, 3000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Live Chat Stream (7 cols) */}
      <div className="lg:col-span-7 space-y-4">
        <Card glow className="flex flex-col h-[560px] border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl shadow-xl">
          {/* Header */}
          <CardHeader className="py-3 px-4 border-b border-zinc-800/80 flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-sm font-extrabold text-zinc-100 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-emerald-400" />
                <span>Negotiation Stream</span>
              </CardTitle>
              <CardDescription className="text-[11px] text-zinc-400">
                Discuss scope, milestones, and deliverables. PACT extracts structured terms.
              </CardDescription>
            </div>

            <Badge variant="success" pulse className="text-[10px]">
              <span>Live Realtime</span>
            </Badge>
          </CardHeader>

          {/* Messages Feed (Realtime `chat-room:${transactionId}` + visibilitychange sync) */}
          <ChatStream
            transactionId={transactionId}
            currentUserId={currentUserId}
            messages={messages}
            setMessages={setMessages}
            participants={participants}
            highlightedMessageId={highlightedMessageId}
            onRemoteMessageReceived={() => refreshExtractedTerms()}
            onRemoteTermsChanged={refreshExtractedTerms}
            onVisibilitySync={syncLatestWorkspaceData}
            onChannelReady={(channel) => {
              chatChannelRef.current = channel;
            }}
          />

          {/* Non-blocking Chat Input */}
          <CardFooter className="p-3 border-t border-zinc-800/80 bg-zinc-950/40">
            <form onSubmit={handleSendMessage} className="flex gap-2 w-full">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="Discuss terms (e.g. '20 Custom Hoodies delivered in 14 days for $1,200')..."
                className="flex-1 h-10 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 text-xs text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 transition-all duration-200"
              />
              <Button
                type="submit"
                variant="assurance"
                className="gap-1.5 px-4 h-10"
                disabled={!inputMessage.trim()}
              >
                <Send className="h-3.5 w-3.5" />
                <span>Send</span>
              </Button>
            </form>
          </CardFooter>
        </Card>
      </div>

      {/* Right Column: AI Extracted Terms Review Panel (5 cols) */}
      <div className="lg:col-span-5 space-y-4">
        <ExtractedTermsPanel
          transactionId={transactionId}
          initialTerms={terms}
          messages={messages}
          onTermsUpdated={(nextTerms) => setTerms(nextTerms)}
          onJumpToMessage={handleJumpToMessage}
        />

        {/* Traceable Assurance Notice */}
        <div className="p-3 rounded-xl bg-secondary/50 border border-border/80 flex items-center gap-2.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-assurance shrink-0" />
          <span>
            <strong>Rule 8 Invariant:</strong> Every extracted term retains the exact source message ID where it was negotiated.
          </span>
        </div>
      </div>
    </div>
  );
}
