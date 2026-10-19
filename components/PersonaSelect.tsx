"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Persona = "all" | "shift" | "office";

const LABELS: Record<Persona, string> = {
  all: "All employees · Alle",
  shift: "Shift · Schicht",
  office: "Office · Büro",
};

export function PersonaSelect({ value, onChange }: { value: Persona; onChange: (p: Persona) => void }) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as Persona)}>
      <SelectTrigger className="w-44" aria-label="Employee group">
        <SelectValue>{LABELS[value]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(LABELS) as Persona[]).map((p) => (
          <SelectItem key={p} value={p}>
            {LABELS[p]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
