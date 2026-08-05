"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { runJumpParkBackfillAction, type JumpParkBackfillActionState } from "@/app/admin/jumppark-sync/actions";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const initialState: JumpParkBackfillActionState = { error: null, result: null };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Painel de Backfill Histórico (Missão 27) — dispara `runHistoricalBackfill` em lotes seguros.
 * Cada clique processa o quanto couber em ~50s e mostra o progresso real (consultado no banco a
 * cada chamada, nunca acumulado no cliente). Resumível: clicar em "Continuar" repete a mesma
 * chamada com as mesmas datas, e os lotes já concluídos com sucesso são automaticamente pulados.
 */
export function JumpParkBackfillPanel() {
  const [state, formAction, pending] = useActionState(runJumpParkBackfillAction, initialState);
  const { result, error } = state;

  return (
    <div className="space-y-4">
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground-subtle" htmlFor="overallStart">
            Início do histórico
          </label>
          <input id="overallStart" name="overallStart" type="date" defaultValue={result?.overallStart ?? "2025-01-01"} className={fieldClasses} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground-subtle" htmlFor="overallEnd">
            Fim do histórico
          </label>
          <input id="overallEnd" name="overallEnd" type="date" defaultValue={result?.overallEnd ?? todayIso()} className={fieldClasses} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground-subtle" htmlFor="batchDays">
            Dias por lote
          </label>
          <input id="batchDays" name="batchDays" type="number" min={1} max={90} defaultValue={result?.batchDays ?? 14} className={`${fieldClasses} w-24`} />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Processando lote..." : result && !result.finished ? "Continuar backfill" : "Iniciar backfill histórico"}
        </Button>
      </form>

      {error && <p className="text-sm text-critical">{error}</p>}

      {result && (
        <div className="space-y-2 rounded-lg border border-border-subtle p-3">
          {!result.databaseConfigured ? (
            <p className="text-sm text-critical">Banco de dados (Neon) não configurado neste ambiente.</p>
          ) : (
            <>
              <p className="text-sm text-foreground">
                {result.batchesAlreadyDone + result.batchesProcessedThisRun} de {result.totalBatches} lote(s) concluído(s)
                {result.finished ? " — backfill completo para este intervalo." : ` — ${result.batchesRemaining} lote(s) restante(s). Clique em "Continuar backfill" para seguir.`}
              </p>
              <p className="text-xs text-foreground-subtle">
                Nesta execução: {result.batchesProcessedThisRun} lote(s) processado(s), {result.ordersFetched} ordem(ns) buscada(s), {result.ordersInserted} nova(s), {result.ordersUpdated} atualizada(s),{" "}
                {result.serviceItemsPersisted} serviço(s) individual(is) salvos, em {result.durationMs}ms.
              </p>
              {result.batchesWithError.length > 0 && (
                <div className="text-xs text-critical">
                  <p>{result.batchesWithError.length} lote(s) com erro nesta execução (serão tentados de novo automaticamente na próxima):</p>
                  <ul className="list-disc pl-4">
                    {result.batchesWithError.map((b) => (
                      <li key={`${b.start}-${b.end}`}>
                        {b.start} a {b.end}: {b.errorMessage}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <p className="text-xs text-foreground-subtle">
        Idempotente e resumível: cada lote vira um registro em Sincronizações; um lote já concluído com sucesso nunca é refeito, e um lote com erro é tentado de novo automaticamente. Cada clique
        processa o quanto couber em ~50 segundos (limite de função serverless) — para históricos longos, pode ser preciso clicar em &quot;Continuar backfill&quot; várias vezes.
      </p>
    </div>
  );
}
