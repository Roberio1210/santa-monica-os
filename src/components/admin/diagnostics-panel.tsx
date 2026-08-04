"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AdminDiagnosticsSnapshot } from "@/lib/admin/diagnostics";

function StatusBadge({ ok }: { ok: boolean | null }) {
  if (ok === null) return <Badge variant="outline">Não configurado</Badge>;
  return <Badge variant={ok ? "positive" : "critical"}>{ok ? "Conectado" : "Desconectado"}</Badge>;
}

export function DiagnosticsPanel({ initial }: { initial: AdminDiagnosticsSnapshot }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [isPending, setIsPending] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  async function testNow() {
    setIsPending(true);
    setCallError(null);
    try {
      const response = await fetch("/api/admin/diagnostics", { cache: "no-store" });
      if (!response.ok) {
        setCallError(`A rota de diagnóstico respondeu com erro (HTTP ${response.status}).`);
        return;
      }
      setSnapshot((await response.json()) as AdminDiagnosticsSnapshot);
    } catch {
      setCallError("Falha ao chamar o diagnóstico — verifique sua conexão e tente novamente.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-foreground-subtle">
          Última verificação: {new Date(snapshot.checkedAt).toLocaleString("pt-BR")} · versão {snapshot.version} ·{" "}
          {snapshot.commitSha ? `commit ${snapshot.commitSha.slice(0, 7)}` : "commit indisponível"} · ambiente {snapshot.environment}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={testNow} disabled={isPending}>
          {isPending ? "Testando..." : "Testar integrações agora"}
        </Button>
      </div>
      {callError ? <p className="text-sm text-critical">{callError}</p> : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Banco de dados (Neon)</CardTitle>
            <StatusBadge ok={snapshot.database.reachable} />
          </CardHeader>
          <CardContent className="space-y-1 pt-0 text-sm text-foreground-muted">
            <p>Configurado: {snapshot.database.configured ? "Sim" : "Não"}</p>
            {snapshot.database.latencyMs !== null ? <p>Latência: {snapshot.database.latencyMs}ms</p> : null}
            {snapshot.database.error ? <p className="text-critical">{snapshot.database.error}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>JumpPark</CardTitle>
            <StatusBadge ok={snapshot.jumpPark.reachable} />
          </CardHeader>
          <CardContent className="space-y-1 pt-0 text-sm text-foreground-muted">
            <p>{snapshot.jumpPark.message}</p>
            {snapshot.jumpPark.recommendedAction ? <p className="font-medium text-warning">Ação recomendada: {snapshot.jumpPark.recommendedAction}</p> : null}
            {snapshot.jumpPark.periodQueried ? <p>Endpoint lógico consultado: ordens de serviço ({snapshot.jumpPark.periodQueried.from})</p> : null}
            {snapshot.jumpPark.recordCount !== null ? <p>Registros recebidos: {snapshot.jumpPark.recordCount}</p> : null}
            {snapshot.jumpPark.latencyMs !== null ? <p>Latência: {snapshot.jumpPark.latencyMs}ms</p> : null}
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-foreground-subtle">
        Este painel mostra o resultado da verificação mais recente (ao vivo, nunca cacheada). Ele não mantém um histórico persistido de tentativas anteriores — para o
        histórico completo de erros, consulte os Runtime Logs do projeto na Vercel.
      </p>
    </div>
  );
}
