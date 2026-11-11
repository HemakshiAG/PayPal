"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

interface DemoJudgeSwitcherProps {
  variant?: "auth" | "dashboard";
  currentEmail?: string | null;
}

export function DemoJudgeSwitcher({
  variant = "auth",
  currentEmail = null,
}: DemoJudgeSwitcherProps) {
  const [loadingRole, setLoadingRole] = React.useState<"buyer" | "seller" | null>(
    null
  );

  const normalizedEmail = (currentEmail || "").toLowerCase();
  const isBuyerActive = normalizedEmail === "buyer@pact.demo";
  const isSellerActive = normalizedEmail === "seller@pact.demo";

  const handleNavigate = (role: "buyer" | "seller") => {
    setLoadingRole(role);
  };

  if (variant === "dashboard") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl px-4 py-3 shadow-[0_10px_35px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.08)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-zinc-400">
                1-Click Judge Switcher
              </p>
              <p className="text-xs text-zinc-200 font-medium">
                Test both sides of the same seeded workspace instantly
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <a
              href="/api/auth/demo-login?role=buyer"
              onClick={() => handleNavigate("buyer")}
              aria-disabled={loadingRole !== null}
              className={`group relative inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold tracking-wide backdrop-blur-xl transition-all duration-200 active:scale-[0.98] cursor-pointer ${loadingRole !== null ? "pointer-events-none opacity-60" : ""
                } ${isBuyerActive
                  ? "border border-emerald-400/60 bg-emerald-500/20 text-emerald-200 shadow-[0_0_24px_rgba(16,185,129,0.28),inset_0_1px_0_rgba(255,255,255,0.18)]"
                  : "border border-white/15 bg-white/[0.07] text-zinc-100 hover:bg-white/[0.14] hover:border-emerald-400/45 shadow-[0_8px_24px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.14)]"
                }`}
            >
              {loadingRole === "buyer" && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-300" />
              )}
              <span>⚡ Demo: Launch as Buyer</span>
              {isBuyerActive && (
                <span className="rounded-full bg-emerald-400/20 border border-emerald-400/40 px-1.5 py-0.5 font-mono text-[9px] uppercase text-emerald-200">
                  Active
                </span>
              )}
            </a>

            <a
              href="/api/auth/demo-login?role=seller"
              onClick={() => handleNavigate("seller")}
              aria-disabled={loadingRole !== null}
              className={`group relative inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold tracking-wide backdrop-blur-xl transition-all duration-200 active:scale-[0.98] cursor-pointer ${loadingRole !== null ? "pointer-events-none opacity-60" : ""
                } ${isSellerActive
                  ? "border border-sky-400/60 bg-sky-500/20 text-sky-200 shadow-[0_0_24px_rgba(56,189,248,0.28),inset_0_1px_0_rgba(255,255,255,0.18)]"
                  : "border border-white/15 bg-white/[0.07] text-zinc-100 hover:bg-white/[0.14] hover:border-sky-400/45 shadow-[0_8px_24px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.14)]"
                }`}
            >
              {loadingRole === "seller" && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-300" />
              )}
              <span>⚡ Demo: Launch as Seller</span>
              {isSellerActive && (
                <span className="rounded-full bg-sky-400/20 border border-sky-400/40 px-1.5 py-0.5 font-mono text-[9px] uppercase text-sky-200">
                  Active
                </span>
              )}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-white/12 bg-white/[0.04] backdrop-blur-xl p-4 shadow-[0_12px_36px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300">
          Judge Quick-Launch · No Password Required
        </span>
        <span className="font-mono text-[10px] text-zinc-400">
          Seeded Workspace Ready
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <a
          href="/api/auth/demo-login?role=buyer"
          onClick={() => handleNavigate("buyer")}
          aria-disabled={loadingRole !== null}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-400/35 bg-white/[0.08] hover:bg-emerald-500/20 hover:border-emerald-400/70 backdrop-blur-xl px-3.5 py-2.5 text-xs font-semibold text-zinc-100 shadow-[0_8px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.16)] transition-all duration-200 active:scale-[0.98] cursor-pointer ${loadingRole !== null ? "pointer-events-none opacity-60" : ""
            }`}
        >
          {loadingRole === "buyer" && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-300" />
          )}
          <span>⚡ Demo: Launch as Buyer</span>
        </a>

        <a
          href="/api/auth/demo-login?role=seller"
          onClick={() => handleNavigate("seller")}
          aria-disabled={loadingRole !== null}
          className={`inline-flex items-center justify-center gap-2 rounded-xl border border-sky-400/35 bg-white/[0.08] hover:bg-sky-500/20 hover:border-sky-400/70 backdrop-blur-xl px-3.5 py-2.5 text-xs font-semibold text-zinc-100 shadow-[0_8px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.16)] transition-all duration-200 active:scale-[0.98] cursor-pointer ${loadingRole !== null ? "pointer-events-none opacity-60" : ""
            }`}
        >
          {loadingRole === "seller" && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-300" />
          )}
          <span>⚡ Demo: Launch as Seller</span>
        </a>
      </div>

      <p className="text-[11px] text-zinc-400 text-center">
        Auto-signs into{" "}
        <code className="font-mono text-zinc-300">buyer@pact.demo</code> or{" "}
        <code className="font-mono text-zinc-300">seller@pact.demo</code>
      </p>
    </div>
  );
}
