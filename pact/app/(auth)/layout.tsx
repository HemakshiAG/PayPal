import * as React from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden flex flex-col justify-center items-center bg-transparent text-zinc-100 px-4 py-12 sm:px-6 lg:px-8 selection:bg-emerald-500/30 selection:text-emerald-100">
      {/* Oversized Watermarked Background Display Typography */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none absolute -top-10 inset-x-0 z-0 flex justify-center overflow-hidden"
      >
        <span className="text-[7.5rem] sm:text-[12rem] font-black tracking-tighter uppercase text-zinc-900/40 leading-none whitespace-nowrap">
          ASSURED
        </span>
      </div>

      <div className="relative z-10 sm:mx-auto sm:w-full sm:max-w-md text-center mb-6 animate-pact-fade-up">
        <Link
          href="/"
          className="inline-flex items-center gap-2.5 text-2xl font-black tracking-tight text-zinc-100 hover:opacity-90 transition-all duration-200 active:scale-95"
        >
          <div className="h-10 w-10 rounded-xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-emerald-400 shadow-[0_10px_25px_rgba(0,0,0,0.7),inset_0_1px_0_rgba(255,255,255,0.12)]">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <span className="tracking-[0.08em] uppercase">PACT</span>
        </Link>
        <p className="mt-2 font-mono text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-400">
          Predict · Agree · Protect
        </p>
      </div>

      <div
        className="relative z-10 sm:mx-auto sm:w-full sm:max-w-md animate-pact-reveal"
        style={{ animationDelay: "90ms" }}
      >
        {children}
      </div>

      <footer className="relative z-10 mt-8 text-center text-xs text-zinc-500">
        <p>© 2026 PACT Platform · Commercial Transaction Assurance</p>
      </footer>
    </div>
  );
}
