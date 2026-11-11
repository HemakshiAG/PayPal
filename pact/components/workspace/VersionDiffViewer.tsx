"use strict";
import * as React from "react";
import { AgreementVersion } from "@/types/agreement";
import { computeVersionDiffs } from "@/services/agreement/builder";
import { Badge } from "@/components/ui/badge";
import { GitCompare, PlusCircle, MinusCircle, CheckCircle2 } from "lucide-react";

interface VersionDiffViewerProps {
  oldVersion: AgreementVersion;
  newVersion: AgreementVersion;
}

export function VersionDiffViewer({ oldVersion, newVersion }: VersionDiffViewerProps) {
  const [showUnchanged, setShowUnchanged] = React.useState(false);

  const diffs = React.useMemo(() => {
    return computeVersionDiffs(oldVersion, newVersion);
  }, [oldVersion, newVersion]);

  const modifiedCount = diffs.filter((d) => d.type === "modified").length;
  const addedCount = diffs.filter((d) => d.type === "added").length;
  const unchangedCount = diffs.filter((d) => d.type === "unchanged").length;

  return (
    <div className="space-y-4">
      {/* Diff Header Banner */}
      <div className="group relative overflow-hidden p-4 rounded-2xl border border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl space-y-2 transition-all duration-200 hover:border-emerald-500/35">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GitCompare className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-bold text-zinc-100">
              Comparing Version{" "}
              <span className="font-mono tracking-tight">V{oldVersion.versionNumber}</span> vs{" "}
              <span className="font-mono tracking-tight">V{newVersion.versionNumber}</span>
            </span>
          </div>

          <div className="flex items-center gap-2">
            {modifiedCount > 0 && (
              <Badge variant="warning" className="text-[10px] font-mono tabular-nums tracking-tight">
                {modifiedCount} Modified
              </Badge>
            )}
            {addedCount > 0 && (
              <Badge variant="success" className="text-[10px] font-mono tabular-nums tracking-tight">
                {addedCount} Added
              </Badge>
            )}
            <Badge variant="secondary" className="text-[10px] font-mono tabular-nums tracking-tight">
              {unchangedCount} Unchanged
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400 pt-2 border-t border-zinc-800/80">
          <div className="flex items-center gap-3 font-mono tabular-nums tracking-tight text-[10px]">
            <span>V{oldVersion.versionNumber}: {oldVersion.contentHash.slice(0, 12)}...</span>
            <span>→</span>
            <span>V{newVersion.versionNumber}: {newVersion.contentHash.slice(0, 12)}...</span>
          </div>

          <button
            type="button"
            onClick={() => setShowUnchanged(!showUnchanged)}
            className="text-emerald-400 hover:underline font-semibold cursor-pointer transition-all duration-200 active:scale-95"
          >
            {showUnchanged ? "Hide Unchanged Sections" : "Show All Sections"}
          </button>
        </div>
      </div>

      {/* Diff Cards */}
      <div className="space-y-3">
        {diffs
          .filter((d) => showUnchanged || d.type !== "unchanged")
          .map((diff) => {
            if (diff.type === "unchanged") {
              return (
                <div
                  key={diff.sectionId}
                  className="p-3 rounded-xl border border-zinc-800/70 bg-zinc-900/40 backdrop-blur-md text-xs flex items-center justify-between text-zinc-400"
                >
                  <span className="font-medium">
                    <span className="font-mono tracking-tight mr-1">{diff.sectionNumber}.</span>
                    {diff.title}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                    <CheckCircle2 className="h-3.5 w-3.5 text-zinc-500" />
                    Unchanged
                  </span>
                </div>
              );
            }

            if (diff.type === "added") {
              return (
                <div
                  key={diff.sectionId}
                  className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 backdrop-blur-md space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-100">
                      <span className="font-mono tracking-tight mr-1">{diff.sectionNumber}.</span>
                      {diff.title}
                    </span>
                    <Badge variant="success" className="text-[10px] gap-1">
                      <PlusCircle className="h-3 w-3" /> New Section Added
                    </Badge>
                  </div>
                  <pre className="p-3 rounded-lg bg-zinc-950/75 border border-emerald-500/20 text-[11px] text-zinc-200 font-sans whitespace-pre-line leading-relaxed">
                    {diff.newText}
                  </pre>
                </div>
              );
            }

            // Modified
            return (
              <div
                key={diff.sectionId}
                className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 backdrop-blur-md space-y-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-zinc-100">
                    <span className="font-mono tracking-tight mr-1">{diff.sectionNumber}.</span>
                    {diff.title}
                  </span>
                  <Badge variant="warning" className="text-[10px]">
                    Clause Modified
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Previous Version */}
                  <div className="p-3 rounded-lg bg-zinc-950/75 border border-rose-500/25 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-rose-400 flex items-center gap-1 font-mono tracking-tight">
                      <MinusCircle className="h-3 w-3" />
                      Prior (V{oldVersion.versionNumber})
                    </span>
                    <pre className="text-[11px] text-zinc-400 font-sans whitespace-pre-line leading-relaxed">
                      {diff.oldText}
                    </pre>
                  </div>

                  {/* New Version */}
                  <div className="p-3 rounded-lg bg-zinc-950/75 border border-emerald-500/25 space-y-1">
                    <span className="text-[10px] font-bold uppercase text-emerald-400 flex items-center gap-1 font-mono tracking-tight">
                      <PlusCircle className="h-3 w-3" />
                      Revised (V{newVersion.versionNumber})
                    </span>
                    <pre className="text-[11px] text-zinc-200 font-sans whitespace-pre-line leading-relaxed">
                      {diff.newText}
                    </pre>
                  </div>
                </div>
              </div>
            );
          })}

        {diffs.every((d) => d.type === "unchanged") && (
          <div className="p-8 text-center rounded-2xl border border-zinc-800/80 bg-zinc-950/70 backdrop-blur-xl space-y-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
            <h4 className="text-xs font-bold text-zinc-100">Identical Content Fingerprints</h4>
            <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">
              There are no text diffs between Version{" "}
              <span className="font-mono tracking-tight">{oldVersion.versionNumber}</span> and Version{" "}
              <span className="font-mono tracking-tight">{newVersion.versionNumber}</span>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

