"use client";

import { Fragment, type ReactNode } from "react";

const CITATION = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

/** Inline markup: **bold** and citation markers like [1] or [1, 2], rendered as clickable badges. */
function renderInline(text: string, onCite: (n: number) => void, activeN: number | null): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).flatMap((chunk, i) => {
    if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4) {
      return [<strong key={`b${i}`}>{chunk.slice(2, -2)}</strong>];
    }
    const out: ReactNode[] = [];
    let last = 0;
    for (const m of chunk.matchAll(CITATION)) {
      out.push(chunk.slice(last, m.index));
      m[1].split(",").forEach((raw, j) => {
        const n = Number(raw.trim());
        out.push(
          <button
            key={`c${i}-${m.index}-${j}`}
            type="button"
            onClick={() => onCite(n)}
            aria-label={`Source ${n}`}
            data-testid="citation"
            className={`mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md border px-1 align-baseline text-[11px] font-medium leading-none transition-colors ${
              activeN === n
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
          >
            [{n}]
          </button>,
        );
      });
      last = (m.index ?? 0) + m[0].length;
    }
    out.push(chunk.slice(last));
    return out.map((node, k) => <Fragment key={`${i}-${k}`}>{node}</Fragment>);
  });
}

/** Tiny markdown subset (paragraphs, bullet lists, bold) — enough for short policy answers. */
export function RichText({
  text,
  onCite,
  activeN,
}: {
  text: string;
  onCite: (n: number) => void;
  activeN: number | null;
}) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`ul${blocks.length}`} className="my-1 list-disc space-y-1 pl-5">
        {list.map((item, i) => (
          <li key={i}>{renderInline(item, onCite, activeN)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const line of text.split("\n")) {
    const bullet = /^\s*[*\-•]\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flushList();
    if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{renderInline(line, onCite, activeN)}</p>);
  }
  flushList();
  return <div className="space-y-2 leading-relaxed">{blocks}</div>;
}
