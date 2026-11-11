"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, ArrowUpRight } from "lucide-react";

export function QuickJoinCodeBox() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = React.useState("");
  const [isJoining, setIsJoining] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const trimmed = inviteCode.trim().toUpperCase().replace(/\s+/g, "");
    if (trimmed.length < 6) {
      setError("Enter at least 6 characters.");
      return;
    }

    setIsJoining(true);
    try {
      const response = await fetch("/api/transactions/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode: trimmed }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        transactionId?: string;
        error?: string;
      };

      if (!response.ok || !payload.transactionId) {
        setError(payload.error || "Invalid invite code.");
        setIsJoining(false);
        return;
      }

      router.push(`/transactions/${payload.transactionId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join workspace.");
      setIsJoining(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-zinc-950/75 backdrop-blur-xl px-4 py-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col sm:flex-row sm:items-center gap-2.5"
      >
        <div className="flex items-center gap-2 shrink-0">
          <KeyRound className="h-4 w-4 text-emerald-400" />
          <label
            htmlFor="dashboard-join-code"
            className="text-xs font-semibold text-zinc-200 whitespace-nowrap"
          >
            Join via Code
          </label>
        </div>

        <div className="flex flex-1 items-center gap-2">
          <input
            id="dashboard-join-code"
            type="text"
            value={inviteCode}
            onChange={(e) => {
              setError(null);
              setInviteCode(e.target.value.toUpperCase().replace(/\s+/g, ""));
            }}
            placeholder="Enter invite code (e.g. PACT9X4K)"
            maxLength={16}
            className="h-9 flex-1 min-w-[160px] rounded-xl border border-zinc-800 bg-zinc-900/90 px-3 font-mono text-xs tracking-wider uppercase text-zinc-100 placeholder:normal-case placeholder:tracking-normal placeholder:font-sans placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50"
          />
          <button
            type="submit"
            disabled={isJoining}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25 hover:border-emerald-400/60 transition-all duration-200 active:scale-95 disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            {isJoining ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUpRight className="h-3.5 w-3.5" />
            )}
            <span>{isJoining ? "Joining..." : "Enter Code"}</span>
          </button>
        </div>
      </form>
      {error && (
        <p className="mt-1.5 text-[11px] font-medium text-rose-400">{error}</p>
      )}
    </div>
  );
}

