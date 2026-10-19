"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { Message, viewOf } from "@/components/Message";
import { PersonaSelect, type Persona } from "@/components/PersonaSelect";
import { SourcesPanel } from "@/components/SourcesPanel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { AskHrUIMessage } from "@/lib/agent/types";

const STARTERS = [
  { text: "Wie hoch ist der Nachtzuschlag?", persona: "shift" as Persona },
  { text: "Wie viele Urlaubstage habe ich?", persona: "all" as Persona },
  { text: "Wie melde ich mich krank?", persona: "all" as Persona },
  { text: "How many days can I work from home?", persona: "office" as Persona },
  { text: "From how many hours does overtime start?", persona: "shift" as Persona },
  { text: "What is the CEO's salary?", persona: "all" as Persona },
];

function sessionId(): string {
  try {
    const existing = sessionStorage.getItem("ask-hr-session");
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem("ask-hr-session", fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

/** The server answers errors with {"message": "..."} — show that, not the raw JSON. */
function friendlyError(message: string): string {
  try {
    const parsed = JSON.parse(message);
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    /* not JSON */
  }
  return message || "Something went wrong. / Es ist ein Fehler aufgetreten.";
}

export function Chat() {
  const [persona, setPersona] = useState<Persona>("all");
  const [sid] = useState(() => (typeof window === "undefined" ? "ssr-session" : sessionId()));

  const transport = useMemo(() => new DefaultChatTransport<AskHrUIMessage>({ api: "/api/chat" }), []);
  const { messages, sendMessage, status, error, stop } = useChat<AskHrUIMessage>({ transport });

  const [input, setInput] = useState("");
  const [active, setActive] = useState<{ messageId: string; n: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, status]);

  const lastAssistantWithSources = [...messages]
    .reverse()
    .find((m) => m.role === "assistant" && viewOf(m).sources.length > 0);
  const panelMessage = messages.find((m) => m.id === active?.messageId) ?? lastAssistantWithSources;
  const panelView = panelMessage ? viewOf(panelMessage) : { sources: [], citedNumbers: new Set<number>() };
  const lastLang = [...messages].reverse().find((m) => m.role === "user");
  const germanUser = lastLang
    ? /[äöüß]|\b(wie|ich|der|die|das|ist|und|nicht|habe|kann)\b/i.test(
        lastLang.parts.map((p) => (p.type === "text" ? p.text : "")).join(" "),
      )
    : false;

  function submit(text: string, personaOverride?: Persona) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setInput("");
    // persona and session id travel with every request, so they are never stale
    void sendMessage({ text: trimmed }, { body: { persona: personaOverride ?? persona, sessionId: sid } });
  }

  const sourcesPanel = (
    <SourcesPanel
      sources={panelView.sources}
      citedNumbers={panelView.citedNumbers}
      activeN={active?.n ?? null}
      onSelect={(n) => panelMessage && setActive({ messageId: panelMessage.id, n })}
    />
  );

  return (
    <div className="mx-auto flex h-dvh w-full max-w-6xl flex-col">
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold leading-tight">Ask HR</h1>
          <p className="text-xs text-muted-foreground">Voltwerk Manufacturing GmbH · DE / EN</p>
        </div>
        <PersonaSelect value={persona} onChange={setPersona} />
      </header>

      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
            {messages.length === 0 && (
              <div className="space-y-4 pt-6">
                <div>
                  <h2 className="text-xl font-semibold">How can I help? · Wie kann ich helfen?</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ask about vacation, sick leave, shift allowances, overtime and more — in German or English.
                    <br />
                    Fragen zu Urlaub, Krankmeldung, Schichtzuschlägen, Überstunden und mehr – auf Deutsch oder Englisch.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((s) => (
                    <Button
                      key={s.text}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-auto whitespace-normal py-1.5 text-left"
                      onClick={() => {
                        setPersona(s.persona);
                        submit(s.text, s.persona);
                      }}
                    >
                      {s.text}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <Message
                key={m.id}
                message={m}
                streaming={busy && i === messages.length - 1}
                activeN={active?.messageId === m.id ? active.n : null}
                onCite={(n) => setActive({ messageId: m.id, n })}
                onContactHr={() =>
                  submit(germanUser ? "Bitte leiten Sie meine Frage an HR weiter." : "Please forward my question to HR.")
                }
              />
            ))}

            {status === "submitted" && (
              <div className="text-xs text-muted-foreground" role="status">
                Thinking… · Einen Moment…
              </div>
            )}
            {error && (
              <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {friendlyError(error.message)}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <details className="border-t px-4 py-2 text-sm lg:hidden" open={active !== null}>
            <summary className="cursor-pointer select-none font-medium">
              Sources · Quellen ({panelView.sources.length})
            </summary>
            <div className="max-h-64 overflow-y-auto pt-2">{sourcesPanel}</div>
          </details>

          <form
            className="flex items-end gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(input);
                }
              }}
              placeholder="Ask a question… · Frage stellen…"
              aria-label="Your question"
              maxLength={2000}
              rows={1}
              className="max-h-32 min-h-10 resize-none"
            />
            {busy ? (
              <Button type="button" variant="outline" onClick={() => void stop()}>
                Stop
              </Button>
            ) : (
              <Button type="submit" disabled={!input.trim()}>
                Send · Senden
              </Button>
            )}
          </form>
        </main>

        <aside className="hidden w-80 shrink-0 overflow-y-auto border-l p-4 lg:block" aria-label="Sources">
          <h2 className="mb-3 text-sm font-semibold">Sources · Quellen</h2>
          {sourcesPanel}
        </aside>
      </div>

      <footer className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
        AI assistant. Answers are based on Voltwerk policies (fictional demo data). Verify important decisions with HR.
        <br />
        KI-Assistent. Antworten basieren auf Voltwerk-Richtlinien (fiktive Demodaten). Wichtige Entscheidungen bitte mit HR abklären.
      </footer>
    </div>
  );
}
