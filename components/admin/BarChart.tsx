/** Single-series bar chart, server-rendered: thin rounded bars on a recessive baseline, hover/focus tooltips, table view. */
export function BarChart({
  title,
  points,
  format,
}: {
  title: string;
  points: { label: string; value: number | null }[];
  format: (v: number | null) => string;
}) {
  const max = Math.max(0, ...points.map((p) => p.value ?? 0));
  const last = points.at(-1);
  const empty = max === 0;
  return (
    <figure className="rounded-2xl border bg-card p-4 shadow-xs">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">
          peak <span className="tabular-nums text-foreground">{format(max || null)}</span> · today{" "}
          <span className="tabular-nums text-foreground">{format(last?.value ?? null)}</span>
        </span>
      </figcaption>
      <div className="relative mt-4">
        <div
          className="flex h-32 items-end gap-[3px] border-b-2 border-border"
          role="img"
          aria-label={`${title}, last ${points.length} days`}
        >
          {points.map((p, i) => {
            const h = max ? Math.max(((p.value ?? 0) / max) * 100, p.value ? 4 : 0) : 0;
            return (
              <div key={p.label} tabIndex={0} className="group relative flex h-full flex-1 items-end outline-none">
                <div
                  className={`w-full rounded-t-[4px] transition-colors ${
                    i === points.length - 1 ? "bg-primary" : "bg-primary/70"
                  } group-hover:bg-primary group-focus-visible:bg-primary`}
                  style={{ height: `${h}%` }}
                />
                <span
                  className={`pointer-events-none absolute bottom-full z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border bg-popover px-2 py-1 text-xs shadow-md group-hover:block group-focus-visible:block ${
                    i < 2 ? "left-0 translate-x-0" : i > points.length - 3 ? "right-0 left-auto translate-x-0" : "left-1/2"
                  }`}
                >
                  <span className="text-muted-foreground">{p.label.slice(5)}</span>{" "}
                  <span className="font-medium tabular-nums">{format(p.value)}</span>
                </span>
              </div>
            );
          })}
        </div>
        {empty && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center pb-2 text-xs text-muted-foreground">
            No data yet
          </div>
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
        <span>{points[0]?.label.slice(5)}</span>
        <span>{last?.label.slice(5)}</span>
      </div>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="w-fit cursor-pointer rounded select-none hover:text-foreground">Table view</summary>
        <table className="mt-1.5 w-full">
          <tbody>
            {points.map((p) => (
              <tr key={p.label} className="border-t first:border-t-0">
                <td className="py-0.5">{p.label}</td>
                <td className="py-0.5 text-right tabular-nums">{format(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
