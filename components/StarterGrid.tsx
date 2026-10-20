"use client";

import {
  ClockIcon,
  HouseIcon,
  LockKeyholeIcon,
  MoonStarIcon,
  PalmtreeIcon,
  ThermometerIcon,
  type LucideIcon,
} from "lucide-react";
import type { Persona } from "@/components/PersonaSelect";

export interface Starter {
  text: string;
  persona: Persona;
  icon: LucideIcon;
}

export const STARTERS: Starter[] = [
  { text: "Wie hoch ist der Nachtzuschlag?", persona: "shift", icon: MoonStarIcon },
  { text: "Wie viele Urlaubstage habe ich?", persona: "all", icon: PalmtreeIcon },
  { text: "Wie melde ich mich krank?", persona: "all", icon: ThermometerIcon },
  { text: "How many days can I work from home?", persona: "office", icon: HouseIcon },
  { text: "From how many hours does overtime start?", persona: "shift", icon: ClockIcon },
  { text: "What is the CEO's salary?", persona: "all", icon: LockKeyholeIcon },
];

export function StarterGrid({ onPick }: { onPick: (s: Starter) => void }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Suggested questions · Vorschläge">
      {STARTERS.map((s, i) => (
        <li key={s.text} className={`animate-fade-up ${i >= 4 ? "hidden sm:block" : ""}`} style={{ animationDelay: `${120 + i * 40}ms` }}>
          <button
            type="button"
            onClick={() => onPick(s)}
            className="group flex min-h-12 w-full items-center gap-3 rounded-2xl border bg-card px-3.5 py-2.5 text-left text-sm transition-all outline-none hover:-translate-y-px hover:border-primary/40 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <s.icon className="size-4" />
            </span>
            <span className="leading-snug">{s.text}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
