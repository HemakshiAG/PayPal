"use client";

import * as React from "react";
import Link from "next/link";
import { ShieldCheck, LogOut } from "lucide-react";

interface NavbarProps {
  displayName: string;
  userRole: string;
  userInitial: string;
  signOutAction: () => Promise<void>;
}

function formatRoleLabel(role: string): string {
  switch (role.toLowerCase()) {
    case "buyer":
      return "Buyer";
    case "seller":
      return "Seller";
    case "both":
      return "Buyer · Seller";
    default:
      return role;
  }
}

function getRoleBadgeClasses(role: string): string {
  switch (role.toLowerCase()) {
    case "buyer":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "seller":
      return "border-sky-500/30 bg-sky-500/10 text-sky-300";
    default:
      return "border-zinc-700/80 bg-zinc-900/90 text-zinc-200";
  }
}

function getRoleDotClasses(role: string): string {
  switch (role.toLowerCase()) {
    case "buyer":
      return "bg-emerald-400";
    case "seller":
      return "bg-sky-400";
    default:
      return "bg-zinc-400";
  }
}

export function Navbar({
  displayName,
  userRole,
  userInitial,
  signOutAction,
}: NavbarProps) {
  const roleLabel = formatRoleLabel(userRole);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* PACT Logo */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 font-black text-lg tracking-tight hover:opacity-90 transition-all duration-200 active:scale-95"
        >
          <div className="h-9 w-9 rounded-xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-emerald-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="leading-tight font-black tracking-[0.08em] uppercase text-zinc-100">
              PACT
            </span>
            <span className="font-mono text-[9px] uppercase font-semibold text-zinc-500 tracking-[0.2em] -mt-0.5">
              Assurance
            </span>
          </div>
        </Link>

        {/* Role Badge, User Profile Avatar & Sign Out */}
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold tracking-wide backdrop-blur-md ${getRoleBadgeClasses(
              userRole
            )}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${getRoleDotClasses(userRole)}`}
            />
            {roleLabel}
          </span>

          <div className="flex items-center gap-2.5 pl-3 border-l border-zinc-800/80">
            <div
              className="h-8 w-8 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 font-bold text-xs flex items-center justify-center select-none"
              title={displayName}
            >
              {userInitial}
            </div>
            <span className="hidden sm:inline text-xs font-semibold text-zinc-100 max-w-[140px] truncate">
              {displayName}
            </span>

            <form action={signOutAction}>
              <button
                type="submit"
                className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 border border-transparent hover:border-zinc-700 transition-all duration-200 active:scale-95 cursor-pointer"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </header>
  );
}

