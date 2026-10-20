"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ArrowDownIcon, SquarePenIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "@/components/Composer";
import { Logo } from "@/components/Logo";
import { Message, ThinkingDots, viewOf } from "@/components/Message";
import { PersonaSelect, type Persona } from "@/components/PersonaSelect";
import { SourcesPanel } from "@/components/SourcesPanel";
import { StarterGrid } from "@/components/StarterGrid";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { AskHrUIMessage } from "@/lib/agent/types";

const SESSION_KEY = "ask-hr-session";

function sessionId(fresh = false): string {
  try {
    if (!fresh) {
      const existing = sessionStorage.getItem(SESSION_KEY);
      if (existing) return existing;
    }
    const id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
    return id;
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
  const [sid, setSid] = useState(() => (typeof window === "undefined" ? "ssr-session" : sessionId()));

  const transport = useMemo(() => new DefaultChatTransport<AskHrUIMessage>({ api: "/api/chat" }), []);
  const { messages, sendMessage, setMessages, status, error, stop } = useChat<AskHrUIMessage>({ transport });

  const [sheet, setSheet] = useState<{ messageId: string; n: number | null } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [nearBottom, setNearBottom] = useState(true);
  const busy = status === "submitted" || status === "streaming";
  const empty = messages.length === 0;

  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (el) setNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
  }, []);

  const scrollToEnd = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  useEffect(() => {
    if (nearBottom) scrollToEnd();
  }, [messages, status, nearBottom, scrollToEnd]);

  const sheetMessage = sheet ? messages.find((m) => m.id === sheet.messageId) : undefined;
  const sheetView = sheetMessage ? viewOf(sheetMessage) : { sources: [], citedNumbers: new Set<number>() };

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const germanUser = lastUser
    ? /[äöüß]|\b(wie|ich|der|die|das|ist|und|nicht|habe|kann)\b/i.test(
        lastUser.parts.map((p) => (p.type === "text" ? p.text : "")).join(" "),
      )
    : false;

  function submit(text: string, personaOverride?: Persona) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setNearBottom(true);
    // persona and session id travel with every request, so they are never stale
    void sendMessage({ text: trimmed }, { body: { persona: personaOverride ?? persona, sessionId: sid } });
  }

  function newChat() {
    void stop();
    setMessages([]);
    setSheet(null);
    setSid(sessionId(true));
  }

  const lastIndex = messages.length - 1;
  const showThinking = status === "submitted";

  return (
    <div className="flex h-dvh flex-col">
      <header className="z-30 shrink-0 border-b border-transparent bg-background/80 backdrop-blur-md data-[scrolled=true]:border-border" data-scrolled={!empty}>
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <Logo className="size-7" />
            <div className="leading-tight">
              <h1 className="text-[15px] font-semibold">Ask HR</h1>
              <p className="hidden text-[11px] text-muted-foreground sm:block">Voltwerk Manufacturing GmbH · DE / EN</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!empty && (
              <Button type="button" variant="ghost" size="sm" onClick={newChat} className="h-9 gap-1.5 rounded-full px-3">
                <SquarePenIcon />
                <span>New chat · Neu</span>
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col">
        {empty ? (
          <div className="flex flex-[3] flex-col items-center justify-end px-4 pb-8 text-center">
            <div className="animate-fade-up">
              <Logo className="mx-auto mb-5 size-12" />
              <h2 className="text-balance text-3xl font-semibold sm:text-4xl">How can I help? · Wie kann ich helfen?</h2>
              <p className="mx-auto mt-3 max-w-2xl text-balance text-sm leading-relaxed text-muted-foreground">
                Ask about vacation, sick leave, shift allowances, overtime and more — in German or English.
                <br />
                Fragen zu Urlaub, Krankmeldung, Schichtzuschlägen, Überstunden und mehr – auf Deutsch oder Englisch.
              </p>
            </div>
          </div>
        ) : (
          <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto" aria-live="polite">
            <div className="mx-auto w-full max-w-3xl space-y-7 px-4 pt-6 pb-10">
              {messages.map((m, i) => (
                <Message
                  key={m.id}
                  message={m}
                  streaming={busy && i === lastIndex}
                  activeN={sheet?.messageId === m.id ? sheet.n : null}
                  onCite={(n) => setSheet({ messageId: m.id, n })}
                  onOpenSources={(n) => setSheet({ messageId: m.id, n })}
                  onContactHr={() =>
                    submit(germanUser ? "Bitte leiten Sie meine Frage an HR weiter." : "Please forward my question to HR.")
                  }
                />
              ))}
              {showThinking && <ThinkingDots />}
              {error && (
                <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
                  {friendlyError(error.message)}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="relative shrink-0 px-4">
          {!empty && (
            <>
              <div className="pointer-events-none absolute inset-x-0 -top-8 h-8 bg-gradient-to-t from-background to-transparent" />
              {!nearBottom && (
                <button
                  type="button"
                  onClick={() => scrollToEnd()}
                  aria-label="Scroll to latest"
                  className="absolute -top-14 left-1/2 z-10 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border bg-card shadow-md transition-colors outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <ArrowDownIcon className="size-4" />
                </button>
              )}
            </>
          )}
          <div className="mx-auto w-full max-w-3xl">
            <Composer
              persona={<PersonaSelect value={persona} onChange={setPersona} />}
              busy={busy}
              onSubmit={(t) => submit(t)}
              onStop={() => void stop()}
              autoFocus
            />
          </div>
        </div>

        {empty ? (
          <div className="flex flex-[4] justify-center overflow-y-auto px-4 pt-6 pb-4">
            <div className="w-full max-w-3xl">
              <StarterGrid
                onPick={(s) => {
                  setPersona(s.persona);
                  submit(s.text, s.persona);
                }}
              />
            </div>
          </div>
        ) : null}
      </main>

      <footer className="shrink-0 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center text-[11px] leading-snug text-muted-foreground">
        AI assistant. Answers are based on Voltwerk policies (fictional demo data). Verify important decisions with HR.
        <br className="hidden sm:inline" />{" "}
        KI-Assistent. Antworten basieren auf Voltwerk-Richtlinien (fiktive Demodaten). Wichtige Entscheidungen bitte mit HR abklären.
      </footer>

      <Sheet open={sheet !== null} onOpenChange={(open) => !open && setSheet(null)}>
        <SheetContent
          title="Sources · Quellen"
          description={`${sheetView.sources.length} retrieved passages · ${sheetView.citedNumbers.size} cited`}
        >
          <SourcesPanel
            sources={sheetView.sources}
            citedNumbers={sheetView.citedNumbers}
            activeN={sheet?.n ?? null}
            onSelect={(n) => sheet && setSheet({ messageId: sheet.messageId, n })}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
