"use client";

import { CheckIcon, CopyIcon, ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type State = "idle" | "comment" | "sending" | "done" | "error";

export function FeedbackButtons({ queryLogId, text }: { queryLogId: string; text: string }) {
  const [state, setState] = useState<State>("idle");
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [comment, setComment] = useState("");
  const [copied, setCopied] = useState(false);

  async function send(r: 1 | -1, note?: string) {
    setState("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queryLogId, rating: r, comment: note?.trim() || undefined }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text.replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const iconBtn = "size-8 rounded-full text-muted-foreground hover:text-foreground";

  return (
    <div className="space-y-2" data-testid="feedback">
      <div className="-ml-2 flex items-center gap-0.5">
        <Button type="button" size="icon" variant="ghost" className={iconBtn} onClick={() => void copy()} aria-label="Copy answer" title="Copy">
          {copied ? <CheckIcon className="text-success" /> : <CopyIcon />}
        </Button>
        {state === "done" ? (
          <span className="ml-1 flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <CheckIcon className="size-3.5 text-success" />
            Thanks for your feedback! · Danke für Ihr Feedback!
          </span>
        ) : (
          <>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={iconBtn}
              aria-label="Helpful"
              title="Helpful · Hilfreich"
              disabled={state === "sending"}
              onClick={() => {
                setRating(1);
                void send(1);
              }}
            >
              <ThumbsUpIcon />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={iconBtn}
              aria-label="Not helpful"
              title="Not helpful · Nicht hilfreich"
              disabled={state === "sending"}
              onClick={() => {
                setRating(-1);
                setState("comment");
              }}
            >
              <ThumbsDownIcon />
            </Button>
          </>
        )}
        {state === "error" && <span className="ml-1 text-xs text-destructive">Could not send, please retry.</span>}
      </div>
      {state === "comment" && rating === -1 && (
        <div className="max-w-md space-y-2 rounded-2xl border bg-card p-2.5">
          <Textarea
            value={comment}
            maxLength={500}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What was wrong? (optional) · Was war falsch? (optional)"
            rows={2}
            className="min-h-16 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setState("idle")}>
              Cancel · Abbrechen
            </Button>
            <Button type="button" size="sm" onClick={() => void send(-1, comment)}>
              Send · Senden
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
