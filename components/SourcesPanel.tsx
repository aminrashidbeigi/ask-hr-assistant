"use client";

import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import type { Source } from "@/lib/agent/types";

const FLAG: Record<string, string> = { de: "🇩🇪", en: "🇬🇧" };

/** "Overview + Allowances + Contact" → "Overview": merged-section labels are shortened for display. */
const shortSection = (section: string) => section.split(" + ")[0];

export function SourcesPanel({
  sources,
  citedNumbers,
  activeN,
  onSelect,
}: {
  sources: Source[];
  citedNumbers: Set<number>;
  activeN: number | null;
  onSelect: (n: number) => void;
}) {
  const refs = useRef<Record<number, HTMLLIElement | null>>({});

  useEffect(() => {
    if (activeN !== null) refs.current[activeN]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeN]);

  if (!sources.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Sources appear here when the assistant answers from the policies.
        <br />
        Quellen erscheinen hier, sobald der Assistent aus den Richtlinien antwortet.
      </p>
    );
  }

  // cited sources first, then the other retrieved passages
  const ordered = [...sources].sort(
    (a, b) => Number(citedNumbers.has(b.n)) - Number(citedNumbers.has(a.n)) || a.n - b.n,
  );

  return (
    <ol className="space-y-2" data-testid="sources-list">
      {ordered.map((s) => {
        const cited = citedNumbers.has(s.n);
        return (
          <li
            key={s.id}
            ref={(el) => {
              refs.current[s.n] = el;
            }}
            onClick={() => onSelect(s.n)}
            className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${
              activeN === s.n ? "border-primary bg-accent" : "hover:bg-muted/60"
            } ${cited ? "" : "opacity-70"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium leading-snug">
                [{s.n}] {s.title}
              </div>
              <span title={s.lang === "de" ? "Deutsch" : "English"} aria-label={s.lang}>
                {FLAG[s.lang] ?? s.lang}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span title={s.section}>{shortSection(s.section)}</span>
              {cited && <Badge variant="secondary">cited</Badge>}
            </div>
            <p className="mt-2 line-clamp-4 text-xs text-muted-foreground">{s.snippet.replace(/\*\*/g, "")}</p>
            <div className="mt-2 text-xs text-muted-foreground/80">{s.url}</div>
          </li>
        );
      })}
    </ol>
  );
}
