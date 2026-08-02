"use client";

import { cn } from "@/lib/utils/cn";

/** Seletor único (1 toque troca o valor) — reusado para níveis de problema, condição de pneus e condição de motor. */
export function SegmentedPicker<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
  tone = "accent",
}: {
  label: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T | null;
  onChange: (next: T) => void;
  tone?: "accent" | "warning";
}) {
  return (
    <div>
      <p className="text-xs text-foreground-subtle">{label}</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((option) => {
          const selected = value === option;
          const isNoneOption = option === "nenhuma" || option === "nenhum";
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                selected && tone === "accent" && "border-accent bg-accent text-accent-foreground",
                selected && tone === "warning" && !isNoneOption && "border-warning bg-warning-bg text-warning",
                selected && tone === "warning" && isNoneOption && "border-accent bg-accent text-accent-foreground",
                !selected && "border-border bg-background-elevated text-foreground-muted hover:bg-background-panel",
              )}
            >
              {labels[option]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
