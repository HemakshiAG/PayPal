import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface FloatingPillProps {
  href: string;
  children: React.ReactNode;
  variant?: "frosted" | "inverse" | "subtle";
  className?: string;
  icon?: React.ReactNode;
}

/**
 * Floating frosted pill CTA with directional hover arrow micro-interaction.
 */
export function FloatingPill({
  href,
  children,
  variant = "frosted",
  className,
  icon,
}: FloatingPillProps) {
  const variantStyles = {
    frosted:
      "backdrop-blur-xl bg-zinc-900/90 border border-zinc-700/60 text-zinc-100 rounded-full px-8 py-4 text-sm font-semibold tracking-wide hover:bg-white hover:text-black transition-all duration-300 shadow-2xl active:scale-95 flex items-center justify-center gap-3",
    inverse:
      "backdrop-blur-xl bg-white/95 border border-white/60 text-zinc-950 rounded-full px-8 py-4 text-sm font-semibold tracking-wide hover:bg-emerald-400 hover:border-emerald-300 hover:text-zinc-950 transition-all duration-300 shadow-2xl active:scale-95 flex items-center justify-center gap-3",
    subtle:
      "backdrop-blur-xl bg-zinc-950/80 border border-zinc-800/80 text-zinc-300 rounded-full px-6 py-4 text-sm font-semibold tracking-wide hover:bg-zinc-800/90 hover:text-white hover:border-zinc-500/50 transition-all duration-300 shadow-xl active:scale-95 flex items-center justify-center gap-2.5",
  }[variant];

  return (
    <Link href={href} className={cn("group", variantStyles, className)}>
      {icon}
      <span>{children}</span>
      <ArrowUpRight
        aria-hidden="true"
        className="h-4 w-4 shrink-0 transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1"
      />
    </Link>
  );
}

