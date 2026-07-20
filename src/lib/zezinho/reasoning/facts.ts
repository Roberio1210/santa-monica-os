import { metric, type ComparisonMetric } from "@/lib/zezinho/comparison-engine";
import { metricSentence } from "@/lib/zezinho/response-builder";
import type { ToolResult } from "@/lib/zezinho/tools/types";
import type { Fact } from "@/lib/zezinho/reasoning/types";

/**
 * Extrai fatos (Etapa 4, primeira camada) dos resultados das ferramentas — nunca calcula nada
 * novo, só narra o que já veio pronto. Reaproveita `metricSentence` (já corrigida para a ordem
 * anterior->atual na sprint de bugs) para nunca duplicar essa lógica.
 */

function factsFromMetrics(metrics: ComparisonMetric[], source: string): Fact[] {
  return metrics.map((m) => ({ key: m.key, label: m.label, statement: metricSentence(m), direction: m.comparison.trend, source, isProxy: false }));
}

export function extractFacts(toolResults: ToolResult[]): Fact[] {
  const facts: Fact[] = [];

  for (const result of toolResults) {
    switch (result.id) {
      case "jumppark_period_summary":
        facts.push(...factsFromMetrics(result.metrics, result.source));
        break;

      case "cash_ledger_totals":
      case "dre_result":
        facts.push(...factsFromMetrics(result.metrics, result.source));
        break;

      case "jumppark_wash_packages": {
        const hasB = result.packageCountsB.Bronze + result.packageCountsB.Silver + result.packageCountsB.Gold > 0;
        for (const label of ["Bronze", "Silver", "Gold"] as const) {
          const m = metric(`package${label}`, `Pacote ${label}`, "count", result.packageCountsA[label], hasB ? result.packageCountsB[label] : null, hasB, result.source);
          facts.push({ key: m.key, label: m.label, statement: metricSentence(m), direction: m.comparison.trend, source: result.source, isProxy: false });
        }
        break;
      }

      case "crm_customers": {
        const atRisk = result.customers.filter((c) => c.status === "em_risco" || c.status === "perdido");
        if (atRisk.length > 0) {
          facts.push({
            key: "crm_at_risk_count",
            label: "Clientes em risco",
            statement: `${atRisk.length} cliente(s) estão em risco ou perdidos no CRM.`,
            direction: "indisponivel",
            source: result.source,
            isProxy: false,
          });
          for (const c of atRisk.slice(0, 5)) {
            facts.push({
              key: `crm_customer_${c.id}`,
              label: c.name,
              statement: `${c.name}: ${c.statusReason}${c.daysSinceLastVisit !== null ? ` (${c.daysSinceLastVisit} dia(s) sem retorno)` : ""}.`,
              direction: "indisponivel",
              source: result.source,
              isProxy: false,
            });
          }
        }
        break;
      }

      case "inventory_overview":
        facts.push({
          key: "inventory_near_empty",
          label: "Estoque quase vazio",
          statement: `${result.summary.nearEmptyCount} item(ns) de estoque estão quase no fim.`,
          direction: result.summary.nearEmptyCount > 0 ? "queda" : "estavel",
          source: result.source,
          isProxy: false,
        });
        break;

      case "central_alerts":
        for (const a of result.alerts.slice(0, 6)) {
          facts.push({ key: `alert_${a.title}`, label: a.title, statement: a.description, direction: "indisponivel", source: result.source, isProxy: false });
        }
        break;

      case "full_period_comparison":
        facts.push(...factsFromMetrics(result.report.metrics, result.source));
        break;
    }
  }

  return facts;
}
