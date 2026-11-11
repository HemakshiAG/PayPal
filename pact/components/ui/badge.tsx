import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?:
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "success"
    | "warning"
    | "info"
    | "assurance";
  pulse?: boolean;
}

const badgeVariants: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default:
    "bg-zinc-800/80 text-zinc-200 border-zinc-700/80",
  secondary:
    "bg-zinc-900/80 text-zinc-300 border-zinc-800",
  destructive:
    "bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_12px_-3px_rgba(244,63,94,0.25)]",
  outline:
    "bg-zinc-900/50 text-zinc-300 border-zinc-800/90",
  success:
    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_12px_-3px_rgba(16,185,129,0.25)]",
  warning:
    "bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_12px_-3px_rgba(245,158,11,0.2)]",
  info:
    "bg-sky-500/10 text-sky-400 border-sky-500/20 shadow-[0_0_12px_-3px_rgba(56,189,248,0.2)]",
  assurance:
    "bg-emerald-500/10 text-emerald-400 border-emerald-500/25 font-semibold shadow-[0_0_14px_-3px_rgba(16,185,129,0.3)]",
};

export function Badge({
  className,
  variant = "default",
  pulse = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all duration-200 backdrop-blur-xs select-none",
        badgeVariants[variant],
        className
      )}
      {...props}
    >
      {pulse && (
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
        </span>
      )}
      {children}
    </div>
  );
}
