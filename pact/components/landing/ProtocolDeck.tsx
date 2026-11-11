"use client";

import * as React from "react";
import {
  MessageSquareText,
  Sparkles,
  Fingerprint,
  CreditCard,
  Archive,
} from "lucide-react";
import { TiltCard } from "./TiltCard";

interface ProtocolStage {
  index: string;
  tag: string;
  title: string;
  subtitle: string;
  metric: string;
  icon: React.ReactNode;
  restingRotate: number;
  verticalOffset: string;
}

const PROTOCOL_STAGES: ProtocolStage[] = [
  {
    index: "01",
    tag: "CONVERSATION",
    title: "Extract Specs",
    subtitle: "Convert DM promises into cited structured line items.",
    metric: "100% QUOTE LINKED",
    icon: <MessageSquareText className="h-5 w-5 text-emerald-400" />,
    restingRotate: -4,
    verticalOffset: "lg:translate-y-4",
  },
  {
    index: "02",
    tag: "SCENARIOS",
    title: "Predict Risks",
    subtitle: "Lock fair contingencies for stockouts, defects & delays.",
    metric: "PRE-PRODUCTION SHIELD",
    icon: <Sparkles className="h-5 w-5 text-amber-400" />,
    restingRotate: -2,
    verticalOffset: "lg:translate-y-1",
  },
  {
    index: "03",
    tag: "AGREEMENT",
    title: "Seal SHA-256",
    subtitle: "Compile 13-section contract co-signed with Passkey.",
    metric: "IMMUTABLE V1/V2 HASH",
    icon: <Fingerprint className="h-5 w-5 text-white" />,
    restingRotate: 0,
    verticalOffset: "lg:-translate-y-2",
  },
  {
    index: "04",
    tag: "PAYMENTS",
    title: "Pay Milestones",
    subtitle: "Buyer-initiated PayPal API captures tied to proof.",
    metric: "STAGED RELEASES",
    icon: <CreditCard className="h-5 w-5 text-sky-400" />,
    restingRotate: 2,
    verticalOffset: "lg:translate-y-1",
  },
  {
    index: "05",
    tag: "EVIDENCE VAULT",
    title: "Guard & Audit",
    subtitle: "Detect chat drift live & export tamper-evident proof.",
    metric: "HASH-CHAINED LEDGER",
    icon: <Archive className="h-5 w-5 text-emerald-400" />,
    restingRotate: 4,
    verticalOffset: "lg:translate-y-4",
  },
];

/**
 * High-impact editorial fanned 3D stage showcase for PACT's 5-tab workflow.
 */
export function ProtocolDeck() {
  const [focusedIndex, setFocusedIndex] = React.useState<string>("03");

  return (
    <section
      id="showcase"
      className="relative overflow-hidden border-b border-zinc-800/80 bg-transparent py-20 sm:py-28"
    >
      {/* Oversized Background Display Typography */}
      <div
        aria-hidden="true"
        className="pointer-events-none select-none absolute -top-6 inset-x-0 z-0 flex justify-center overflow-hidden"
      >
        <span className="text-[5.5rem] sm:text-[9.5rem] md:text-[12rem] lg:text-[14rem] font-black tracking-tighter uppercase text-zinc-900/40 whitespace-nowrap">
          PROTOCOL
        </span>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
        {/* Bold Centered Manifesto Overlapping Typography */}
        <div className="text-center max-w-3xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/80 backdrop-blur-md px-4 py-1 text-[11px] font-mono uppercase tracking-widest text-zinc-400">
            [ FIVE-STAGE ASSURANCE ENGINE ]
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.04em] text-zinc-100 uppercase leading-[0.95]">
            Built to shield every{" "}
            <span className="text-zinc-400">custom drop.</span>
          </h2>
          <p className="text-sm sm:text-base text-zinc-400 max-w-xl mx-auto leading-relaxed">
            Hover or select any workspace stage to inspect how PACT carries custom commerce
            from raw negotiation to verified PayPal settlement.
          </p>
        </div>

        {/* 5 Fanned / 3D Tilt Monolith Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-2 pb-4">
          {PROTOCOL_STAGES.map((stage) => {
            const isFocused = focusedIndex === stage.index;
            return (
              <div
                key={stage.index}
                className={`${stage.verticalOffset} transition-transform duration-300`}
                onMouseEnter={() => setFocusedIndex(stage.index)}
              >
                <TiltCard
                  restingRotateDeg={stage.restingRotate}
                  maxTilt={9}
                  glowAccent={stage.index === "03" || stage.index === "05" ? "emerald" : "white"}
                  onClick={() => setFocusedIndex(stage.index)}
                  className={`p-5 cursor-pointer h-full min-h-[240px] flex flex-col justify-between ${
                    isFocused ? "border-zinc-500/60" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold tracking-widest text-zinc-500">
                      {`${stage.index} // ${stage.tag}`}
                    </span>
                    <div className="h-9 w-9 rounded-xl bg-zinc-950/90 border border-zinc-800 flex items-center justify-center shadow-inner">
                      {stage.icon}
                    </div>
                  </div>

                  <div className="space-y-2 my-6">
                    <h3 className="text-lg font-black tracking-tight text-zinc-100">
                      {stage.title}
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {stage.subtitle}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-[10px] font-mono tracking-wider text-emerald-400">
                    <span>{stage.metric}</span>
                    <span className="text-zinc-500">TAB {stage.index}</span>
                  </div>
                </TiltCard>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
