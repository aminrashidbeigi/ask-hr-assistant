import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "ask-hr" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/**
 * Logger bound to a trace id. Only ever pass redacted text to it — raw user input
 * must never be logged.
 */
export function withTrace(traceId: string | undefined) {
  return logger.child({ traceId: traceId ?? "none" });
}
