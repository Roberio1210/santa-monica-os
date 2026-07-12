import Link from "next/link";
import { Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format";
import { findFirstNegativeProjection, type CentralOverview, type ConsolidatedAlert } from "@/lib/operations/central";

/** Prioriza os itens mais relevantes do dia — nunca texto genérico repetido. */
function buildHighlights(overview: CentralOverview, alerts: ConsolidatedAlert[]): string[] {
  const highlights: string[] = [];
  const today = overview.asOfDate;

  const criticalAlerts = alerts.filter((a) => a.severity === "critico");
  if (criticalAlerts.length > 0) highlights.push(`${criticalAlerts.length} alerta(s) crítico(s): ${criticalAlerts[0].title}${criticalAlerts.length > 1 ? " e outros" : ""}.`);

  if (overview.accountsPayable.data) {
    const overdue = overview.accountsPayable.data.summary.totalOverdue;
    if (overdue > 0) highlights.push(`${formatCurrency(overdue)} em contas a pagar vencidas.`);
  }

  if (overview.cashFlow.data) {
    const negative = findFirstNegativeProjection(overview.cashFlow.data.projection, today);
    if (negative) highlights.push(`Fluxo projetado fica negativo na janela "${negative.point.window.replace("_", " ")}".`);
  }

  highlights.push("Agenda real ainda não integrada.");

  if (overview.jumppark.data) {
    highlights.push(`Faturamento operacional hoje: ${formatCurrency(overview.jumppark.data.dailyRevenue)}.`);
  }

  if (overview.cashFlow.data) {
    highlights.push(`Entradas ${formatCurrency(overview.cashFlow.data.dashboard.entradasHoje)} · Saídas ${formatCurrency(overview.cashFlow.data.dashboard.saidasHoje)}.`);
  }

  if ((overview.classificationPendingCount.data ?? 0) > 0) {
    highlights.push(`${overview.classificationPendingCount.data} lançamento(s) sem classificação.`);
  }

  return highlights.slice(0, 6);
}

export function ZezinhoSummaryCard({ overview, alerts }: { overview: CentralOverview; alerts: ConsolidatedAlert[] }) {
  const highlights = buildHighlights(overview, alerts);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          Zézinho — Resumo do dia
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <ul className="space-y-1.5 text-sm text-foreground-muted">
          {highlights.map((line, i) => (
            <li key={i}>• {line}</li>
          ))}
        </ul>
        <Button asChild>
          <Link href="/zezinho">Conversar com o Zézinho</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
