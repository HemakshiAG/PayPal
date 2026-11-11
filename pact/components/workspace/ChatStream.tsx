"use client";

import * as React from "react";
import { Badge, CardContent, MountedTimestamp } from "@/components/ui";
import { MessageSquare, Sparkles, User } from "lucide-react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { ParticipantRole } from "@/types/transaction";
import { ExtractedTerm } from "@/types/term";
import { normalizeTermForClient } from "@/lib/terms/normalize";

export interface ChatMessage {
  id: string;
  transaction_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  profiles?: {
    full_name: string | null;
    avatar_url: string | null;
    role: string | null;
  } | null;
}

export interface ChatParticipants {
  buyer: { name: string; id: string } | null;
  seller: { name: string; id: string } | null;
}

export interface ChatStreamProps {
  transactionId: string;
  currentUserId: string;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  participants: ChatParticipants;
  highlightedMessageId?: string | null;
  onRemoteMessageReceived?: (message: ChatMessage) => void | Promise<void>;
  onRemoteTermsChanged?: (terms?: ExtractedTerm[]) => void | Promise<void>;
  onVisibilitySync?: () => void | Promise<void>;
  onChannelReady?: (channel: RealtimeChannel | null) => void;
  onRealtimeStatusChange?: (status: string) => void;
}

export function normalizeChatMessage(
  raw: Record<string, unknown>,
  fallbackTransactionId?: string
): ChatMessage {
  const rawProfile =
    raw.profiles && typeof raw.profiles === "object"
      ? (raw.profiles as Record<string, unknown>)
      : null;

  return {
    id: String(raw.id ?? ""),
    transaction_id: String(raw.transaction_id ?? fallbackTransactionId ?? ""),
    sender_id: String(raw.sender_id ?? ""),
    content: String(raw.content ?? raw.message_text ?? ""),
    created_at: String(
      raw.created_at ?? raw.sent_at ?? new Date().toISOString()
    ),
    profiles: rawProfile
      ? {
          full_name:
            typeof rawProfile.full_name === "string"
              ? rawProfile.full_name
              : null,
          avatar_url:
            typeof rawProfile.avatar_url === "string"
              ? rawProfile.avatar_url
              : null,
          role: typeof rawProfile.role === "string" ? rawProfile.role : null,
        }
      : null,
  };
}

export function upsertChatMessage(
  prev: ChatMessage[],
  incoming: ChatMessage
): ChatMessage[] {
  if (!incoming.id) return prev;

  const existingIndex = prev.findIndex((m) => m.id === incoming.id);
  if (existingIndex >= 0) {
    const existing = prev[existingIndex];
    const mergedProfiles = incoming.profiles || existing.profiles || null;
    if (
      existing.content === incoming.content &&
      existing.profiles === mergedProfiles
    ) {
      return prev;
    }
    const copy = [...prev];
    copy[existingIndex] = { ...existing, ...incoming, profiles: mergedProfiles };
    return copy;
  }

  // Reconcile optimistic `temp-*` entry from the same sender and text before appending
  const tempIndex = prev.findIndex(
    (m) =>
      m.id.startsWith("temp-") &&
      m.sender_id === incoming.sender_id &&
      m.content.trim() === incoming.content.trim()
  );

  if (tempIndex >= 0) {
    const temp = prev[tempIndex];
    const copy = [...prev];
    copy[tempIndex] = {
      ...incoming,
      profiles: incoming.profiles || temp.profiles || null,
    };
    return copy;
  }

  return [...prev, incoming];
}

export function ChatStream({
  transactionId,
  currentUserId,
  messages,
  setMessages,
  participants,
  highlightedMessageId = null,
  onRemoteMessageReceived,
  onRemoteTermsChanged,
  onVisibilitySync,
  onChannelReady,
  onRealtimeStatusChange,
}: ChatStreamProps) {
  const supabase = React.useMemo(() => createClient(), []);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const latestRef = React.useRef({
    currentUserId,
    participants,
    setMessages,
    onRemoteMessageReceived,
    onRemoteTermsChanged,
    onVisibilitySync,
    onChannelReady,
    onRealtimeStatusChange,
  });

  React.useEffect(() => {
    latestRef.current = {
      currentUserId,
      participants,
      setMessages,
      onRemoteMessageReceived,
      onRemoteTermsChanged,
      onVisibilitySync,
      onChannelReady,
      onRealtimeStatusChange,
    };
  }, [
    currentUserId,
    participants,
    setMessages,
    onRemoteMessageReceived,
    onRemoteTermsChanged,
    onVisibilitySync,
    onChannelReady,
    onRealtimeStatusChange,
  ]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // 1. Bulletproof Realtime subscription on global room `chat-room:${transactionId}`
  React.useEffect(() => {
    if (!transactionId) return;

    const handleIncomingMessage = (rawPayload: unknown) => {
      if (!rawPayload || typeof rawPayload !== "object") return;
      const normalized = normalizeChatMessage(
        rawPayload as Record<string, unknown>,
        transactionId
      );
      if (!normalized.id || !normalized.content) return;

      const {
        currentUserId: activeUserId,
        participants: activeParticipants,
        setMessages: updateMessages,
        onRemoteMessageReceived: notifyRemote,
      } = latestRef.current;

      if (!normalized.profiles) {
        if (
          activeParticipants.buyer &&
          normalized.sender_id === activeParticipants.buyer.id
        ) {
          normalized.profiles = {
            full_name: activeParticipants.buyer.name,
            avatar_url: null,
            role: "buyer",
          };
        } else if (
          activeParticipants.seller &&
          normalized.sender_id === activeParticipants.seller.id
        ) {
          normalized.profiles = {
            full_name: activeParticipants.seller.name,
            avatar_url: null,
            role: "seller",
          };
        }
      }

      updateMessages((prev) => {
        if (prev.some((m) => m.id === normalized.id)) return prev;
        return upsertChatMessage(prev, normalized);
      });

      if (!normalized.profiles && normalized.sender_id) {
        void supabase
          .from("profiles")
          .select("full_name, avatar_url, role")
          .eq("id", normalized.sender_id)
          .maybeSingle()
          .then(({ data: profile }) => {
            if (!profile) return;
            latestRef.current.setMessages((prev) =>
              prev.map((m) =>
                m.id === normalized.id && !m.profiles
                  ? { ...m, profiles: profile }
                  : m
              )
            );
          });
      }

      if (normalized.sender_id !== activeUserId) {
        void notifyRemote?.(normalized);
      }
    };

    const channel = supabase
      .channel(`chat-room:${transactionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `transaction_id=eq.${transactionId}`,
        },
        (payload) => {
          handleIncomingMessage(payload.new);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "extracted_terms",
          filter: `transaction_id=eq.${transactionId}`,
        },
        () => {
          void latestRef.current.onRemoteTermsChanged?.();
        }
      )
      .on("broadcast", { event: "new_message" }, (envelope) => {
        const payloadObj =
          envelope && typeof envelope === "object"
            ? (envelope as { payload?: unknown }).payload
            : undefined;
        const messageRecord =
          payloadObj &&
          typeof payloadObj === "object" &&
          "message" in payloadObj
            ? (payloadObj as { message?: unknown }).message
            : payloadObj;
        handleIncomingMessage(messageRecord);
      })
      .on("broadcast", { event: "terms_updated" }, (envelope) => {
        const payloadObj =
          envelope && typeof envelope === "object"
            ? (envelope as { payload?: unknown }).payload
            : undefined;
        const rawTerms =
          payloadObj &&
          typeof payloadObj === "object" &&
          "terms" in payloadObj &&
          Array.isArray((payloadObj as { terms?: unknown[] }).terms)
            ? (payloadObj as { terms: unknown[] }).terms
            : null;
        if (rawTerms) {
          const normalized = rawTerms.map((row, idx) =>
            normalizeTermForClient(row, idx)
          );
          void latestRef.current.onRemoteTermsChanged?.(normalized);
        } else {
          void latestRef.current.onRemoteTermsChanged?.();
        }
      })
      .subscribe((status) => {
        latestRef.current.onRealtimeStatusChange?.(status);
      });

    latestRef.current.onChannelReady?.(channel);

    return () => {
      latestRef.current.onChannelReady?.(null);
      void supabase.removeChannel(channel);
    };
  }, [transactionId, supabase]);

  // 3. Cross-Tab Window Focus Refresh fallback (`visibilitychange` & `focus`)
  React.useEffect(() => {
    if (!transactionId) return;

    let lastSyncTimestamp = 0;

    const triggerSync = () => {
      const now = Date.now();
      if (now - lastSyncTimestamp < 1000) return;
      lastSyncTimestamp = now;
      void latestRef.current.onVisibilitySync?.();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerSync();
      }
    };

    const handleWindowFocus = () => {
      triggerSync();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [transactionId]);

  const resolveSenderRole = (msg: ChatMessage): ParticipantRole => {
    if (participants.buyer && msg.sender_id === participants.buyer.id) {
      return "buyer";
    }
    if (participants.seller && msg.sender_id === participants.seller.id) {
      return "seller";
    }
    if (msg.profiles?.role === "seller") {
      return "seller";
    }
    return "buyer";
  };

  return (
    <CardContent className="flex-1 p-4 overflow-y-auto space-y-4">
      {/* Introductory system notice */}
      <div className="flex items-start gap-2.5 max-w-lg mx-auto p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs text-zinc-400 text-center">
        <Sparkles className="h-4 w-4 text-emerald-400 shrink-0 mx-auto mt-0.5" />
        <p className="text-[11px] leading-relaxed">
          Welcome to the assurance negotiation stream. Every message is monitored
          by PACT AI to identify agreed scope, timeline commitments, and
          milestone amounts with verifiable citations.
        </p>
      </div>

      {messages.length > 0 ? (
        messages.map((msg) => {
          const isMe = msg.sender_id === currentUserId;
          const senderRole = resolveSenderRole(msg);
          const senderName =
            msg.profiles?.full_name ||
            (senderRole === "buyer"
              ? participants.buyer?.name || "Buyer"
              : participants.seller?.name || "Seller");

          const isHighlighted = highlightedMessageId === msg.id;

          return (
            <div
              key={msg.id}
              id={`msg-${msg.id}`}
              className={`flex items-start gap-2.5 transition-all duration-200 ${
                isMe ? "flex-row-reverse" : "flex-row"
              } ${
                isHighlighted
                  ? "p-1.5 rounded-xl bg-emerald-500/15 ring-2 ring-emerald-500/50"
                  : ""
              }`}
            >
              {/* Avatar */}
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-xs select-none shrink-0 border ${
                  senderRole === "buyer"
                    ? "bg-sky-500/10 text-sky-400 border-sky-500/20"
                    : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                }`}
                title={senderName}
              >
                {senderName.charAt(0).toUpperCase() || (
                  <User className="h-4 w-4" />
                )}
              </div>

              {/* Bubble */}
              <div
                className={`space-y-1 max-w-[78%] ${
                  isMe ? "text-right" : "text-left"
                }`}
              >
                <div
                  className={`flex items-center gap-1.5 px-1 ${
                    isMe ? "justify-end" : "justify-start"
                  }`}
                >
                  <span className="text-[11px] font-bold text-zinc-100">
                    {isMe ? "You" : senderName}
                  </span>
                  <Badge
                    variant={senderRole === "buyer" ? "info" : "success"}
                    className="text-[9px] uppercase font-bold py-0 px-1.5 leading-none"
                  >
                    {senderRole}
                  </Badge>
                  <MountedTimestamp
                    value={msg.created_at}
                    mode="time"
                    className="font-mono tracking-tight text-[10px] text-zinc-400"
                  />
                </div>

                <div
                  className={`p-3 rounded-2xl text-xs leading-relaxed inline-block break-words shadow-xs transition-all duration-200 ${
                    isMe
                      ? "bg-emerald-500/15 border border-emerald-500/30 text-zinc-100 rounded-tr-xs text-left"
                      : "bg-zinc-950/70 border border-zinc-800/80 text-zinc-200 rounded-tl-xs"
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            </div>
          );
        })
      ) : (
        <div className="text-center py-16 px-4 space-y-2 border border-dashed border-zinc-800 rounded-xl my-4">
          <MessageSquare className="h-8 w-8 text-zinc-500 mx-auto opacity-50" />
          <p className="text-xs font-semibold text-zinc-200">
            Negotiation stream is empty
          </p>
          <p className="text-[11px] text-zinc-400 max-w-xs mx-auto">
            Type an opening proposal or discuss milestone terms below. PACT will
            parse agreements in real-time.
          </p>
        </div>
      )}
      <div ref={messagesEndRef} />
    </CardContent>
  );
}

