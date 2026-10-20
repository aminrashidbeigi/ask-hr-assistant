import { CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Sparkline } from "@/components/admin/Sparkline";

/** SLO chip: icon + text, never colour alone. */
function Slo({ ok, label }: { ok: boolean; label: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
      <CircleCheckIcon className="size-3.5" /> {label}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
      <TriangleAlertIcon className="size-3.5" /> {label}
    </span>
  );
}

export function Kpi({
  label,
  value,
  hint,
  slo,
  trend,
  icon,
  className = "",
}: {
  label: string;
  value: string;
  hint?: string;
  /** null = no data yet, so no verdict */
  slo?: { ok: boolean | null; target: string };
  trend?: (number | null)[];
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col rounded-2xl border bg-card p-3.5 shadow-xs sm:p-4 ${className}`}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2 text-2xl font-semibold sm:text-3xl tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 flex min-h-5 flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
        {slo && slo.ok !== null ? (
          <Slo ok={slo.ok} label={slo.ok ? `Within SLO ${slo.target}` : `Over SLO ${slo.target}`} />
        ) : slo ? (
          <span>SLO {slo.target}</span>
        ) : null}
        {hint && <span>{hint}</span>}
      </div>
      {trend && (
        <div className="mt-3">
          <Sparkline values={trend} />
        </div>
      )}
    </div>
  );
}
