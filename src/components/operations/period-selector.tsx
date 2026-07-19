"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { PERIOD_KEYS, PERIOD_LABELS, type PeriodKey, type PeriodRange } from "@/lib/utils/timezone";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

/**
 * Seletor de período reutilizável — reflete a escolha na URL (`period`, `from`, `to`) para que
 * a página seja recarregável/compartilhável sem perder o filtro. Usado em Dashboard,
 * Movimentações, Lavação e Estacionamento.
 */
export function PeriodSelector({ period }: { period: PeriodRange }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customFrom, setCustomFrom] = useState(period.key === "custom" ? period.from : "");
  const [customTo, setCustomTo] = useState(period.key === "custom" ? period.to : "");

  function setPeriod(key: PeriodKey, custom?: { from: string; to: string }) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", key);
    if (key === "custom" && custom) {
      params.set("from", custom.from);
      params.set("to", custom.to);
    } else {
      params.delete("from");
      params.delete("to");
    }
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PERIOD_KEYS.filter((k) => k !== "custom").map((key) => (
        <Button key={key} type="button" size="sm" variant={period.key === key ? "default" : "outline"} onClick={() => setPeriod(key)} className={cn(period.key === key && "font-semibold")}>
          {PERIOD_LABELS[key]}
        </Button>
      ))}
      <div className="flex items-center gap-1">
        <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className={fieldClasses} aria-label="Data inicial personalizada" />
        <span className="text-xs text-foreground-subtle">até</span>
        <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className={fieldClasses} aria-label="Data final personalizada" />
        <Button
          type="button"
          size="sm"
          variant={period.key === "custom" ? "default" : "outline"}
          disabled={!customFrom || !customTo}
          onClick={() => setPeriod("custom", { from: customFrom, to: customTo })}
        >
          Aplicar
        </Button>
      </div>
    </div>
  );
}
