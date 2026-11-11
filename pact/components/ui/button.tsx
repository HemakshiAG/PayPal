import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "assurance";
  size?: "default" | "sm" | "lg" | "icon";
  isLoading?: boolean;
}

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default:
    "bg-zinc-100 text-zinc-950 hover:bg-white shadow-sm border border-white/10",
  destructive:
    "bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25 shadow-sm",
  outline:
    "border border-zinc-800 bg-zinc-900/60 backdrop-blur-md text-zinc-200 hover:bg-zinc-800/80 hover:border-zinc-700 hover:text-zinc-100 shadow-xs",
  secondary:
    "bg-zinc-800/70 text-zinc-200 border border-zinc-700/70 hover:bg-zinc-800 hover:text-white",
  ghost:
    "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100",
  link:
    "text-emerald-400 underline-offset-4 hover:underline p-0 h-auto font-medium",
  assurance:
    "bg-emerald-600 text-white border border-emerald-400/25 hover:bg-emerald-500 shadow-[0_0_20px_-5px_rgba(16,185,129,0.45)] font-semibold",
};

const sizeStyles: Record<NonNullable<ButtonProps["size"]>, string> = {
  default: "h-10 px-4 py-2 text-sm rounded-lg",
  sm: "h-8 rounded-lg px-3 text-xs",
  lg: "h-12 rounded-xl px-8 text-base",
  icon: "h-10 w-10 p-0 rounded-lg",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      isLoading = false,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || isLoading;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin -ml-1 mr-1.5 h-4 w-4 text-current"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
