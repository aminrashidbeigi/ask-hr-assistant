import { tool } from "ai";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { retrieve, type Persona } from "@/lib/rag/retriever";
import type { Source } from "./types";

export const HR_CONTACT = {
  deskEmail: "hr@voltwerk.example",
  deskPhone: "+49 555 0100 100",
  hours: "Mon–Fri 08:00–16:00",
};

/** Per-request state shared between the tools and the chat route (logging, sources panel). */
export interface RequestCollector {
  sources: Source[];
  searches: { query: string; found: boolean; topScore: number }[];
  retrievedChunkIds: Set<string>;
  escalated: boolean;
  ticketId?: string;
}

export function createCollector(): RequestCollector {
  return { sources: [], searches: [], retrievedChunkIds: new Set(), escalated: false };
}

export function createTools(opts: {
  persona: Persona;
  collector: RequestCollector;
  /** called whenever new sources were added, so the route can stream them to the UI */
  onSources?: (sources: Source[]) => void;
}) {
  const { persona, collector, onSources } = opts;

  const searchPolicies = tool({
    description:
      "Search the official HR policy documents. Returns numbered source passages; cite them as [n]. " +
      "Call this before answering any policy question.",
    inputSchema: z.object({
      query: z.string().min(2).max(300).describe("Short search query, e.g. 'night shift allowance percentage'"),
      language: z.enum(["de", "en"]).optional().describe("Language of the user's question"),
    }),
    execute: async ({ query, language }) => {
      const result = await retrieve({ query, persona, lang: language, k: getEnv().TOP_K });
      collector.searches.push({ query, found: result.found, topScore: result.topScore });
      for (const c of result.chunks) collector.retrievedChunkIds.add(c.id);

      if (!result.found) {
        return { found: false as const, message: "No relevant policy text was found for this query." };
      }

      // Citation numbers are global per request, so [n] stays unambiguous across several searches.
      const results = result.chunks.map((c) => {
        let source = collector.sources.find((s) => s.id === c.id);
        if (!source) {
          source = {
            n: collector.sources.length + 1,
            id: c.id,
            policyId: c.policyId,
            title: c.title,
            section: c.section,
            url: c.url,
            lang: c.lang,
            snippet: c.content,
          };
          collector.sources.push(source);
        }
        return { n: source.n, title: c.title, section: c.section, language: c.lang, text: c.content };
      });
      onSources?.([...collector.sources]);
      return { found: true as const, results };
    },
  });

  const escalateToHR = tool({
    description:
      "Forward the employee's question to the HR team. Use for personal cases, or when the user asks to contact HR / agrees to your offer. " +
      "Stub: in production this would create a ticket in the HR case system.",
    inputSchema: z.object({
      topic: z.string().min(2).max(120).describe("Short topic, e.g. 'Overtime compensation question'"),
      summary: z.string().min(2).max(500).describe("Neutral summary without personal data"),
    }),
    execute: async ({ topic }) => {
      const ticketId = `HR-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
      collector.escalated = true;
      collector.ticketId = ticketId;
      return {
        ticketId,
        topic,
        contact: `HR Service Desk, ${HR_CONTACT.deskEmail}, ${HR_CONTACT.deskPhone} (${HR_CONTACT.hours})`,
        note: "An HR business partner will reply within 2 working days.",
      };
    },
  });

  return { searchPolicies, escalateToHR };
}
