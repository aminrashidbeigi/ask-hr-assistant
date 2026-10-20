"use client";

import { Fragment, type ReactNode } from "react";

const CITATION = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
const INLINE = /(\*\*[^*]+\*\*|HR-\d{4}-\d{4})/g;

/** Inline markup: **bold**, HR ticket ids and citation markers like [1] or [1, 2], rendered as clickable pills. */
function renderInline(text: string, onCite: (n: number) => void, activeN: number | null): ReactNode[] {
  return text.split(INLINE).flatMap((chunk, i) => {
    if (chunk.startsWith("**") && chunk.endsWith("**") && chunk.length > 4) {
      return [<strong key={`b${i}`}>{chunk.slice(2, -2)}</strong>];
    }
    if (/^HR-\d{4}-\d{4}$/.test(chunk)) {
      return [
        <code key={`t${i}`} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[0.85em] font-medium">
          {chunk}
        </code>,
      ];
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
            className={`mx-0.5 inline-flex h-[18px] min-w-[18px] -translate-y-px items-center justify-center rounded-full px-1 align-middle text-[11px] font-semibold leading-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              activeN === n
                ? "bg-primary text-primary-foreground"
                : "bg-primary/12 text-primary hover:bg-primary hover:text-primary-foreground"
            }`}
          >
            {n}
          </button>,
        );
      });
      last = (m.index ?? 0) + m[0].length;
    }
    out.push(chunk.slice(last));
    return out.map((node, k) => <Fragment key={`${i}-${k}`}>{node}</Fragment>);
  });
}

/** Tiny markdown subset (headings, paragraphs, bullet and numbered lists, bold) — enough for short policy answers. */
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
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushList = () => {
    if (!list) return;
    const { ordered, items } = list;
    const Tag = ordered ? "ol" : "ul";
    blocks.push(
      <Tag
        key={`l${blocks.length}`}
        className={`space-y-1.5 pl-5 marker:text-muted-foreground ${ordered ? "list-decimal" : "list-disc"}`}
      >
        {items.map((item, i) => (
          <li key={i} className="pl-1">
            {renderInline(item, onCite, activeN)}
          </li>
        ))}
      </Tag>,
    );
    list = null;
  };
  for (const line of text.split("\n")) {
    const bullet = /^\s*[*\-•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      const ordered = !bullet;
      if (list && list.ordered !== ordered) flushList();
      list ??= { ordered, items: [] };
      list.items.push(item[1]);
      continue;
    }
    flushList();
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <h3 key={`h${blocks.length}`} className="pt-1 text-[15px] font-semibold">
          {renderInline(heading[1], onCite, activeN)}
        </h3>,
      );
    } else if (line.trim()) {
      blocks.push(<p key={`p${blocks.length}`}>{renderInline(line, onCite, activeN)}</p>);
    }
  }
  flushList();
  return <div className="space-y-3 leading-7">{blocks}</div>;
}
