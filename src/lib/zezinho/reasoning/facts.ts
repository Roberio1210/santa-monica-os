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

      // As três ferramentas abaixo entraram no catálogo na Sprint 4.0 (Z1/Z2) mas ainda não
      // viravam `Fact` — sem isso, `findings`/`diagnosis`/`recommend` nunca conseguiam usar clima,
      // meta ou padrão histórico como evidência. A Z3 fecha essa lacuna (nunca redefine o cálculo
      // em si, só extrai o que a ferramenta já calculou).
      case "weather_forecast": {
        if (result.status !== "ok" || !result.forecast.current) break;
        const c = result.forecast.current;
        const rainNote = result.forecast.dailyForecast.some((d) => d.willRain) ? " Há previsão de chuva nos próximos dias." : "";
        facts.push({
          key: "weather_current",
          label: "Clima atual",
          statement: `Condição atual: ${c.condition}, ${c.temperature}°C (sensação ${c.feelsLike}°C).${rainNote}`,
          direction: "indisponivel",
          source: result.source,
          isProxy: false,
        });
        break;
      }

      case "goal_progress": {
        if (result.status !== "ok" || !result.progress) break;
        const p = result.progress;
        const direction = p.pace === "acima_do_ritmo" ? "aumento" : p.pace === "abaixo_do_ritmo" ? "queda" : p.pace === "no_ritmo" ? "estavel" : "indisponivel";
        facts.push({
          key: "goal_progress",
          label: "Progresso da meta",
          statement: `Meta "${p.goal.label}": ${p.percentComplete}% atingido, ritmo ${p.pace.replace(/_/g, " ")}.`,
          direction,
          source: result.source,
          isProxy: false,
        });
        break;
      }

      case "historical_pattern": {
        if (result.status !== "ok" || !result.pattern || result.pattern.sampleWeeks === 0) break;
        const p = result.pattern;
        facts.push({
          key: "historical_pattern",
          label: "Padrão histórico",
          statement: `Nas últimas ${p.sampleWeeks} ocorrência(s) deste dia da semana, o típico é ${p.typicalVehicles} veículo(s) e R$ ${p.typicalRevenue?.toFixed(2)} de faturamento (amostra ${p.sampleQuality}).`,
          direction: "indisponivel",
          source: result.source,
          isProxy: p.sampleQuality === "insuficiente",
        });
        break;
      }

      case "situational_context": {
        const { areas, weekdayLabel, timeHM } = result.context;
        facts.push({
          key: "situational_context",
          label: "Contexto situacional",
          statement: `Agora é ${weekdayLabel}, ${timeHM}. Lavação: ${areas.lavacao.isOpen ? areas.lavacao.stage.replace(/_/g, " ") : "fechada"}. Estacionamento: ${areas.estacionamento.isOpen ? areas.estacionamento.stage.replace(/_/g, " ") : "fechado"}.`,
          direction: "indisponivel",
          source: result.source,
          isProxy: false,
        });
        break;
      }

      case "accounts_payable": {
        if (result.status !== "ok" || !result.summary) break;
        const s = result.summary;
        facts.push({
          key: "accounts_payable",
          label: "Contas a pagar",
          statement: `Contas a pagar: R$ ${s.totalPending.toFixed(2)} pendente, R$ ${s.totalOverdue.toFixed(2)} vencido.`,
          direction: s.totalOverdue > 0 ? "queda" : "estavel",
          source: result.source,
          isProxy: false,
        });
        break;
      }

      case "accounts_receivable": {
        if (result.status !== "ok" || !result.dashboard) break;
        const d = result.dashboard;
        facts.push({
          key: "accounts_receivable",
          label: "Contas a receber",
          statement: `Contas a receber: R$ ${d.overdueTotal.toFixed(2)} em atraso, R$ ${d.receiveThisWeek.toFixed(2)} previsto para esta semana.`,
          direction: d.overdueTotal > 0 ? "queda" : "estavel",
          source: result.source,
          isProxy: false,
        });
        break;
      }
    }
  }

  return facts;
}
