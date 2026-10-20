import { ArrowLeftIcon, CoinsIcon, MessageSquareIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart } from "@/components/admin/BarChart";
import { DataTable, timeAgo } from "@/components/admin/DataTable";
import { Kpi } from "@/components/admin/Kpi";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
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
const iso = (d: Date) => d.toISOString().slice(0, 16).replace("T", " ");

/** Question text with the full string available on hover (cells stay compact). */
const Q = ({ text }: { text: string }) => (
  <span className="line-clamp-2 text-foreground" title={text}>
    {text}
  </span>
);

export default async function AdminPage() {
  const [k, daily, unanswered, docs, negative] = await Promise.all([
    getKpis(),
    getDaily(),
    getTopUnanswered(),
    getMostRetrievedDocuments(),
    getLatestNegativeFeedback(),
  ]);
  const series = (pick: (d: DailyPoint) => number | null) => daily.map((d) => ({ label: d.day, value: pick(d) }));
  const maxRetrievals = Math.max(1, ...docs.map((d) => d.retrievals));

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <Logo className="size-7" />
            <h1 className="text-[15px] font-semibold">Ask HR — metrics</h1>
          </div>
          <div className="flex items-center gap-1">
            <Link
              href="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ArrowLeftIcon className="size-4" /> Chat
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Data is pseudonymous: no user identity is stored. Questions are PII-redacted before they are logged. Rates and
          latencies cover the last 7 days; trends the last 14.
        </p>

        <section className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-label="Key figures">
          <Kpi
            label="Questions (24 h)"
            value={String(k.questions24h)}
            hint={`${k.questions7d} in 7 days`}
            trend={daily.map((d) => d.questions)}
            icon={<MessageSquareIcon className="size-4" />}
          />
          <Kpi label="Refusal rate" value={pct(k.refusalRate)} hint="could not answer" trend={daily.map((d) => d.refusalRate)} />
          <Kpi label="Escalation rate" value={pct(k.escalationRate)} hint="forwarded to HR" />
          <Kpi label="Helpful ratio" value={pct(k.thumbsUpRatio)} hint={`${k.feedbackCount} ratings`} />
          <Kpi
            label="Latency p95"
            value={secs(k.latencyP95Ms)}
            slo={{ ok: k.latencyP95Ms === null ? null : k.latencyP95Ms < 8000, target: "< 8 s" }}
          />
          <Kpi label="Time to first token p50" value={secs(k.ttftP50Ms)} />
          <Kpi
            className="col-span-2 xl:col-span-1"
            label="Cost today / 7 days"
            value={`${usd(k.costToday)} / ${usd(k.cost7d)}`}
            hint="free-tier models cost 0"
            trend={daily.map((d) => d.cost)}
            icon={<CoinsIcon className="size-4" />}
          />
          <Kpi
            label="Error rate"
            value={pct(k.errorRate)}
            slo={{ ok: k.errorRate === null ? null : k.errorRate < 0.02, target: "< 2 %" }}
          />
        </section>

        <section className="grid gap-3 lg:grid-cols-3" aria-label="Trends">
          <BarChart title="Questions per day" points={series((d) => d.questions)} format={(v) => (v === null ? "–" : String(v))} />
          <BarChart title="Refusal rate per day" points={series((d) => d.refusalRate)} format={pct} />
          <BarChart title="Cost per day" points={series((d) => d.cost)} format={(v) => (v === null ? "–" : usd(v))} />
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <DataTable
            title="Top unanswered questions"
            description="Content gaps for HR · last 30 days"
            empty="No unanswered questions yet — nothing for HR to add."
            columns={[{ head: "Question (redacted)", grow: true }, { head: "Times", align: "right" }, { head: "Last asked" }]}
            rows={unanswered.map((u) => [
              <Q key="q" text={u.question} />,
              u.count,
              <span key="t" title={iso(u.lastAsked)}>
                {timeAgo(u.lastAsked)}
              </span>,
            ])}
          />
          <DataTable
            title="Most retrieved documents"
            description="Last 30 days"
            empty="No retrievals yet."
            columns={[{ head: "Document", grow: true }, { head: "Retrievals", align: "right" }]}
            rows={docs.map((d) => [
              <div key="d" className="space-y-1.5">
                <span className="text-foreground">{d.title}</span>
                <div className="h-1.5 w-full rounded-full bg-muted" aria-hidden="true">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: `${(d.retrievals / maxRetrievals) * 100}%` }} />
                </div>
              </div>,
              <span key="n" className="text-foreground">
                {d.retrievals}
              </span>,
            ])}
          />
        </div>

        <DataTable
          title="Latest negative feedback"
          description="Thumbs-down ratings with the question that triggered them"
          empty="No negative feedback yet."
          columns={[{ head: "Question (redacted)", grow: true }, { head: "Comment (redacted)", grow: true }, { head: "When" }]}
          rows={negative.map((f) => [
            <Q key="q" text={f.question} />,
            <span key="c" className="line-clamp-2 text-foreground" title={f.comment ?? undefined}>
              {f.comment ?? "–"}
            </span>,
            <span key="t" title={iso(f.createdAt)}>
              {timeAgo(f.createdAt)}
            </span>,
          ])}
        />
      </main>
    </div>
  );
}
