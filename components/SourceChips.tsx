"use client";

import { FileTextIcon } from "lucide-react";
import type { Source } from "@/lib/agent/types";

/** Compact source row under an answer; every chip opens the sources sheet at that passage. */
export function SourceChips({
  sources,
  citedNumbers,
  onOpen,
}: {
  sources: Source[];
  citedNumbers: Set<number>;
  onOpen: (n: number | null) => void;
}) {
  const cited = sources.filter((s) => citedNumbers.has(s.n));
  const others = sources.length - cited.length;
  if (!sources.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="source-chips" aria-label="Sources · Quellen">
      {cited.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onOpen(s.n)}
          title={`${s.title} — ${s.section}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs transition-colors outline-none hover:border-primary/40 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="flex size-4 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
            {s.n}
          </span>
          <span className="truncate">{s.title}</span>
        </button>
      ))}
      {others > 0 && (
        <button
          type="button"
          onClick={() => onOpen(null)}
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <FileTextIcon className="size-3.5" />
          {cited.length ? `+${others} more · weitere` : `${others} passages · Textstellen`}
        </button>
      )}
    </div>
  );
}
