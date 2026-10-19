import { parseCitationNumbers } from "./citations";
import { REFUSAL_PATTERN } from "./prompt";

/**
 * Did the assistant decline to answer? Two signals, strongest first:
 * - retrieval: it searched and nothing relevant was found;
 * - wording: the refusal phrase / "forward your question to HR" offer, but only in an answer that
 *   cites no source — a cited answer that merely offers HR contact is still an answer.
 */
export function isRefusal(answer: string, searches: { found: boolean }[]): boolean {
  if (searches.length > 0 && !searches.some((s) => s.found)) return true;
  return parseCitationNumbers(answer).length === 0 && REFUSAL_PATTERN.test(answer);
}
