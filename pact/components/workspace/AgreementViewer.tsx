"use strict";
import * as React from "react";
import { AgreementSection, AgreementItemOrigin } from "@/types/agreement";
import { Badge } from "@/components/ui/badge";
import {
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  FileText,
  Sparkles,
  Layers,
  Scale,
} from "lucide-react";

interface AgreementViewerProps {
  sections: AgreementSection[];
}

export function AgreementViewer({ sections }: AgreementViewerProps) {
  // Default first 3 sections open
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({
    scope_of_work: true,
    financial_milestones: true,
    delivery_timeline: true,
  });

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    sections.forEach((s) => (all[s.sectionId] = true));
    setOpenSections(all);
  };

  const collapseAll = () => {
    setOpenSections({});
  };

  const getOriginBadge = (origin: AgreementItemOrigin) => {
    switch (origin) {
      case "confirmed_term":
        return (
          <Badge
            variant="success"
            className="text-[10px] font-semibold gap-1 shrink-0"
          >
            <ShieldCheck className="h-3 w-3" />
            <span>Confirmed Term</span>
          </Badge>
        );
      case "agreed_contingency":
        return (
          <Badge
            variant="warning"
            className="text-[10px] font-semibold gap-1 shrink-0"
          >
            <Sparkles className="h-3 w-3" />
            <span>Agreed Contingency</span>
          </Badge>
        );
      case "standard_provision":
      default:
        return (
          <Badge
            variant="outline"
            className="text-[10px] text-zinc-400 border-zinc-800 bg-zinc-950/60 gap-1 shrink-0"
          >
            <Scale className="h-3 w-3" />
            <span>Standard Provision</span>
          </Badge>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Control bar */}
      <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
        <span className="flex items-center gap-1.5 font-medium">
          <Layers className="h-3.5 w-3.5 text-emerald-400" />
          13 Standard Contract Sections (
          <span className="font-mono tabular-nums tracking-tight text-zinc-200">
            {sections.length} Active
          </span>
          )
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={expandAll}
            className="hover:text-zinc-100 hover:underline cursor-pointer transition-all duration-200 active:scale-95"
          >
            Expand All
          </button>
          <span className="text-zinc-600">•</span>
          <button
            type="button"
            onClick={collapseAll}
            className="hover:text-zinc-100 hover:underline cursor-pointer transition-all duration-200 active:scale-95"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Accordion List */}
      <div className="space-y-3">
        {sections.map((section) => {
          const isOpen = Boolean(openSections[section.sectionId]);

          return (
            <div
              key={section.sectionId}
              className={`group relative overflow-hidden rounded-2xl border backdrop-blur-md transition-all duration-200 ${
                isOpen
                  ? "border-emerald-500/35 bg-zinc-900/60 shadow-lg shadow-black/20"
                  : "border-zinc-800/80 bg-zinc-900/45 hover:bg-zinc-900/60 hover:border-zinc-700"
              }`}
            >
              <div
                aria-hidden="true"
                className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent transition-opacity duration-200 ${
                  isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                }`}
              />

              {/* Accordion Header */}
              <button
                type="button"
                onClick={() => toggleSection(section.sectionId)}
                className="w-full flex items-center justify-between p-4 text-left cursor-pointer transition-all duration-200 active:scale-[0.995]"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono tabular-nums tracking-tight font-bold text-xs shrink-0">
                    {section.sectionNumber}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-100">
                      {section.title}
                    </h3>
                    <p className="text-[11px] text-zinc-400 line-clamp-1">
                      {section.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className="text-[10px] font-mono tabular-nums tracking-tight">
                    {section.items.length} {section.items.length === 1 ? "clause" : "clauses"}
                  </Badge>
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-zinc-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-zinc-400" />
                  )}
                </div>
              </button>

              {/* Accordion Body */}
              {isOpen && (
                <div className="px-4 pb-4 pt-2 space-y-3 border-t border-zinc-800/80">
                  {section.items.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3 rounded-xl bg-zinc-950/65 border border-zinc-800/80 space-y-1.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-zinc-100 flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-emerald-400" />
                          {item.title}
                        </span>
                        {getOriginBadge(item.origin)}
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-line">
                        {item.content}
                      </p>
                      {item.sourceSnippet && (
                        <div className="text-[10px] text-zinc-500 italic pt-1 border-t border-zinc-800/70">
                          Origin citation: &quot;{item.sourceSnippet}&quot;
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

