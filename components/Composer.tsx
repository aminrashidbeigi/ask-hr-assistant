"use client";

import { ArrowUpIcon, SquareIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

const MAX = 2000;

/** The rounded input box: auto-growing textarea, persona chip on the left, send/stop button on the right. */
export function Composer({
  persona,
  busy,
  onSubmit,
  onStop,
  autoFocus,
}: {
  persona: ReactNode;
  busy: boolean;
  onSubmit: (text: string) => void;
  onStop: () => void;
  autoFocus?: boolean;
}) {
  const [input, setInput] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  const canSend = input.trim().length > 0 && !busy;

  function send() {
    if (!canSend) return;
    onSubmit(input);
    setInput("");
    ref.current?.focus();
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) ref.current?.focus();
      }}
      className="rounded-3xl border bg-card p-2 shadow-[var(--shadow-composer)] transition-colors focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10"
    >
      <textarea
        ref={ref}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="Ask a question… · Frage stellen…"
        aria-label="Your question"
        maxLength={MAX}
        rows={1}
        className="block max-h-40 min-h-11 w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-base leading-relaxed outline-none field-sizing-content placeholder:text-muted-foreground md:text-[15px]"
      />
      <div className="flex items-center justify-between gap-2 pt-1">
        <div className="flex min-w-0 items-center gap-2">
          {persona}
          {input.length > MAX - 300 && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {input.length}/{MAX}
            </span>
          )}
        </div>
        {busy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop"
            title="Stop"
            className="flex size-9 items-center justify-center rounded-full bg-foreground text-background transition-transform outline-none hover:scale-105 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <SquareIcon className="size-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Send"
            title="Send · Senden"
            className={cn(
              "flex size-9 items-center justify-center rounded-full transition-all outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              canSend
                ? "bg-primary text-primary-foreground hover:scale-105"
                : "bg-muted text-muted-foreground opacity-70",
            )}
          >
            <ArrowUpIcon className="size-4" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </form>
  );
}
