import Image from "next/image";

/**
 * Fixed ambient halftone/wireframe handshake backdrop with radial mask vignette,
 * concentric radar target rings, and subtle cybernetic HUD coordinates.
 */
export function CyberneticBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none flex items-center justify-center overflow-hidden bg-zinc-950 select-none"
    >
      {/* Etched subtle coordinate background grid */}
      <div className="absolute inset-0 pact-editorial-grid opacity-30" />

      {/* Center studio ambient halo */}
      <div className="absolute inset-0 bg-[radial-gradient(850px_circle_at_50%_45%,rgba(255,255,255,0.045),rgba(16,185,129,0.03)_42%,transparent_75%)]" />

      {/* Radial-masked Halftone / Wireframe Handshake Graphic */}
      <div className="relative w-full h-full max-w-[1160px] max-h-[1160px] flex items-center justify-center [mask-image:radial-gradient(circle_at_center,black_40%,transparent_90%)]">
        <Image
          src="/bg-handshake.png"
          alt=""
          fill
          unoptimized
          priority
          sizes="100vw"
          className="object-cover sm:object-contain opacity-25 mix-blend-screen"
        />
      </div>

      {/* Concentric Hairline Technical Target Rings (Radar Motif) */}
      <div className="absolute -bottom-72 left-1/2 -translate-x-1/2 flex items-center justify-center">
        <div className="w-[460px] h-[460px] border border-zinc-800/60 rounded-full" />
        <div className="absolute w-[740px] h-[740px] border border-zinc-800/60 rounded-full" />
        <div className="absolute w-[1040px] h-[1040px] border border-zinc-800/60 rounded-full" />
        <div className="absolute w-[1380px] h-[1380px] border border-zinc-800/50 rounded-full" />
      </div>

      {/* Secondary Alignment Reticle & Hairline Schematic Crosshairs */}
      <div className="hidden md:block absolute top-24 left-12 w-24 h-24 border border-zinc-800/60 rounded-full">
        <div className="absolute inset-3 border border-zinc-800/50 rounded-full" />
      </div>
      <div className="hidden lg:block absolute top-36 right-16 w-16 h-16 border border-zinc-800/60 rounded-full" />

      {/* Cybernetic HUD Telemetry Tickers */}
      <div className="absolute inset-x-0 top-20 px-4 sm:px-8 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-zinc-500 tracking-widest uppercase">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/70" />
          <span>TRUST_VERIFIED // SHA256_LOCK</span>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span>STATUS: AGREEMENT_BUILDER_ACTIVE</span>
          <span className="h-px w-6 bg-zinc-800" />
        </div>
      </div>

      <div className="hidden lg:flex absolute bottom-5 inset-x-0 px-8 items-center justify-between font-mono text-[10px] text-zinc-600 tracking-widest uppercase">
        <span>SYS.PACT // VECTOR_HANDSHAKE_01</span>
        <span>LAYER_00 :: RADIAL_MASK_ACTIVE</span>
      </div>
    </div>
  );
}

