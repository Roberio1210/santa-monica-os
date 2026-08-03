"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { PLANNING_RANGE_LABELS, type PlanningRangeKey } from "@/lib/planning/types";

const OPTIONS: (PlanningRangeKey | null)[] = [null, "hoje", "amanha", "semana", "proxima_semana", "todos"];

export function RangeFilter({ current }: { current: PlanningRangeKey | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function select(range: PlanningRangeKey | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (range) params.set("range", range);
    else params.delete("range");
    params.delete("q");
    router.push(`/planejamento?${params.toString()}`);
  }

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {OPTIONS.map((range) => (
        <button
          key={range ?? "default"}
          type="button"
          onClick={() => select(range)}
          className={cn(
            "h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
            current === range ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background-elevated text-foreground-muted",
          )}
        >
          {range ? PLANNING_RANGE_LABELS[range] : "Próximos dias"}
        </button>
      ))}
    </div>
  );
}
