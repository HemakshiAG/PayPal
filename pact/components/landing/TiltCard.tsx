"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface TiltCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  maxTilt?: number;
  restingRotateDeg?: number;
  glowAccent?: "white" | "emerald";
}

/**
 * Metallic dark glass card with pointer-driven 3D perspective tilt,
 * specular sheen, and multi-stage cinematic shadow.
 */
export function TiltCard({
  children,
  className,
  maxTilt = 7,
  restingRotateDeg = 0,
  glowAccent = "white",
  ...props
}: TiltCardProps) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [transformStyle, setTransformStyle] = React.useState<string>(
    restingRotateDeg !== 0
      ? `perspective(1200px) rotateZ(${restingRotateDeg}deg)`
      : "perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)"
  );
  const [glarePos, setGlarePos] = React.useState<{ x: number; y: number; active: boolean }>({
    x: 50,
    y: 25,
    active: false,
  });

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = cardRef.current;
    if (!el || e.pointerType === "touch") return;

    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;

    const rotateY = (px - 0.5) * (maxTilt * 2);
    const rotateX = (0.5 - py) * (maxTilt * 2);

    setTransformStyle(
      `perspective(1200px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(
        2
      )}deg) translate3d(0, -6px, 0) scale3d(1.015, 1.015, 1.015)`
    );
    setGlarePos({ x: px * 100, y: py * 100, active: true });
  };

  const handlePointerLeave = () => {
    setTransformStyle(
      restingRotateDeg !== 0
        ? `perspective(1200px) rotateZ(${restingRotateDeg}deg)`
        : "perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)"
    );
    setGlarePos((prev) => ({ ...prev, active: false }));
  };

  const glareTint =
    glowAccent === "emerald"
      ? "rgba(16, 185, 129, 0.14)"
      : "rgba(255, 255, 255, 0.11)";

  return (
    <div
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{ transform: transformStyle }}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl text-zinc-100",
        "shadow-[0_15px_35px_rgba(0,0,0,0.8),inset_0_1px_0_rgba(255,255,255,0.1)]",
        "transition-[transform,border-color,box-shadow] duration-300 ease-out will-change-transform",
        "hover:border-zinc-500/50 hover:shadow-[0_20px_50px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.16)]",
        className
      )}
      {...props}
    >
      {/* Dynamic cursor glare highlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 transition-opacity duration-300"
        style={{
          opacity: glarePos.active ? 1 : 0,
          background: `radial-gradient(420px circle at ${glarePos.x}% ${glarePos.y}%, ${glareTint}, transparent 65%)`,
        }}
      />
      {/* Top metallic edge specular */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-60 group-hover:opacity-100 transition-opacity duration-300"
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

