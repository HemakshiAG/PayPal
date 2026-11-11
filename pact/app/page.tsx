import Link from "next/link";
import {
  ShieldCheck,
  MessageSquareText,
  Sparkles,
  LockKeyhole,
  ArrowUpRight,
  CheckCircle2,
  Package,
  Factory,
  Palette,
} from "lucide-react";
import { Badge } from "@/components/ui";
import { SpotlightHero } from "@/components/landing/SpotlightHero";
import { ProtocolDeck } from "@/components/landing/ProtocolDeck";
import { TiltCard } from "@/components/landing/TiltCard";
import { FloatingPill } from "@/components/landing/FloatingPill";

interface PillarItem {
  index: string;
  tag: string;
  title: string;
  description: string;
  bullets: string[];
  accent: "emerald" | "amber" | "white";
  icon: React.ReactNode;
}

const CORE_PILLARS: PillarItem[] = [
  {
    index: "01",
    tag: "EXTRACTION ENGINE",
    title: "AI-Powered Term Extraction from Chat",
    description:
      "Discuss fabric weights, batch tolerances, print placements, pricing, and dispatch dates naturally in the shared thread. PACT structures every commitment into confirmable terms pinned to exact source quotes.",
    bullets: [
      "Zero lost specs across long negotiation threads",
      "Mutual buyer + seller confirmation before drafting",
    ],
    accent: "emerald",
    icon: <MessageSquareText className="h-5 w-5 text-emerald-400" />,
  },
  {
    index: "02",
    tag: "RISK INTELLIGENCE",
    title: "Predictive Scenario Planning & Risk Mitigation",
    description:
      "Custom runs fail when surprises hit unguarded deals. PACT predicts category risks—textile stockouts, ink curing defects, rush-fee disputes, and freight slips—so remedies are agreed upfront.",
    bullets: [
      "Pre-agreed price & timeline compensation rules",
      "Live workspace contingency readiness score",
    ],
    accent: "amber",
    icon: <Sparkles className="h-5 w-5 text-amber-400" />,
  },
  {
    index: "03",
    tag: "CRYPTOGRAPHIC SETTLEMENT",
    title: "SHA-256 Hashed Agreements with PayPal Milestone Payments",
    description:
      "Confirmed specs and contingency rules compile into an immutable 13-section agreement hashed via SHA-256, synced to staged PayPal milestone releases and a hash-chained Evidence Vault.",
    bullets: [
      "Dual biometric Passkey approval locks V1, V2…",
      "Deposit, proof-of-work & final PayPal captures",
    ],
    accent: "emerald",
    icon: <LockKeyhole className="h-5 w-5 text-white" />,
  },
];

interface CustomDropCase {
  code: string;
  spec: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const CUSTOM_ORDER_CASES: CustomDropCase[] = [
  {
    code: "CAT // 01",
    spec: "MIN BATCH · 20–500 UNITS",
    title: "Custom Apparel & Merch Runs",
    description:
      "Coordinate cut-and-sew batches, 420GSM fabric specs, puff screen-printing, woven tags, and strike-off sample sign-offs before full production.",
    icon: <Package className="h-5 w-5 text-zinc-100" />,
  },
  {
    code: "CAT // 02",
    spec: "PAYPAL · 30 / 40 / 30",
    title: "Small-Batch Manufacturing",
    description:
      "Lock dimensional tolerances, tooling fees, raw-material substitute rules, and staged factory disbursements across domestic or overseas shops.",
    icon: <Factory className="h-5 w-5 text-zinc-100" />,
  },
  {
    code: "CAT // 03",
    spec: "DRIFT GUARD · ACTIVE",
    title: "Commissioned Design & Builds",
    description:
      "Enforce revision counts, IP ownership transfer on final payment, and milestone proof inspections for creative studios and fabricators.",
    icon: <Palette className="h-5 w-5 text-zinc-100" />,
  },
];

export default function LandingPage() {
  return (
    <div className="relative z-10 min-h-screen flex flex-col bg-transparent text-zinc-100 selection:bg-emerald-500/30 selection:text-emerald-100 overflow-x-hidden">
      {/* Editorial Top Bar */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/15 to-transparent"
        />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="h-9 w-9 rounded-xl bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] group-hover:border-emerald-400/50 transition-all duration-300">
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            </div>
            <div className="flex flex-col">
              <span className="font-black text-base tracking-[0.12em] uppercase leading-none text-zinc-100">
                PACT
              </span>
              <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-zinc-500 mt-1">
                Predict · Agree · Protect
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-8 font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-400">
            <a href="#showcase" className="hover:text-white transition-colors duration-200">
              [ Protocol ]
            </a>
            <a href="#pillars" className="hover:text-white transition-colors duration-200">
              [ Pillars ]
            </a>
            <a href="#use-cases" className="hover:text-white transition-colors duration-200">
              [ Custom Orders ]
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Link
              href="/auth/signin"
              className="px-3.5 py-2 rounded-full text-xs font-semibold text-zinc-300 hover:text-white transition-colors duration-200"
            >
              Sign In
            </Link>
            <Link
              href="/dashboard"
              className="group hidden sm:inline-flex items-center gap-1.5 backdrop-blur-xl bg-zinc-900/90 border border-zinc-700/60 text-zinc-100 rounded-full px-4 py-2 text-xs font-semibold tracking-wide hover:bg-white hover:text-black transition-all duration-300 active:scale-95"
            >
              <span>Launch Workspace</span>
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
            <Link
              href="/transactions/create"
              className="group inline-flex items-center gap-1.5 rounded-full bg-white text-black px-4 py-2 text-xs font-bold tracking-wide hover:bg-emerald-400 transition-all duration-300 shadow-lg active:scale-95"
            >
              <span>Create Deal</span>
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Interactive Spotlight Hero */}
        <SpotlightHero />

        {/* 5-Stage Interactive Protocol Showcase */}
        <ProtocolDeck />

        {/* Three Core Pillars Section with Oversized Background Display Text */}
        <section
          id="pillars"
          className="relative overflow-hidden border-b border-zinc-800/80 bg-transparent py-20 sm:py-28"
        >
          {/* Semi-transparent massive background typography */}
          <div
            aria-hidden="true"
            className="pointer-events-none select-none absolute -top-10 left-0 right-0 z-0 flex justify-start overflow-hidden px-4"
          >
            <span className="text-[6.5rem] sm:text-[10rem] lg:text-[13rem] font-black tracking-tighter uppercase text-zinc-900/40 leading-none whitespace-nowrap">
              PILLARS
            </span>
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-3 max-w-2xl">
                <Badge variant="outline" className="font-mono text-[10px] tracking-widest uppercase">
                  Architecture Overview
                </Badge>
                <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.04em] text-zinc-100 uppercase leading-[0.95]">
                  Three Pillars Shielding Every Commercial Run.
                </h2>
              </div>
              <p className="text-sm text-zinc-400 max-w-sm leading-relaxed">
                From messy initial DM negotiations to cryptographically signed releases,
                every promise is indexed, stress-tested, and verifiable.
              </p>
            </div>

            {/* Layered Metallic Tilt Cards OVER Typography */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {CORE_PILLARS.map((pillar) => (
                <TiltCard
                  key={pillar.index}
                  glowAccent={pillar.accent === "emerald" ? "emerald" : "white"}
                  className="p-6 sm:p-7 flex flex-col justify-between"
                >
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div className="h-12 w-12 rounded-xl bg-zinc-950/90 border border-zinc-800 flex items-center justify-center shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                        {pillar.icon}
                      </div>
                      <span className="font-mono text-[11px] font-bold tracking-widest text-zinc-500">
                        [ PILLAR {pillar.index} ]
                      </span>
                    </div>

                    <div className="space-y-2">
                      <span className="block font-mono text-[10px] tracking-[0.2em] uppercase text-emerald-400">
                        {pillar.tag}
                      </span>
                      <h3 className="text-xl font-black tracking-tight text-zinc-100 leading-snug">
                        {pillar.title}
                      </h3>
                      <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                        {pillar.description}
                      </p>
                    </div>
                  </div>

                  <ul className="mt-6 pt-4 border-t border-zinc-800/80 space-y-2.5 text-xs text-zinc-300">
                    {pillar.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </TiltCard>
              ))}
            </div>
          </div>
        </section>

        {/* Custom Commercial Orders Showcase */}
        <section
          id="use-cases"
          className="relative overflow-hidden border-b border-zinc-800/80 bg-transparent py-20 sm:py-28"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none select-none absolute -top-10 right-0 z-0 overflow-hidden px-4"
          >
            <span className="text-[6rem] sm:text-[10rem] lg:text-[12rem] font-black tracking-tighter uppercase text-zinc-900/40 leading-none whitespace-nowrap">
              BESPOKE
            </span>
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-3 max-w-xl">
                <Badge variant="assurance" className="font-mono text-[10px] tracking-widest uppercase">
                  Built for Real Makers &amp; Buyers
                </Badge>
                <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] text-zinc-100 uppercase leading-tight">
                  Engineered for High-Stakes Custom Production
                </h2>
              </div>

              <FloatingPill href="/transactions/create" variant="subtle" className="py-3 px-6 text-xs">
                Start Custom Order
              </FloatingPill>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {CUSTOM_ORDER_CASES.map((item) => (
                <TiltCard key={item.code} className="p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <div className="h-10 w-10 rounded-xl bg-zinc-950/90 border border-zinc-800 flex items-center justify-center">
                      {item.icon}
                    </div>
                    <span className="font-mono text-[10px] tracking-widest text-zinc-500">
                      {item.code}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <h3 className="text-lg font-bold tracking-tight text-zinc-100">
                      {item.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-zinc-800/80 font-mono text-[10px] tracking-wider uppercase text-emerald-400">
                    {item.spec}
                  </div>
                </TiltCard>
              ))}
            </div>
          </div>
        </section>

        {/* Final Monumental CTA Slab */}
        <section className="relative overflow-hidden bg-transparent py-20 sm:py-28">
          <div
            aria-hidden="true"
            className="pointer-events-none select-none absolute -top-8 inset-x-0 z-0 flex justify-center overflow-hidden"
          >
            <span className="text-[6.5rem] sm:text-[11rem] lg:text-[14rem] font-black tracking-tighter uppercase text-zinc-900/40 leading-none whitespace-nowrap">
              PROTECT
            </span>
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <TiltCard glowAccent="emerald" maxTilt={4} className="p-8 sm:p-14">
              <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
                <div className="space-y-3 max-w-2xl">
                  <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-400">
                    [ READY FOR DROP 01 ]
                  </span>
                  <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.04em] text-zinc-100 uppercase leading-[0.95]">
                    Lock your next custom order before cutting fabric.
                  </h2>
                  <p className="text-sm sm:text-base text-zinc-400 leading-relaxed">
                    Spin up a shared workspace in seconds or explore the dashboard preloaded
                    with our interactive 20 Custom Hoodies demo transaction.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 shrink-0">
                  <FloatingPill href="/transactions/create" variant="frosted">
                    Create Transaction
                  </FloatingPill>
                  <FloatingPill href="/dashboard" variant="frosted">
                    Launch Workspace
                  </FloatingPill>
                </div>
              </div>
            </TiltCard>
          </div>
        </section>
      </main>

      {/* Commercial Footer */}
      <footer className="border-t border-zinc-800/80 bg-zinc-950/75 backdrop-blur-xl py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-400">
          <div className="flex items-center gap-2 font-mono">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span className="font-bold tracking-wider text-zinc-100">PACT</span>
            <span className="text-zinc-500">· PREDICT · AGREE · PROTECT</span>
          </div>
          <p className="text-center text-zinc-500">
            PACT coordinates milestone agreements and PayPal payments directly between buyers
            and sellers; PACT does not operate as an escrow custodian.
          </p>
          <div className="flex items-center gap-5 font-mono text-[11px] uppercase tracking-wider">
            <Link href="/auth/signin" className="hover:text-white transition-colors">
              Sign In
            </Link>
            <Link href="/auth/signup" className="hover:text-white transition-colors">
              Sign Up
            </Link>
            <Link href="/dashboard" className="hover:text-white transition-colors">
              Dashboard
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
