"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateBR } from "@/lib/utils/format";

type JumpParkDiagnosticsCause = "nao_configurado" | "token_rejeitado" | "endpoint_nao_encontrado" | "erro_http" | "timeout" | "erro_desconhecido" | null;

interface JumpParkDiagnosticsResult {
  configured: boolean;
  reachable: boolean | null;
  message: string;
  cause?: JumpParkDiagnosticsCause;
  recommendedAction?: string | null;
  checkedAt: string;
  periodQueried: { from: string; to: string } | null;
  recordCount: number | null;
  timezone: string;
  latencyMs?: number | null;
}

export function JumpParkConnectionTest({ initial }: { initial: JumpParkDiagnosticsResult }) {
  const [result, setResult] = useState<JumpParkDiagnosticsResult>(initial);
  const [isPending, setIsPending] = useState(false);
  const [callError, setCallError] = useState<string | null>(null);

  async function testConnection() {
    setIsPending(true);
    setCallError(null);
    try {
      const response = await fetch("/api/jumppark/status", { cache: "no-store" });
      if (!response.ok) {
        setCallError(`A rota de diagnóstico respondeu com erro (HTTP ${response.status}).`);
        return;
      }
      const data = (await response.json()) as JumpParkDiagnosticsResult;
      setResult(data);
    } catch {
      setCallError("Falha ao chamar o diagnóstico — verifique sua conexão e tente novamente.");
    } finally {
      setIsPending(false);
    }
  }

  const variant = result.reachable === null ? "outline" : result.reachable ? "positive" : "warning";
  const statusLabel = result.reachable === null ? "Não configurado" : result.reachable ? "Conectado" : result.cause === "token_rejeitado" ? "Token expirado" : "Sem resposta";

  return (
    <div className="space-y-2 rounded-lg border border-border-subtle p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm text-foreground">{result.message}</p>
          {result.recommendedAction ? <p className="mt-1 text-xs font-medium text-warning">Ação recomendada: {result.recommendedAction}</p> : null}
          <p className="mt-1 text-xs text-foreground-subtle">
            Última verificação: {new Date(result.checkedAt).toLocaleString("pt-BR", { timeZone: result.timezone })}
            {result.periodQueried ? ` · Período consultado: ${formatDateBR(result.periodQueried.from)}` : ""}
            {result.recordCount !== null ? ` · ${result.recordCount} registro(s) recebido(s)` : ""}
            {result.latencyMs !== null && result.latencyMs !== undefined ? ` · ${result.latencyMs}ms` : ""}
          </p>
        </div>
        <Badge variant={variant}>{statusLabel}</Badge>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={testConnection} disabled={isPending}>
        {isPending ? "Testando..." : "Testar novamente"}
      </Button>
      {callError ? <p className="text-sm text-critical">{callError}</p> : null}
    </div>
  );
}
