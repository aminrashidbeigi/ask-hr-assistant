# Ask HR — bilingual HR policy assistant

**RAG + tool-calling agent that answers HR policy questions in German or English, only from official documents, with citations — and ships with an evaluation harness and production monitoring.**

Built with the Vercel AI SDK, Postgres + pgvector, Next.js and Langfuse.

> **Live demo:** _set after deploying — see [Deploy](#deploy)_ · **Eval report:** [eval/reports/latest.md](eval/reports/latest.md)

![Ask HR chat UI](docs/screenshots/home-empty.png)

<!-- Replace with docs/screenshots/chat-sources.png once generated: node scripts/screenshots.mjs chat -->

<!-- DEMO_GIF -->

> **All policy documents are synthetic.** They describe a fictional company, "Voltwerk Manufacturing GmbH". No real company's internal data is used anywhere in this repository.

---

## The problem

A large manufacturing site has thousands of employees: shift workers on the production line and office staff, many of whom are not native German speakers. HR policies live in long PDFs and works agreements (*Betriebsvereinbarungen*). Employees ask HR the same questions again and again — *"How many vacation days do I get?"*, *"How is the night-shift allowance calculated?"*, *"Who do I notify when I'm sick?"*. This ties up HR business partners, and employees wait days for answers.

## The solution

A chat assistant that

- answers in **German or English**, **only from the official policy documents**, with **citations** you can click;
- **refuses and escalates** instead of guessing when it cannot ground an answer;
- **filters content by employee group** (shift vs. office) in the retrieval layer;
- ships with an **evaluation harness** and **production monitoring**, so quality, cost and content gaps are measurable.

## Features

- Streaming answers with inline `[n]` citation badges and a sources panel (title, section, language, snippet, link)
- Hybrid retrieval: pgvector cosine + Postgres full-text, fused with Reciprocal Rank Fusion, persona filter and a relevance threshold
- Tool-calling agent (`searchPolicies`, `escalateToHR`) with a forced first search — the model cannot answer from its own knowledge
- Prompt-injection defence (retrieved text is treated as data; a poisoned policy document is part of the test corpus)
- PII redaction before the LLM and before logs; pseudonymous session ids; 90-day log retention job
- Rate limiting (Upstash, in-memory fallback), daily budget guard, provider failover
- 👍/👎 feedback with comments, sent to Postgres and as a Langfuse score
- `/admin` dashboard: KPIs, trends, **top unanswered questions** (the content-gap report for HR)
- `/api/health`, uptime workflow, nightly eval workflow with a quality gate
- Runs on Vercel + Neon, or fully local with `docker compose`

## Architecture

```mermaid
flowchart LR
  U[Employee<br/>Browser] -->|question + persona| API[/api/chat<br/>Next.js route/]
  API --> RL[Rate limit<br/>Upstash]
  API --> PII[PII redaction]
  PII --> AG[Agent loop<br/>Vercel AI SDK streamText]
  AG -->|tool: searchPolicies| RET[Hybrid retriever]
  RET --> VEC[(pgvector)]
  RET --> FTS[(Postgres FTS)]
  RET --> RRF[RRF fusion + persona filter + threshold]
  AG -->|tool: escalateToHR| ESC[HR ticket stub]
  AG --> LLM[(LLM provider)]
  AG -->|stream answer + citations| U
  AG -. OTel traces .-> LF[Langfuse]
  API -. redacted log .-> QL[(query_logs)]
  U -->|thumbs up/down| FB[/api/feedback/] --> QL & LF
  ING[Ingestion script] -->|chunk, hash, embed| VEC
  EV[Eval harness] --> API
  ADM[/admin dashboard/] --> QL
```

A PNG export for slides is in [`docs/architecture.png`](docs/architecture.png). The eval harness runs the same agent core (`lib/agent/run.ts`) in-process, so it measures exactly what the API serves.

**Request flow**

1. The client sends `{ messages, persona: "shift" | "office" | "all", sessionId }`.
2. Rate-limit check → budget guard → zod validation → PII redaction of user text. History is untrusted input: only plain text of the last 10 messages is kept, so nobody can smuggle in fake tool results.
3. `streamText` runs with the system prompt and two tools, at most 4 steps. **Step 1 is forced to call `searchPolicies`.**
4. The retriever embeds the query, runs vector and keyword search (both filtered by the persona's audience), fuses them with RRF and returns the top-k chunks.
5. If the best vector distance is above `MAX_VECTOR_DISTANCE` (or the fused score is below `MIN_RELEVANCE`), the tool returns `found: false`; the prompt then requires a plain "I couldn't find this in the HR policies" plus an offer to escalate.
6. The answer streams back with `[n]` citations; the sources arrive as a data part for the side panel.
7. On finish a redacted row (latency, TTFT, tokens, cost, chunk ids, refused/escalated flags, model, prompt version, trace id) goes to `query_logs`; the OpenTelemetry trace goes to Langfuse.

## Evaluation

The golden set has **36 questions**: 14 factual (7 EN / 7 DE), 4 cross-lingual, 4 persona-dependent (same question, different answer per group), 4 multi-hop, 6 unanswerable, 2 prompt-injection probes, 2 PII probes. Retrieval metrics are computed directly from the retriever; answer quality uses an LLM judge (correctness + per-claim faithfulness); citation validity, refusal accuracy, injection resistance and PII handling are rule-based.

<!-- EVAL:START -->
#### Retrieval only (no LLM calls): vector-only vs hybrid

**golden set (36 questions)**

| Mode | Doc Recall@6 | Doc MRR | Chunk Recall@1 | Chunk Recall@3 | Chunk Recall@6 | Chunk MRR |
| --- | --- | --- | --- | --- | --- | --- |
| vector | 100 % | 1.000 | 77 % | 100 % | 100 % | 0.878 |
| hybrid | 100 % | 1.000 | 77 % | 100 % | 100 % | 0.878 |

**keyword stress set (exact policy terms)**

| Mode | Doc Recall@6 | Doc MRR | Chunk Recall@1 | Chunk Recall@3 | Chunk Recall@6 | Chunk MRR |
| --- | --- | --- | --- | --- | --- | --- |
| vector | 100 % | 0.975 | 90 % | 95 % | 95 % | 0.925 |
| hybrid | 100 % | 0.967 | 90 % | 95 % | 95 % | 0.917 |

Threshold sweep for the "found" decision: Best accuracy 97 % for max distance in [0.32, 0.33] → suggested MAX_VECTOR_DISTANCE=0.33. Best vector distance: answerable 0.222 – 0.311, unanswerable 0.305 – 0.461

#### End-to-end (hybrid retrieval, prompt v1, chat `gemini-3.5-flash-lite (fallback none)`, judge `gemini-3.5-flash-lite`, 36 (full golden set))

| Metric | Value |
| --- | --- |
| Overall pass rate | 97 % (35/36) |
| Retrieval Recall@6 | 100 % (n=30) |
| Retrieval MRR | 1.000 |
| Chunk Recall@3 / @6 (answer-bearing chunk) | 100 % / 100 % (n=30) |
| Chunk MRR | 0.878 |
| Answer correctness (LLM judge) | 97 % (n=29) |
| Faithfulness / groundedness | 100 % |
| Citation validity | 98 % |
| Answers with citations | 100 % |
| Refusal accuracy | 97 % |
| False-refusal rate (answerable refused) | 0 % |
| False-answer rate (unanswerable answered) | 0 % |
| Injection resistance | 100 % |
| PII handling | 50 % |
| Answer language matches question | 100 % |

| Metric | Value |
| --- | --- |
| Latency p50 / p95 | 5.3 s / 23.5 s |
| TTFT p50 / p95 | 4.9 s / 23.2 s |
| Avg tokens in / out | 2400 / 100 |
| Cost per query (price table, free tier = 0) | $0.00000 |
| Same tokens at gpt-4o-mini list price | $0.00042 |
| Failovers to the fallback model | 0 |
| Agent errors / judge errors | 0 / 0 |

#### Vector-only vs hybrid, end to end

_Not yet run — needs LLM quota:_ `pnpm eval --mode vector --tag vector && pnpm eval --mode hybrid --tag hybrid && pnpm eval:compare && pnpm eval:readme`.
<!-- EVAL:END -->

Reports: [`eval/reports/latest.md`](eval/reports/latest.md) (full run, with failures and reasons), [`eval/reports/comparison.md`](eval/reports/comparison.md), [`eval/reports/retrieval-latest.md`](eval/reports/retrieval-latest.md).

**What the evaluation showed — including the unflattering parts**

- **Hybrid did not beat vector-only on this corpus.** With 62 chunks per language and Gemini embeddings, both modes reach 100 % document recall and the same chunk-level recall on the golden set; on the exact-term stress set hybrid is marginally *lower* in MRR (0.917 vs 0.925). The per-question rank differences cancel out. I kept hybrid because it is cheap and protects exact identifiers as the corpus grows, but I would not claim a measured gain here. The end-to-end vector-vs-hybrid run needs LLM quota (see the free-tier note below) and is the first thing to run when quota is available.
- **The refusal threshold has a narrow margin.** Best vector distance is 0.222–0.311 for answerable questions and 0.305–0.461 for unanswerable ones; they overlap slightly. `MAX_VECTOR_DISTANCE=0.33` gave 0 % false refusals on this set; the LLM acts as a second safety net for the unanswerable question that still passes the gate.
- **Evaluating found bugs in my own harness and agent, not only in the model:** the judge initially marked correct persona answers "incomplete" because it did not know the employee group (fixed); my refusal detector flagged correct answers that merely offered HR contact (refusal is now "no successful search" or refusal wording *without* citations); and the model answered an off-topic question ("capital of France") from its own knowledge without searching, which is why the first step now *forces* `searchPolicies`.
- **Open issue, fixed but not yet re-measured:** the run above (prompt `v1`) failed one item — a question containing an employee id and IBAN was treated as a personal case and declined. Prompt `v2` adds the rule that personal details in a message do not make it a personal question. `v2` is what ships, but its eval run was blocked by the daily free-tier quota; re-run `pnpm eval` to confirm it.
- **Latency does not meet the SLO on the free fallback model.** p95 is 23.5 s with `gemini-3.5-flash-lite` (p50 5.3 s); the fast `gemini-2.5-flash` answers in about 2 s but allows only a handful of requests per day on the free tier. The p95 < 8 s SLO needs a paid or EU-hosted model.
- **Caveats:** 36 questions is a small set; the LLM judge is from the same model family as the chat model (quota constraint), which can flatter scores; the eval ran at prompt `v1`; free-tier availability varies run to run (an earlier run of the same set passed 36/36).

```bash
pnpm eval                      # full golden set, writes eval/reports/<timestamp>.{md,json} and latest.md
pnpm eval --subset 12          # stratified subset (nightly job)
pnpm eval --mode vector --tag vector && pnpm eval --mode hybrid --tag hybrid && pnpm eval:compare
pnpm eval --retrieval-only     # retrieval metrics for both modes + threshold sweep, no chat or judge calls
```

## Monitoring

| Chat → Langfuse trace | Admin dashboard |
| --- | --- |
| _add a screenshot of a trace to `docs/screenshots/langfuse-trace.png` after connecting Langfuse_ | ![Admin dashboard](docs/screenshots/admin.png) |

- **Tracing:** each chat request is one trace — the LLM generations (tokens, cost), the tool calls and a custom `rag.retrieve` span (query length, k, persona, top score, latency), tagged with session id, persona and prompt version. Spans are exported with `@langfuse/otel`; `instrumentation.ts` registers the AI SDK v7 `@ai-sdk/otel` integration.
- **Logs:** pino JSON with the trace id on every line; raw user text is never logged (redacted only).
- **`/admin`** (basic auth): questions 24 h/7 d, refusal and escalation rate, 👍 ratio, p95 latency, TTFT p50, cost today/7 d, error rate; daily volume, refusal-rate and cost charts; top unanswered questions; most-retrieved documents; latest 👎 comments. Data is pseudonymous.
- **SLOs:** availability 99 %, p95 latency < 8 s, error rate < 2 %, refusal rate on answerable questions < 10 %.
- **Alerting (cheap parts):** [`uptime.yml`](.github/workflows/uptime.yml) calls `/api/health` every 30 minutes and fails (→ email) when unhealthy; the budget guard doubles as a cost alert and logs a warning at 80 %; [`eval.yml`](.github/workflows/eval.yml) runs a nightly 12-question eval and fails below 80 % correctness or refusal accuracy, which catches model or provider drift.

## Design decisions and trade-offs

| Decision | Why |
| --- | --- |
| **Hybrid retrieval (vector + full-text, RRF)** | Policy language has exact terms (*Nachtzuschlag*, *eAU*, *§ 5*) that embeddings can blur. Measured result on this small corpus: see the evaluation notes above — I report the numbers I got, including that hybrid did not beat vector-only here. It is kept because it costs almost nothing and protects exact-term lookups as the corpus grows. |
| **Postgres + pgvector, not a dedicated vector DB** | One database for vectors, full-text search, logs and feedback; trivial to self-host (on-prem story); at this scale HNSW is plenty. |
| **Tool-calling agent, not a fixed pipeline** | The model decides what to search for (and can search twice for multi-topic questions or escalate), but step 1 is *forced* to be a search, so grounding is guaranteed. A fixed pipeline cannot escalate or refine queries. |
| **Refusal threshold on vector distance** | RRF scores are rank-based and say little about absolute relevance; cosine distance separates in-scope from out-of-scope questions. Threshold chosen from a sweep over the golden set (see report), with the LLM as a second safety net. |
| **Context headers on chunks** (`{title} — {section}`) | Short policy chunks lose their topic without it; contextual chunking improved retrieval in practice. Chunks follow headings (≈50–210 tokens here) instead of a fixed 300–500-token window because the sections are short and merging them blurred citations. |
| **Persona filter in the retrieval layer** | It is access control, not prompt politeness: a shift-only chunk can never reach an office employee's prompt, whatever the model is told. In production the persona comes from SSO / HR master data, not a dropdown. |
| **Incremental, hash-based ingestion** | Re-embed only changed chunks (document hash → chunk hash), delete orphans, print a summary. Cheap, reproducible re-indexing — the same discipline as production LLM labelling pipelines. |
| **Provider-agnostic models** | `CHAT_PROVIDER`/`CHAT_MODEL` env switch (Gemini, OpenAI) with automatic failover to a fallback model on quota/overload errors. Embeddings are stored as 1536 dims whatever the provider. |

### A note on free tiers

The demo is built to run at zero cost, which shaped some choices: Gemini's free tier has per-minute *and* daily request caps per model (e.g. 5/min and a small daily cap on the 2.5/3.5 flash models, 15/min on flash-lite), so chat uses a fast primary model with failover to a slower fallback, thinking is switched off or minimal (it added 8–17 s per call), and the eval is paced. A production deployment would use a paid tier or an EU-hosted model (for example Azure OpenAI in an EU region); the provider switch is a few lines in `lib/ai/models.ts`.

## Responsible AI and compliance (Germany / EU)

- **GDPR.** Data minimisation: no user identity is stored; the session id is a random, client-generated value. PII is redacted (email, phone, IBAN, tax id, employee id, date of birth) before text reaches the LLM *and* before it is logged. Retention: `pnpm retention` (scheduled weekly) deletes `query_logs` older than 90 days; feedback cascades. EU hosting is possible (Neon Frankfurt, Vercel `fra1`); the model provider is swappable for an EU-hosted or self-hosted one. Note that free-tier model plans may use prompts for training — acceptable for synthetic data, not for real HR data.
- **EU AI Act.** AI systems used for employment decisions (recruitment, promotion/termination, task allocation, performance monitoring) are high-risk under Annex III. This assistant only *informs* employees about policies and makes no decisions about them, so it is designed to stay outside that category. It still follows the transparency duty: the UI states that users are talking to an AI. Adding features such as performance evaluation would change the classification.
- **Works council (Betriebsrat).** Technical systems that can monitor employee behaviour or performance are subject to co-determination (§ 87(1) No. 6 BetrVG). That is why logs are pseudonymous and the dashboard shows aggregate metrics only; the works council contact is part of the policy corpus.
- **Known limitations:** regex-based PII detection is a baseline (production should add an NER detector such as Presidio); the golden set is small (36 questions) and the corpus synthetic; the judge model in the reported run is from the same family as the chat model (free-tier quota constraints), which can flatter scores; no SSO; the HR ticket is a stub.

## Run locally

Requirements: Node 22+, pnpm, and a Postgres with pgvector (Neon, or Docker).

```bash
pnpm install
cp .env.example .env.local        # fill in DATABASE_URL and a model key
pnpm db:migrate
pnpm ingest                       # idempotent; --force re-embeds everything
pnpm dev                          # http://localhost:3000
pnpm try "Wie hoch ist der Nachtzuschlag?" --persona shift   # inspect retrieval
pnpm test                         # unit tests (RUN_INTEGRATION=1 adds DB integration tests)
pnpm e2e                          # Playwright smoke test (needs ingested DB + model key)
```

### Run fully locally (Docker)

```bash
docker compose up -d db                              # pgvector/pgvector:pg16 on :5432
export DATABASE_URL=postgres://askhr:askhr@localhost:5432/askhr
pnpm db:migrate && pnpm ingest                       # EMBEDDING_PROVIDER=mock works without any API key
docker compose up --build app                        # http://localhost:3000
```

The app container reads model settings from a `.env` file next to `docker-compose.yml` (Compose loads it automatically; it is git-ignored). For real answers add, for example:

```bash
GOOGLE_GENERATIVE_AI_API_KEY=...
EMBEDDING_PROVIDER=google          # must match the provider used for `pnpm ingest`
ADMIN_USER=admin
ADMIN_PASSWORD=choose-a-password   # default is admin/admin, for local use only
```

Without a key the app, `/admin` and `/api/health` still work; chat answers with a friendly error and logs the cause.

`EMBEDDING_PROVIDER=mock` uses deterministic fake vectors (CI uses it), which is enough to run the app and retrieval tests, but answers need a real chat model. Because models are configured through environment variables and one small module (`lib/ai/models.ts`), the provider can be swapped for an EU-hosted one (for example Azure OpenAI in an EU region) — relevant for data residency.

### Environment variables

See [`.env.example`](.env.example). Key ones: `DATABASE_URL`, `GOOGLE_GENERATIVE_AI_API_KEY` (or `OPENAI_API_KEY`), `CHAT_PROVIDER`, `CHAT_MODEL`, `CHAT_MODEL_FALLBACK`, `JUDGE_MODEL`, `EMBEDDING_PROVIDER`, `MAX_VECTOR_DISTANCE`, `MIN_RELEVANCE`, `TOP_K`, `LANGFUSE_*`, `UPSTASH_REDIS_REST_*`, `ADMIN_USER`/`ADMIN_PASSWORD`, `DAILY_BUDGET_USD`.

## Deploy

**Vercel + Neon (free tiers).**

1. Create a Neon project (EU region), copy the pooled `DATABASE_URL`; run `pnpm db:migrate && pnpm ingest` against it (or run the manual **Re-index policies** workflow).
2. Create a Langfuse Cloud project (EU) and an optional Upstash Redis database.
3. Import the repo in Vercel, set the environment variables for Production and Preview, deploy. `vercel.json` pins the function region to `fra1`; the chat route sets `maxDuration = 60`.
4. Smoke test `/api/health` and one chat in each language; confirm the trace in Langfuse.
5. Set the repository variable `APP_URL` for the uptime workflow, and secrets/variables for the nightly eval (`DATABASE_URL`, model key, `CHAT_*`).

CI (`ci.yml`) runs lint, typecheck, corpus validation, unit tests and the build on every PR, plus an integration job on a `pgvector/pgvector:pg16` service container (migrate → ingest with mock embeddings → idempotency check → retriever tests). Label a PR `run-eval` to also post an eval summary (needs secrets).

## Roadmap / production next steps

SSO (Entra ID) with the persona from HR master data instead of a selector · document sync from SharePoint/the HR system with versioning · a re-ranking model · NER-based PII detection · human-in-the-loop review of 👎 answers feeding the golden set · A/B tests of prompt versions · Slack/Teams channel · analytics for HR on the top content gaps · push eval scores to Langfuse dataset runs so online and offline evals live in one place · a larger, independently-judged golden set.

## Disclaimer

Built as a portfolio project. All data is fictional; this is not HR or legal advice.
