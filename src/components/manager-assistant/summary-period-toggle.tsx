"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";

/** Alterna entre "Agora" (hoje, ao vivo) e "Fechamento do dia" (qualquer dia passado, consultável depois). */
export function SummaryPeriodToggle({ mode, date }: { mode: "agora" | "fechamento"; date: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pendingDate, setPendingDate] = useState(date);

  function goTo(nextMode: "agora" | "fechamento", nextDate?: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextMode === "agora") {
      params.delete("view");
      params.delete("date");
    } else {
      params.set("view", "fechamento");
      params.set("date", nextDate ?? pendingDate);
    }
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => goTo("agora")}
        className={cn(
          "h-9 rounded-full border px-3.5 text-sm font-medium transition-colors",
          mode === "agora" ? "border-accent bg-accent text-accent-foreground" : "border-border-subtle bg-background-panel text-foreground-subtle",
        )}
      >
        Agora
      </button>
      <button
        type="button"
        onClick={() => goTo("fechamento")}
        className={cn(
          "h-9 rounded-full border px-3.5 text-sm font-medium transition-colors",
          mode === "fechamento" ? "border-accent bg-accent text-accent-foreground" : "border-border-subtle bg-background-panel text-foreground-subtle",
        )}
      >
        Fechamento do dia
      </button>
      {mode === "fechamento" ? (
        <input
          type="date"
          value={pendingDate}
          onChange={(e) => {
            setPendingDate(e.target.value);
            goTo("fechamento", e.target.value);
          }}
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm text-foreground"
        />
      ) : null}
    </div>
  );
}
