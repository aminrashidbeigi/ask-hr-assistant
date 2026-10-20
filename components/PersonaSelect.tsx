"use client";

import { BuildingIcon, FactoryIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type Persona = "all" | "shift" | "office";

const LABELS: Record<Persona, string> = {
  all: "All employees · Alle",
  shift: "Shift · Schicht",
  office: "Office · Büro",
};

const ICONS: Record<Persona, LucideIcon> = { all: UsersIcon, shift: FactoryIcon, office: BuildingIcon };

export function PersonaSelect({ value, onChange }: { value: Persona; onChange: (p: Persona) => void }) {
  const Icon = ICONS[value];
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as Persona)}>
      <SelectTrigger
        size="sm"
        className="h-8 w-auto rounded-full border-transparent bg-muted px-3 text-xs font-medium hover:bg-accent dark:bg-muted dark:hover:bg-accent"
        aria-label="Employee group"
      >
        <Icon className="size-3.5 text-muted-foreground" />
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
