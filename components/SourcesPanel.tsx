"use client";

import { CheckIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Source } from "@/lib/agent/types";

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
    if (activeN === null) return;
    // wait a frame so the sheet's slide-in doesn't fight the scroll
    const id = requestAnimationFrame(() =>
      refs.current[activeN]?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
    );
    return () => cancelAnimationFrame(id);
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
    <ol className="space-y-2.5" data-testid="sources-list">
      {ordered.map((s) => {
        const cited = citedNumbers.has(s.n);
        return (
          <li
            key={s.id}
            ref={(el) => {
              refs.current[s.n] = el;
            }}
            onClick={() => onSelect(s.n)}
            className={`cursor-pointer rounded-2xl border p-3.5 text-sm transition-colors ${
              activeN === s.n ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "hover:bg-muted/60"
            } ${cited ? "" : "opacity-70"}`}
          >
            <div className="flex items-start gap-2.5">
              <span
                className={`mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  cited ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {s.n}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium leading-snug">{s.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span title={s.section}>{shortSection(s.section)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="rounded bg-muted px-1 font-mono text-[10px] font-medium uppercase" title={s.lang === "de" ? "Deutsch" : "English"}>
                    {s.lang}
                  </span>
                  {cited && (
                    <span className="inline-flex items-center gap-0.5 text-primary">
                      <CheckIcon className="size-3" /> cited
                    </span>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-2.5 line-clamp-5 text-[13px] leading-relaxed text-muted-foreground">
              {s.snippet.replace(/\*\*/g, "")}
            </p>
            <div className="mt-2 truncate font-mono text-[11px] text-muted-foreground/70">{s.url}</div>
          </li>
        );
      })}
    </ol>
  );
}
