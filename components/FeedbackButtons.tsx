"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type State = "idle" | "comment" | "sending" | "done" | "error";

export function FeedbackButtons({ queryLogId }: { queryLogId: string }) {
  const [state, setState] = useState<State>("idle");
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [comment, setComment] = useState("");

  async function send(r: 1 | -1, text?: string) {
    setState("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queryLogId, rating: r, comment: text?.trim() || undefined }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <p className="text-xs text-muted-foreground">Thanks for your feedback! / Danke für Ihr Feedback!</p>;
  }

  return (
    <div className="space-y-2" data-testid="feedback">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Helpful"
          disabled={state === "sending"}
          onClick={() => {
            setRating(1);
            void send(1);
          }}
        >
          👍
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label="Not helpful"
          disabled={state === "sending"}
          onClick={() => {
            setRating(-1);
            setState("comment");
          }}
        >
          👎
        </Button>
        {state === "error" && <span className="text-xs text-destructive">Could not send, please retry.</span>}
      </div>
      {state === "comment" && rating === -1 && (
        <div className="space-y-2">
          <Textarea
            value={comment}
            maxLength={500}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What was wrong? (optional) / Was war falsch? (optional)"
            rows={2}
          />
          <Button type="button" size="sm" onClick={() => void send(-1, comment)}>
            Send / Senden
          </Button>
        </div>
      )}
    </div>
  );
}
