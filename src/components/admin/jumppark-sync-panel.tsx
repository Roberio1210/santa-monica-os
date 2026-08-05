"use client";

import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { syncJumpParkServiceOrdersAction, type JumpParkSyncActionState } from "@/app/admin/jumppark-sync/actions";
import type { JumpParkSyncStatus } from "@/lib/integrations/jumppark/sync";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const statusLabel: Record<string, string> = {
  running: "Em andamento",
  success: "Sucesso",
  partial: "Parcial",
  error: "Erro",
};

const statusVariant: Record<string, "outline" | "positive" | "warning" | "critical"> = {
  running: "outline",
  success: "positive",
  partial: "warning",
  error: "critical",
};

const initialState: JumpParkSyncActionState = { error: null, success: null };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function sevenDaysAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

export function JumpParkSyncPanel({ initial }: { initial: JumpParkSyncStatus }) {
  const [state, formAction, pending] = useActionState(syncJumpParkServiceOrdersAction, initialState);
  const { lastLog, currentOrderCount, databaseConfigured } = initial;

  return (
    <div className="space-y-5">
      {!databaseConfigured && <p className="text-sm text-critical">Banco de dados (Neon) não configurado neste ambiente — a sincronização não pode ser executada.</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-foreground-subtle">Última sincronização</p>
          <p className="text-sm text-foreground-muted">{lastLog ? new Date(lastLog.startedAt).toLocaleString("pt-BR") : "Nunca executada"}</p>
          {lastLog && <Badge variant={statusVariant[lastLog.status] ?? "outline"}>{statusLabel[lastLog.status] ?? lastLog.status}</Badge>}
        </div>
        <div>
          <p className="text-xs text-foreground-subtle">Registros importados na última execução</p>
          <p className="text-lg font-semibold text-foreground">{lastLog ? `${lastLog.ordersInserted ?? 0} nova(s) / ${lastLog.ordersUpdated ?? 0} atualizada(s)` : "—"}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-subtle">Quantidade atual de ordens no banco</p>
          <p className="text-lg font-semibold text-foreground">{currentOrderCount}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-subtle">Tempo da última sincronização</p>
          <p className="text-sm text-foreground-muted">
            {lastLog?.startedAt && lastLog?.finishedAt ? `${new Date(lastLog.finishedAt).getTime() - new Date(lastLog.startedAt).getTime()}ms` : "—"}
          </p>
        </div>
      </div>

      {lastLog?.errorMessage && (
        <div>
          <p className="text-xs text-foreground-subtle">Erros encontrados na última execução</p>
          <p className="text-sm text-critical">{lastLog.errorMessage}</p>
        </div>
      )}

      <form action={formAction} className="flex flex-wrap items-end gap-3 rounded-lg border border-border-subtle p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground-subtle" htmlFor="fromDate">
            De
          </label>
          <input id="fromDate" name="fromDate" type="date" defaultValue={sevenDaysAgoIso()} className={fieldClasses} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-foreground-subtle" htmlFor="toDate">
            Até
          </label>
          <input id="toDate" name="toDate" type="date" defaultValue={todayIso()} className={fieldClasses} />
        </div>
        <Button type="submit" disabled={pending || !databaseConfigured}>
          {pending ? "Sincronizando..." : "Sincronizar agora"}
        </Button>
      </form>

      {state.error && <p className="text-sm text-critical">{state.error}</p>}
      {state.success && <p className="text-sm text-positive">{state.success}</p>}

      <p className="text-xs text-foreground-subtle">
        Idempotente: rodar o mesmo intervalo de datas de novo nunca cria ordem duplicada (chave única <code>external_id</code>), só atualiza o registro existente se algo mudou na
        JumpPark. Nenhum cron automático está ativo nesta entrega — a sincronização só roda quando este botão é usado.
      </p>
    </div>
  );
}
