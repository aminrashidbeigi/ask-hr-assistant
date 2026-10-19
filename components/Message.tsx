"use client";

import { Button } from "@/components/ui/button";
import { FeedbackButtons } from "@/components/FeedbackButtons";
import { RichText } from "@/components/RichText";
import { REFUSAL_PATTERN } from "@/lib/agent/prompt";
import { parseCitationNumbers } from "@/lib/agent/citations";
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

export function Message({
  message,
  streaming,
  activeN,
  onCite,
  onContactHr,
}: {
  message: AskHrUIMessage;
  streaming: boolean;
  activeN: number | null;
  onCite: (n: number) => void;
  onContactHr: () => void;
}) {
  if (message.role === "user") {
    const text = message.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    return (
      <div className="flex justify-end" data-testid="user-message">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {text}
        </div>
      </div>
    );
  }

  const { text, queryLogId } = viewOf(message);
  const runningTools = message.parts.filter(
    (p) => p.type.startsWith("tool-") && (p as { state?: string }).state !== "output-available" && (p as { state?: string }).state !== "output-error",
  );
  const escalated = message.parts.some(
    (p) => p.type === "tool-escalateToHR" && (p as { state?: string }).state === "output-available",
  );
  const refused = !streaming && !escalated && REFUSAL_PATTERN.test(text);

  return (
    <div className="flex" data-testid="assistant-message">
      <div className="max-w-[92%] space-y-2 rounded-2xl rounded-bl-sm border bg-card px-4 py-3 text-sm">
        {runningTools.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
            {TOOL_LABEL[p.type] ?? "Working…"}
          </div>
        ))}
        {text && <RichText text={text} onCite={onCite} activeN={activeN} />}
        {refused && (
          <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="mb-2 text-xs">
              I can&apos;t answer this from the policies. HR can help personally. · Das kann ich aus den Richtlinien nicht
              beantworten. HR hilft Ihnen persönlich weiter.
            </p>
            <Button type="button" size="sm" onClick={onContactHr} data-testid="contact-hr">
              Contact HR · HR kontaktieren
            </Button>
          </div>
        )}
        {!streaming && queryLogId && text && <FeedbackButtons queryLogId={queryLogId} />}
      </div>
    </div>
  );
}
