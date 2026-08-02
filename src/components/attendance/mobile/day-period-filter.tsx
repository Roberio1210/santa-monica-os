"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { DAY_PERIOD_KEYS, DAY_PERIOD_LABELS, type DayPeriodKey } from "@/lib/attendance/period";

/** Filtro de período — pílulas roláveis, área de toque grande. Só a seção "Entradas" reage a ele (ver `period.ts`). */
export function DayPeriodFilter({ current }: { current: DayPeriodKey }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setPeriod(key: DayPeriodKey) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "hoje") {
      params.delete("period");
    } else {
      params.set("period", key);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Período">
      {DAY_PERIOD_KEYS.map((key) => {
        const active = key === current;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => setPeriod(key)}
            className={cn(
              "h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors active:scale-[0.97]",
              active ? "border-accent bg-accent text-accent-foreground" : "border-border-subtle bg-background-panel text-foreground-subtle",
            )}
          >
            {DAY_PERIOD_LABELS[key]}
          </button>
        );
      })}
    </div>
  );
}
