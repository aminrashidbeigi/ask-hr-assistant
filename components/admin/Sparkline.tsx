/** Tiny server-rendered trend line for KPI cards (decorative; the bar charts below carry the details). */
export function Sparkline({ values }: { values: (number | null)[] }) {
  const pts = values.map((v) => v ?? 0);
  const max = Math.max(...pts, 0);
  if (pts.length < 2 || max === 0) return <div className="h-8" aria-hidden="true" />;
  const step = 100 / (pts.length - 1);
  const y = (v: number) => 26 - (v / max) * 24;
  const line = pts.map((v, i) => `${(i * step).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-8 w-full overflow-visible" aria-hidden="true">
      <polygon points={`0,28 ${line} 100,28`} className="fill-primary/10" />
      <polyline
        points={line}
        fill="none"
        className="stroke-primary"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
