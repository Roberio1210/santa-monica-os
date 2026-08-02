"use client";

import { cn } from "@/lib/utils/cn";

/** Checklist de sim/não (1 toque alterna) — reusado em Rodas, Vidros e Interior. */
export function ChecklistPicker<K extends string>({
  items,
  value,
  onToggle,
}: {
  items: { key: K; label: string }[];
  value: Record<K, boolean>;
  onToggle: (key: K) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map(({ key, label }) => {
        const selected = value[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              selected ? "border-warning bg-warning-bg text-warning" : "border-border bg-background-elevated text-foreground-muted hover:bg-background-panel",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
