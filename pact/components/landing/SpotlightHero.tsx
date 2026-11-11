"use client";

import * as React from "react";
import {
  ShieldCheck,
  MessageSquareText,
  AlertTriangle,
  LockKeyhole,
  CreditCard,
  CheckCircle2,
  Fingerprint,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { TiltCard } from "./TiltCard";
import { FloatingPill } from "./FloatingPill";

interface DemoOrderScenario {
  id: string;
  code: string;
  label: string;
  title: string;
  category: string;
  extractedQuote: string;
  contingencyTitle: string;
  contingencyRule: string;
  hashSnippet: string;
  version: string;
  totalBudget: string;
  depositLabel: string;
  progressPct: number;
}

const ORDER_SCENARIOS: DemoOrderScenario[] = [
  {
    id: "apparel",
    code: "01",
    label: "APPAREL BATCH",
    title: "20 Custom Hoodies — 420GSM Charcoal Drop",
    category: "CUSTOM APPAREL",
    extractedQuote:
      "20 heavyweight 420GSM washed-charcoal hoodies, puff-print chest crest, woven neck tags, 14-day dispatch, 48h inspection window.",
    contingencyTitle: "Mill Dye-Lot Stockout Protocol",
    contingencyRule:
      "Certified 420GSM alternate swatch approved in 24h at $0 surcharge; express air freight if dispatch slips past Day 14.",
    hashSnippet: "8f94c2e1b0a7...4d2c91f8e3b2",
    version: "V2 · PASSKEY LOCKED",
    totalBudget: "$1,200",
    depositLabel: "30% Deposit Captured",
    progressPct: 33,
  },
  {
    id: "hardware",
    code: "02",
    label: "CNC BATCH",
    title: "50 Anodized Aluminum Synth Enclosures",
    category: "SMALL-BATCH MANUFACTURING",
    extractedQuote:
      "50 bead-blasted 6061-T6 chassis, +/-0.08mm tolerance, matte obsidian anodize, laser-etched serials, 21-day lead time.",
    contingencyTitle: "Tolerance Deviation & Rework Shield",
    contingencyRule:
      "Any unit outside +/-0.08mm flagged during 72h sample inspection triggers zero-cost CNC re-milling prior to final 40% PayPal release.",
    hashSnippet: "3a71d9c4f208...9e11b7a05c44",
    version: "V1 · PASSKEY LOCKED",
    totalBudget: "$4,800",
    depositLabel: "50% Tooling + First Article",
    progressPct: 50,
  },
  {
    id: "commission",
    code: "03",
    label: "STUDIO BUILD",
    title: "Interactive Lookbook & Custom Pack Design",
    category: "COMMISSIONED STUDIO",
    extractedQuote:
      "Full campaign identity, 3D garment turntable renders, print-ready packaging dielines, 2 revision rounds, IP assignment on final clearance.",
    contingencyTitle: "Scope Drift & Extra Revision Guardrail",
    contingencyRule:
      "Additions beyond 2 milestone revision cycles auto-flag in chat and append as billed Version V2 addenda before work proceeds.",
    hashSnippet: "e5c08b32a914...7a60d4f12b89",
    version: "V3 · PASSKEY LOCKED",
    totalBudget: "$3,200",
    depositLabel: "70% Two-Stage Released",
    progressPct: 70,
  },
];

export function SpotlightHero() {
  const sectionRef = React.useRef<HTMLElement>(null);
  const [activeId, setActiveId] = React.useState<string>("apparel");
  const activeScenario =
    ORDER_SCENARIOS.find((s) => s.id === activeId) ?? ORDER_SCENARIOS[0];

  const handleMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    const el = sectionRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty("--spot-x", `${x}px`);
    el.style.setProperty("--spot-y", `${y}px`);
    el.style.setProperty("--spot-opacity", "1");
  };

  const handleMouseLeave = () => {
    const el = sectionRef.current;
    if (!el) return;
    el.style.setProperty("--spot-opacity", "0.55");
  };

  return (
    <section
      ref={sectionRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={
        {
          "--spot-x": "55%",
          "--spot-y": "42%",
          "--spot-opacity": "0.65",
        } as React.CSSProperties
      }
      className="relative overflow-hidden border-b border-zinc-800/80 bg-transparent pt-10 pb-16 sm:pt-16 sm:pb-24 lg:pt-20 lg:pb-28"
    >
      {/* Layer 1: Cursor-revealed high-contrast coordinate grid */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 pact-editorial-grid-bright transition-opacity duration-500"
        style={{
          opacity: "var(--spot-opacity)",
          WebkitMaskImage:
            "radial-gradient(380px circle at var(--spot-x) var(--spot-y), black 0%, rgba(0,0,0,0.45) 45%, transparent 75%)",
          maskImage:
            "radial-gradient(380px circle at var(--spot-x) var(--spot-y), black 0%, rgba(0,0,0,0.45) 45%, transparent 75%)",
        }}
      />

      {/* Layer 2: Dynamic Mouse-Follow Studio Spotlight radial glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-500"
        style={{
          opacity: "var(--spot-opacity)",
          background:
            "radial-gradient(680px circle at var(--spot-x) var(--spot-y), rgba(255,255,255,0.085), rgba(16,185,129,0.055) 32%, transparent 72%)",
        }}
      />

      {/* Soft translucent edge vignette */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-zinc-950/35 via-transparent to-zinc-950/55"
      />

      {/* Layer 3: Monumental Background Display Typography (Z-0 behind cards) */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none absolute -top-10 left-0 right-0 z-0 overflow-hidden flex flex-col items-center justify-start"
      >
        <span className="text-[6.25rem] sm:text-[9.5rem] md:text-[12rem] lg:text-[15.5rem] font-black tracking-tighter uppercase leading-[0.82] text-zinc-900/40 whitespace-nowrap">
          ASSURED
        </span>
        <span className="text-[4.5rem] sm:text-[7.5rem] md:text-[10rem] lg:text-[12rem] font-black tracking-tighter uppercase leading-[0.82] text-zinc-900/25 whitespace-nowrap">
          PACT // 2026
        </span>
      </div>

      {/* Main Content Container (Layered OVER typography at z-10) */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Micro Editorial Coordinate Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-8 sm:pb-10 text-[11px] font-mono tracking-widest uppercase text-zinc-500">
          <span className="inline-flex items-center gap-2 text-zinc-300">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            [ EDITION 01 · CUSTOM COMMERCIAL ASSURANCE ]
          </span>
          <span className="hidden sm:inline text-zinc-500">
            SHA-256 CONTRACT ENGINE // PAYPAL SANDBOX MILESTONES
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
          {/* Left Editorial Statement */}
          <div className="lg:col-span-6 space-y-7 animate-pact-fade-up">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-zinc-800 bg-zinc-900/80 backdrop-blur-md px-4 py-1.5 text-xs font-medium text-zinc-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span className="font-mono tracking-wider uppercase text-[11px]">
                Predict · Agree · Protect
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-[3.9rem] font-black tracking-[-0.04em] text-zinc-100 leading-[0.96]">
              WE BUILD{" "}
              <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
                ARMOR
              </span>{" "}
              FOR CUSTOM{" "}
              <span className="text-emerald-400">COMMERCIAL DEALS.</span>
            </h1>

            <p className="text-base sm:text-lg text-zinc-400 leading-relaxed max-w-xl">
              Built for buyers and producers of custom streetwear batches, small-batch
              manufacturing, and commissioned builds. Turn unstructured deal chats into
              disruption-proof, SHA-256 locked contracts with staged PayPal milestone releases.
            </p>

            {/* Quick Trust Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {[
                { label: "TERM EXTRACTION", value: "AI Cited" },
                { label: "CONTRACT SEAL", value: "SHA-256 + WebAuthn" },
                { label: "SETTLEMENT", value: "PayPal Milestones" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                >
                  <div className="text-[10px] font-mono tracking-widest text-zinc-500">
                    {stat.label}
                  </div>
                  <div className="text-xs font-bold text-zinc-100 mt-0.5 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    <span>{stat.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Layered 3D-Tilt Interactive Contract Console */}
          <div className="lg:col-span-6 animate-pact-reveal" style={{ animationDelay: "120ms" }}>
            <TiltCard glowAccent="emerald" maxTilt={6} className="p-0">
              {/* Top Interactive Scenario Selector Strip */}
              <div className="px-4 sm:px-5 py-3.5 border-b border-zinc-800/80 bg-zinc-950/75 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  {ORDER_SCENARIOS.map((item) => {
                    const isSelected = item.id === activeScenario.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setActiveId(item.id)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-mono tracking-wider transition-all duration-200 cursor-pointer active:scale-95 ${
                          isSelected
                            ? "bg-white text-black font-bold shadow-sm"
                            : "bg-zinc-900/80 text-zinc-400 border border-zinc-800 hover:text-zinc-100 hover:border-zinc-600"
                        }`}
                      >
                        {`${item.code} // ${item.label}`}
                      </button>
                    );
                  })}
                </div>

                <Badge variant="success" pulse className="text-[10px] font-mono">
                  Agreement Active
                </Badge>
              </div>

              {/* Dynamic Preview Body */}
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">
                      {activeScenario.category}
                    </span>
                    <h2 className="text-sm sm:text-base font-bold text-zinc-100 tracking-tight mt-0.5">
                      {activeScenario.title}
                    </h2>
                  </div>
                  <span className="font-mono text-sm font-black tabular-nums text-zinc-100 shrink-0">
                    {activeScenario.totalBudget}
                  </span>
                </div>

                {/* Pillar 1 Preview */}
                <div className="p-3.5 rounded-xl bg-zinc-950/70 border border-zinc-800/80 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <MessageSquareText className="h-3.5 w-3.5" />
                      01 · Extracted from Chat
                    </span>
                    <span className="text-[10px] font-mono text-zinc-500">
                      CITED &amp; VERIFIED
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    &ldquo;{activeScenario.extractedQuote}&rdquo;
                  </p>
                </div>

                {/* Pillar 2 Preview */}
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      02 · {activeScenario.contingencyTitle}
                    </span>
                    <Badge variant="success" className="text-[10px]">
                      Mutually Resolved
                    </Badge>
                  </div>
                  <p className="text-xs text-zinc-200 font-medium leading-relaxed">
                    {activeScenario.contingencyRule}
                  </p>
                </div>

                {/* Pillar 3 & 4 Telemetry Pair */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-950/70 space-y-1.5">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                      <LockKeyhole className="h-3 w-3 text-emerald-400" />
                      SHA-256 Digest
                    </span>
                    <p className="font-mono tabular-nums text-[11px] text-zinc-100 truncate">
                      {activeScenario.hashSnippet}
                    </p>
                    <p className="text-[10px] font-mono text-emerald-400 font-semibold flex items-center gap-1">
                      <Fingerprint className="h-3 w-3" />
                      {activeScenario.version}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-zinc-800/80 bg-zinc-950/70 space-y-1.5">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                      <CreditCard className="h-3 w-3 text-emerald-400" />
                      PayPal Milestones ({activeScenario.totalBudget})
                    </span>
                    <div className="flex items-center justify-between text-[11px] font-semibold">
                      <span className="text-zinc-200">{activeScenario.depositLabel}</span>
                      <span className="font-mono text-emerald-400">VERIFIED</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${activeScenario.progressPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </TiltCard>
          </div>
        </div>

        {/* Bottom Floating Frosted Pill Controls Bar */}
        <div
          className="mt-14 sm:mt-16 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-center gap-3.5 animate-pact-fade-up"
          style={{ animationDelay: "200ms" }}
        >
          <FloatingPill href="/transactions/create" variant="frosted">
            Create Transaction
          </FloatingPill>
          <FloatingPill href="/dashboard" variant="frosted">
            Launch Workspace
          </FloatingPill>
          <FloatingPill href="/auth/signup" variant="subtle">
            Free Account
          </FloatingPill>
        </div>
      </div>
    </section>
  );
}
