"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateBR } from "@/lib/utils/format";

interface JumpParkDiagnosticsResult {
  configured: boolean;
  reachable: boolean | null;
  message: string;
  checkedAt: string;
  periodQueried: { from: string; to: string } | null;
  recordCount: number | null;
  timezone: string;
}

export function JumpParkConnectionTest({ initial }: { initial: JumpParkDiagnosticsResult }) {
  const [result, setResult] = useState<JumpParkDiagnosticsResult>(initial);
  const [isPending, setIsPending] = useState(false);

  async function testConnection() {
    setIsPending(true);
    try {
      const response = await fetch("/api/jumppark/status", { cache: "no-store" });
      const data = (await response.json()) as JumpParkDiagnosticsResult;
      setResult(data);
    } catch {
      setResult((prev) => ({ ...prev, reachable: false, message: "Falha ao chamar o diagnóstico — verifique a rede.", checkedAt: new Date().toISOString() }));
    } finally {
      setIsPending(false);
    }
  }

  const variant = result.reachable === null ? "outline" : result.reachable ? "positive" : "warning";

  return (
    <div className="space-y-2 rounded-lg border border-border-subtle p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm text-foreground">{result.message}</p>
          <p className="text-xs text-foreground-subtle">
            Última verificação: {new Date(result.checkedAt).toLocaleString("pt-BR", { timeZone: result.timezone })}
            {result.periodQueried ? ` · Período consultado: ${formatDateBR(result.periodQueried.from)}` : ""}
            {result.recordCount !== null ? ` · ${result.recordCount} registro(s) recebido(s)` : ""}
          </p>
        </div>
        <Badge variant={variant}>{result.reachable === null ? "Não configurado" : result.reachable ? "Conectado" : "Sem resposta"}</Badge>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={testConnection} disabled={isPending}>
        {isPending ? "Testando..." : "Testar conexão JumpPark"}
      </Button>
    </div>
  );
}
