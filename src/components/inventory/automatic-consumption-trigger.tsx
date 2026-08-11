"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { processAutomaticConsumptionNowAction } from "@/app/estoque/consumo-automatico/actions";

export function AutomaticConsumptionTrigger() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ error: string | null; success: string | null }>({ error: null, success: null });

  function handleClick() {
    startTransition(async () => {
      const result = await processAutomaticConsumptionNowAction();
      setMessage(result);
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={handleClick} disabled={isPending}>
        {isPending ? "Processando..." : "Processar consumo automático agora (hoje)"}
      </Button>
      <p className="text-xs text-foreground-subtle">Escreve de verdade, mas só ordens de hoje com receita já aprovada e prévia 100% resolvida — nunca retroativo, nunca duplicado.</p>
      {message.error ? <p className="text-sm text-critical">{message.error}</p> : null}
      {message.success ? <p className="text-sm text-positive">{message.success}</p> : null}
    </div>
  );
}
