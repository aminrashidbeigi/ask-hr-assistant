"use client";

import { MessageCircleWarningIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { Logo } from "@/components/Logo";
import { RichText } from "@/components/RichText";
import { SourceChips } from "@/components/SourceChips";
import { parseCitationNumbers } from "@/lib/agent/citations";
import { isRefusal } from "@/lib/agent/refusal";
import type { AskHrUIMessage, Source } from "@/lib/agent/types";

const TOOL_LABEL: Record<string, string> = {
  "tool-searchPolicies": "Searching policies… · Richtlinien werden durchsucht…",
  "tool-escalateToHR": "Contacting HR… · HR wird kontaktiert…",
};

export interface MessageView {
  sources: Source[];
  citedNumbers: Set<number>;
}

/** Everything the page needs to know about an assistant message, derived from its parts. */
export function viewOf(message: AskHrUIMessage): MessageView & { text: string; queryLogId?: string } {
  let sources: Source[] = [];
  let queryLogId: string | undefined;
  let text = "";
  for (const part of message.parts) {
    if (part.type === "data-sources") sources = part.data;
    else if (part.type === "data-meta") queryLogId = part.data.queryLogId;
    else if (part.type === "text") text += part.text;
  }
  return { sources, queryLogId, text, citedNumbers: new Set(parseCitationNumbers(text)) };
}

export function ThinkingDots() {
  return (
    <div className="flex items-center gap-3 animate-fade-up" role="status">
      <Logo className="size-6 shrink-0" />
      <span className="flex items-center gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-dot rounded-full bg-muted-foreground"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </span>
      <span className="sr-only">Thinking… · Einen Moment…</span>
    </div>
  );
}

export function Message({
  message,
  streaming,
  activeN,
  onCite,
  onOpenSources,
  onContactHr,
}: {
  message: AskHrUIMessage;
  streaming: boolean;
  activeN: number | null;
  onCite: (n: number) => void;
  onOpenSources: (n: number | null) => void;
  onContactHr: () => void;
}) {
  if (message.role === "user") {
    const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return (
      <div className="flex justify-end animate-fade-up" data-testid="user-message">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-secondary px-4 py-2.5 text-[15px] leading-relaxed">
          {text}
        </div>
      </div>
    );
  }

  const { text, queryLogId, sources, citedNumbers } = viewOf(message);
  const runningTools = message.parts.filter(
    (p) =>
      p.type.startsWith("tool-") &&
      (p as { state?: string }).state !== "output-available" &&
      (p as { state?: string }).state !== "output-error",
  );
  const escalated = message.parts.some(
    (p) => p.type === "tool-escalateToHR" && (p as { state?: string }).state === "output-available",
  );
  const refused = !streaming && !escalated && isRefusal(text, []);

  return (
    <div className="flex gap-3 animate-fade-up" data-testid="assistant-message">
      <Logo className="mt-0.5 size-6 shrink-0" />
      <div className="min-w-0 flex-1 space-y-3 text-[15px]">
        {runningTools.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-sm" role="status">
            <span className="inline-block size-2 animate-pulse rounded-full bg-primary" />
            <span className="shimmer-text">{TOOL_LABEL[p.type] ?? "Working…"}</span>
          </div>
        ))}
        {text && <RichText text={text} onCite={onCite} activeN={activeN} />}
        {refused && (
          <div className="flex gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-3.5">
            <MessageCircleWarningIcon className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="space-y-2.5">
              <p className="text-sm leading-relaxed">
                I can&apos;t answer this from the policies. HR can help personally. · Das kann ich aus den Richtlinien
                nicht beantworten. HR hilft Ihnen persönlich weiter.
              </p>
              <Button type="button" size="sm" onClick={onContactHr} data-testid="contact-hr">
                Contact HR · HR kontaktieren
              </Button>
            </div>
          </div>
        )}
        {!streaming && text && <SourceChips sources={sources} citedNumbers={citedNumbers} onOpen={onOpenSources} />}
        {!streaming && queryLogId && text && <FeedbackButtons queryLogId={queryLogId} text={text} />}
      </div>
    </div>
  );
}
