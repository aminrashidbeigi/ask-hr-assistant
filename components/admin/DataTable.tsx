import type { ReactNode } from "react";

export function timeAgo(date: Date, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - date.getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export interface Column {
  head: string;
  align?: "right";
  /** share of the table width for long text columns */
  grow?: boolean;
}

export function DataTable({
  title,
  description,
  empty,
  columns,
  rows,
}: {
  title: string;
  description?: string;
  empty: ReactNode;
  columns: Column[];
  rows: ReactNode[][];
}) {
  return (
    <section className="flex flex-col rounded-2xl border bg-card shadow-xs">
      <header className="px-4 pt-4">
        <h2 className="text-sm font-medium">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </header>
      {rows.length === 0 ? (
        <p className="m-4 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-3 max-h-96 overflow-auto px-4 pb-3">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr>
                {columns.map((c) => (
                  <th key={c.head} className={`whitespace-nowrap py-2 pr-4 font-normal last:pr-0 ${c.align === "right" ? "text-right" : ""}`}>
                    {c.head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  {r.map((cell, j) => (
                    <td
                      key={j}
                      className={`py-2.5 pr-4 align-top last:pr-0 ${columns[j]?.align === "right" ? "text-right tabular-nums" : ""} ${
                        columns[j]?.grow ? "w-full min-w-48" : "whitespace-nowrap text-muted-foreground"
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
