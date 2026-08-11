"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { processHistoricalConsumptionAction } from "@/app/estoque/consumo-teorico-historico/actions";

/** Data mais antiga plausível de dado real no Neon — cobre todo o histórico sincronizado. */
const EARLIEST_DATE = "2020-01-01";

export function HistoricalConsumptionTrigger({ today }: { today: string }) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error: string | null; success: string | null }>({ error: null, success: null });

  function handleClick() {
    startTransition(async () => {
      const result = await processHistoricalConsumptionAction(EARLIEST_DATE, today);
      setMessage(result);
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" onClick={handleClick} disabled={isPending}>
        {isPending ? "Processando todo o histórico..." : "Reprocessar todo o histórico teórico"}
      </Button>
      <p className="text-xs text-foreground-subtle">Idempotente — nunca duplica. Só escreve na tabela de consumo teórico histórico, nunca no saldo físico real.</p>
      {message.error ? <p className="text-sm text-critical">{message.error}</p> : null}
      {message.success ? <p className="text-sm text-positive">{message.success}</p> : null}
    </div>
  );
}
