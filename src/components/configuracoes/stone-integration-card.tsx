"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { syncStoneAction, reprocessStoneDayAction } from "@/app/financeiro/stone-conciliacao/actions";
import type { StoneIntegrationHealth } from "@/lib/integrations/stone/healthStatus";
import type { StoneImportRun } from "@/lib/integrations/stone/persistence/types";

interface StoneStatusResponse {
  health: StoneIntegrationHealth;
  configured: boolean;
  lastImportRun: StoneImportRun | null;
  lastSuccessfulImportRun: StoneImportRun | null;
}

const healthLabels: Record<StoneIntegrationHealth, string> = {
  not_configured: "Não configurado",
  credentials_pending: "Aguardando 1ª sincronização",
  access_pending: "Aguardando liberação de acesso",
  connected: "Conectado",
  syncing: "Sincronizando",
  healthy: "Saudável",
  degraded: "Degradado",
  auth_error: "Erro de credencial",
  temporary_failure: "Falha temporária",
  stale_data: "Dado desatualizado",
  no_data: "Sem dado disponível",
};

const healthVariant: Record<StoneIntegrationHealth, "outline" | "warning" | "positive" | "critical" | "info"> = {
  not_configured: "outline",
  credentials_pending: "info",
  access_pending: "warning",
  connected: "positive",
  syncing: "info",
  healthy: "positive",
  degraded: "warning",
  auth_error: "critical",
  temporary_failure: "warning",
  stale_data: "warning",
  no_data: "outline",
};

export function StoneIntegrationCard({ initial }: { initial: StoneStatusResponse }) {
  const [status, setStatus] = useState(initial);
  const [testing, setTesting] = useState(false);
  const [syncState, syncAction, syncPending] = useActionState(syncStoneAction, { error: null });
  const [reprocessState, reprocessAction, reprocessPending] = useActionState(reprocessStoneDayAction, { error: null });

  async function testConnection() {
    setTesting(true);
    try {
      const response = await fetch("/api/stone/status", { cache: "no-store" });
      setStatus((await response.json()) as StoneStatusResponse);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border-subtle p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Stone Conciliação</p>
        <Badge variant={healthVariant[status.health]}>{healthLabels[status.health]}</Badge>
      </div>
      <p className="mt-1 text-xs text-foreground-muted">Conciliação financeira: vendas, recebimentos, antecipações, cancelamentos e chargebacks. Nunca a Conta Stone (sem saldo bancário, extrato ou Pix direto).</p>

      <div className="mt-2 space-y-1 text-xs text-foreground-subtle">
        <p>Última sincronização: {status.lastImportRun ? new Date(status.lastImportRun.startedAt).toLocaleString("pt-BR") : "nunca"}</p>
        <p>Último arquivo: {status.lastSuccessfulImportRun ? status.lastSuccessfulImportRun.referenceDate : "nenhum ainda"}</p>
        <p>Período coberto: {status.lastImportRun?.requestedPeriodFrom ?? "—"} a {status.lastImportRun?.requestedPeriodTo ?? "—"}</p>
        <p>Registros na última importação: {status.lastImportRun?.recordCount ?? 0}</p>
        {status.lastImportRun?.status === "failed" ? <p className="text-warning">Última falha: {status.lastImportRun.errorSanitized}</p> : null}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={testConnection} disabled={testing}>
          {testing ? "Testando..." : "Testar conexão"}
        </Button>
        <form action={syncAction}>
          <Button type="submit" variant="outline" size="sm" disabled={syncPending || !status.configured}>
            {syncPending ? "Sincronizando..." : "Sincronizar agora"}
          </Button>
        </form>
        {status.lastImportRun ? (
          <form action={reprocessAction}>
            <input type="hidden" name="referenceDate" value={status.lastImportRun.referenceDate} />
            <Button type="submit" variant="ghost" size="sm" disabled={reprocessPending}>
              {reprocessPending ? "Reprocessando..." : "Reprocessar último dia"}
            </Button>
          </form>
        ) : null}
        <Button asChild variant="ghost" size="sm">
          <Link href="/financeiro/stone-conciliacao">Ver conciliação completa</Link>
        </Button>
      </div>
      {syncState.error ? <p className="mt-1 text-xs text-critical">{syncState.error}</p> : null}
      {syncState.success ? <p className="mt-1 text-xs text-positive">{syncState.success}</p> : null}
      {reprocessState.error ? <p className="mt-1 text-xs text-critical">{reprocessState.error}</p> : null}
      {reprocessState.success ? <p className="mt-1 text-xs text-positive">{reprocessState.success}</p> : null}
      <p className="mt-2 text-xs text-foreground-subtle">
        Configuração: variáveis <code>STONE_API_KEY</code>/<code>STONE_ACCOUNT_ID</code> (documentação completa em <code>docs/stone-integration-architecture.md</code>). Nenhuma credencial é exibida aqui.
      </p>
    </div>
  );
}
