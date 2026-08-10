"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ServiceEvolutionChart } from "@/components/jumppark/service-evolution-chart";
import type { EvolutionPoint } from "@/lib/integrations/jumppark/serviceAnalytics";

type Granularity = "day" | "week" | "month";

const LABELS: Record<Granularity, string> = { day: "Diário (período)", week: "Semanal (período)", month: "Mensal (12 meses)" };

/** Alterna entre as três séries já calculadas no servidor — sem nova ida ao banco. */
export function PurchasesEvolutionSection({ daily, weekly, monthly }: { daily: EvolutionPoint[]; weekly: EvolutionPoint[]; monthly: EvolutionPoint[] }) {
  const [granularity, setGranularity] = useState<Granularity>("month");
  const series = granularity === "day" ? daily : granularity === "week" ? weekly : monthly;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(LABELS) as Granularity[]).map((g) => (
          <Button key={g} type="button" size="sm" variant={granularity === g ? "default" : "outline"} onClick={() => setGranularity(g)}>
            {LABELS[g]}
          </Button>
        ))}
      </div>
      {series.every((p) => p.quantity === 0) ? (
        <p className="text-sm text-foreground-subtle">Sem dados disponíveis nesta granularidade.</p>
      ) : (
        <ServiceEvolutionChart points={series} />
      )}
    </div>
  );
}
