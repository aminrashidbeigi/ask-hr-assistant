import type { Metadata } from "next";
import {
  getDaily,
  getKpis,
  getLatestNegativeFeedback,
  getMostRetrievedDocuments,
  getTopUnanswered,
  type DailyPoint,
} from "@/lib/metrics/queries";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ask HR — Metrics", robots: { index: false } };

const pct = (v: number | null) => (v === null ? "–" : `${(v * 100).toFixed(v < 0.1 && v > 0 ? 1 : 0)} %`);
const secs = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toFixed(1)} s`);
const usd = (v: number) => `$${v.toFixed(v < 1 ? 4 : 2)}`;

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Single-series bar chart, server-rendered: thin rounded bars, recessive baseline, native tooltips. */
function BarChart({
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
  return (
    <figure className="rounded-xl border bg-card p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">
          peak {format(max || null)} · today {format(last?.value ?? null)}
        </span>
      </figcaption>
      <div className="mt-3 flex h-28 items-end gap-0.5 border-b" role="img" aria-label={`${title}, last ${points.length} days`}>
        {points.map((p) => (
          <div key={p.label} className="group relative flex h-full flex-1 items-end" title={`${p.label}: ${format(p.value)}`}>
            <div
              className="w-full rounded-t-[3px] bg-primary/80 transition-colors group-hover:bg-primary"
              style={{ height: `${max ? Math.max(((p.value ?? 0) / max) * 100, p.value ? 3 : 0) : 0}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>{points[0]?.label.slice(5)}</span>
        <span>{last?.label.slice(5)}</span>
      </div>
      <details className="mt-2 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Table view</summary>
        <table className="mt-1 w-full">
          <tbody>
            {points.map((p) => (
              <tr key={p.label}>
                <td>{p.label}</td>
                <td className="text-right tabular-nums">{format(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

function Table({ title, empty, head, rows }: { title: string; empty: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h2 className="text-sm font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                {head.map((h) => (
                  <th key={h} className="pb-1 pr-4 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  {r.map((c, j) => (
                    <td key={j} className="py-1.5 pr-4 align-top">
                      {c}
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

export default async function AdminPage() {
  const [k, daily, unanswered, docs, negative] = await Promise.all([
    getKpis(),
    getDaily(),
    getTopUnanswered(),
    getMostRetrievedDocuments(),
    getLatestNegativeFeedback(),
  ]);
  const series = (pick: (d: DailyPoint) => number | null) => daily.map((d) => ({ label: d.day, value: pick(d) }));

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Ask HR — metrics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Data is pseudonymous: no user identity is stored. Questions are PII-redacted before they are logged. Rates and
          latencies cover the last 7 days.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Key figures">
        <Kpi label="Questions (24 h)" value={String(k.questions24h)} hint={`${k.questions7d} in 7 days`} />
        <Kpi label="Refusal rate" value={pct(k.refusalRate)} hint="share the assistant could not answer" />
        <Kpi label="Escalation rate" value={pct(k.escalationRate)} hint="forwarded to HR" />
        <Kpi label="👍 ratio" value={pct(k.thumbsUpRatio)} hint={`${k.feedbackCount} ratings`} />
        <Kpi label="Latency p95" value={secs(k.latencyP95Ms)} hint="SLO < 8 s" />
        <Kpi label="Time to first token p50" value={secs(k.ttftP50Ms)} />
        <Kpi label="Cost today / 7 days" value={`${usd(k.costToday)} / ${usd(k.cost7d)}`} hint="free-tier models cost 0" />
        <Kpi label="Error rate" value={pct(k.errorRate)} hint="SLO < 2 %" />
      </section>

      <section className="grid gap-3 lg:grid-cols-3" aria-label="Trends">
        <BarChart title="Questions per day" points={series((d) => d.questions)} format={(v) => (v === null ? "–" : String(v))} />
        <BarChart title="Refusal rate per day" points={series((d) => d.refusalRate)} format={pct} />
        <BarChart title="Cost per day" points={series((d) => d.cost)} format={(v) => (v === null ? "–" : usd(v))} />
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <Table
          title="Top unanswered questions — content gaps for HR (30 days)"
          empty="No unanswered questions yet."
          head={["Question (redacted)", "Times", "Last asked"]}
          rows={unanswered.map((u) => [u.question, u.count, u.lastAsked.toISOString().slice(0, 16).replace("T", " ")])}
        />
        <Table
          title="Most retrieved documents (30 days)"
          empty="No retrievals yet."
          head={["Document", "Retrievals"]}
          rows={docs.map((d) => [d.title, d.retrievals])}
        />
      </div>

      <Table
        title="Latest 👎 feedback"
        empty="No negative feedback yet."
        head={["Question (redacted)", "Comment (redacted)", "When"]}
        rows={negative.map((f) => [f.question, f.comment ?? "–", f.createdAt.toISOString().slice(0, 16).replace("T", " ")])}
      />
    </main>
  );
}
