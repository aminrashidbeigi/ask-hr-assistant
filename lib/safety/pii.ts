/**
 * Regex-based PII redaction. This is a baseline: production should add an NER-based detector
 * (e.g. Microsoft Presidio) for names and addresses, which regexes cannot catch.
 */

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december|" +
  "januar|februar|märz|maerz|mai|juni|juli|oktober|dezember";
const DOB_KEYWORD = String.raw`(?:born(?:\s+on)?|d\.?o\.?b\.?|date\s+of\s+birth|geboren(?:\s+am)?|geb\.?|geburtsdatum)`;

interface Rule {
  label: string;
  pattern: RegExp;
}

// Order matters: specific/long patterns first so shorter ones cannot eat parts of them.
const RULES: Rule[] = [
  { label: "EMAIL", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  {
    label: "IBAN",
    pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g,
  },
  { label: "EMPLOYEE_ID", pattern: /\bVW-\d{6}\b/gi },
  {
    label: "DATE_OF_BIRTH",
    pattern: new RegExp(
      String.raw`\b${DOB_KEYWORD}\s*[:\-]?\s*(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\.?\s+(?:${MONTHS})\s+\d{4})`,
      "gi",
    ),
  },
  {
    label: "PHONE",
    // international: +49 151 1234567, 0049 30 …, +1 (415) 555-0132
    pattern: /(?<![\w])(?:\+|00)\d{1,3}[\s/()-]*\d(?:[\s/()-]*\d){6,12}(?!\d)/g,
  },
  // German Steuer-ID: 11 digits, never starting with 0 (optionally grouped 2-3-3-3).
  // Runs before national phone numbers, whose "0xx…" pattern would match inside a grouped ID.
  { label: "TAX_ID", pattern: /\b[1-9]\d(?: ?\d{3}){3}\b/g },
  {
    label: "PHONE",
    // German national: 0151 1234567, 089/123456
    pattern: /(?<![\w])0\d{2,4}[\s/-]?\d{3,9}(?:[\s-]?\d{2,6})?(?!\d)/g,
  },
];

export interface RedactionResult {
  text: string;
  /** labels of the categories that were found, e.g. ["EMAIL", "PHONE"] */
  found: string[];
}

export function redactPIIWithReport(input: string): RedactionResult {
  let text = input;
  const found = new Set<string>();
  for (const { label, pattern } of RULES) {
    text = text.replace(pattern, () => {
      found.add(label);
      return `[${label}]`;
    });
  }
  return { text, found: [...found] };
}

export function redactPII(input: string): string {
  return redactPIIWithReport(input).text;
}
