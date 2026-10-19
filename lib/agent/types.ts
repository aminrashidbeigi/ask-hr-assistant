import type { UIMessage } from "ai";

export interface Source {
  /** citation number the model uses as [n] */
  n: number;
  id: string;
  policyId: string;
  title: string;
  section: string;
  url: string;
  lang: string;
  snippet: string;
}

export type AskHrDataParts = {
  /** all sources retrieved so far for this answer (reconciled under one id) */
  sources: Source[];
  meta: { queryLogId: string };
};

export type AskHrUIMessage = UIMessage<never, AskHrDataParts>;
