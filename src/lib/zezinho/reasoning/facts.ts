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

      // Sprint 7.0 (Z2) — um Fact por item pedido pelo usuário, nunca combinando dois números
      // numa frase só. Só emite quando `status === "ok"` (arquivo obtido e processado de verdade)
      // — sem isso, todo valor seria um zero de mentira, nunca um "zero real".
      case "stone_reconciliation_summary": {
        if (result.status !== "ok") break;
        const s = result.summary;
        const source = result.source;

        facts.push({ key: "stone_file_period", label: "Período do arquivo Stone", statement: `Arquivo de conciliação Stone referente a ${s.referenceDate}.`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_processed_at", label: "Processamento do arquivo Stone", statement: `Arquivo gerado pela Stone em ${s.generationDateTime}, processado por nós em ${s.processedAt}.`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_transaction_count", label: "Transações Stone", statement: `O arquivo Stone de ${s.referenceDate} contém ${s.transactionCount} transação(ões).`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_gross_amount_total", label: "Valor bruto Stone", statement: `Foram identificados R$ ${s.grossAmountTotal.toFixed(2)} em vendas brutas.`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_net_amount_total", label: "Valor líquido Stone", statement: `O valor líquido processado foi R$ ${s.netAmountTotal.toFixed(2)}.`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_fees_total", label: "Taxas Stone", statement: `Foram identificados R$ ${s.feesTotal.toFixed(2)} em taxas.`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_debit_transaction_count", label: "Transações de débito Stone", statement: `${s.debitTransactionCount} transação(ões) de débito.`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_credit_transaction_count", label: "Transações de crédito Stone", statement: `${s.creditTransactionCount} transação(ões) de crédito.`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_installment_sale_count", label: "Vendas parceladas Stone", statement: `${s.installmentSaleCount} venda(s) parcelada(s).`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_installment_count", label: "Parcelas Stone", statement: `${s.installmentCount} parcela(s) no total.`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_expected_payments", label: "Pagamentos previstos Stone", statement: `${s.expectedPaymentsCount} parcela(s) prevista(s), totalizando R$ ${s.expectedPaymentsAmountTotal.toFixed(2)}.`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_realized_payments", label: "Pagamentos realizados Stone", statement: `${s.realizedPaymentsCount} repasse(s) efetivamente liquidado(s), totalizando R$ ${s.realizedPaymentsAmountTotal.toFixed(2)}.`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_cancellation_count", label: "Cancelamentos Stone", statement: `Existem ${s.cancellationCount} cancelamento(s).`, direction: s.cancellationCount > 0 ? "queda" : "estavel", source, isProxy: false });
        facts.push({ key: "stone_refund_count", label: "Estornos Stone", statement: `Existem ${s.refundCount} estorno(s) de chargeback.`, direction: s.refundCount > 0 ? "queda" : "estavel", source, isProxy: false });
        facts.push({ key: "stone_chargeback_count", label: "Chargebacks Stone", statement: `Existem ${s.chargebackCount} chargeback(s).`, direction: s.chargebackCount > 0 ? "queda" : "estavel", source, isProxy: false });
        facts.push({ key: "stone_advance_count", label: "Antecipações Stone", statement: `${s.advanceCount} parcela(s) antecipada(s) identificada(s).`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_pix_included", label: "PIX no arquivo Stone", statement: s.pixNote, direction: "indisponivel", source, isProxy: false });

        if (s.financialPosition.status === "ok" || s.financialPosition.status === "stale_data") {
          facts.push({
            key: "stone_financial_position",
            label: "Última posição financeira processada (Stone)",
            statement: `A última posição financeira processada é de R$ ${s.financialPosition.amount!.toFixed(2)}, referente a ${s.financialPosition.referenceDate}. ${s.financialPosition.limitation}`,
            direction: "indisponivel",
            source,
            isProxy: false,
          });
        }

        if (s.terminalSerialNumbers.length > 0) {
          facts.push({ key: "stone_terminal_count", label: "Terminais Stone", statement: `${s.terminalSerialNumbers.length} terminal(is) identificado(s) no arquivo.`, direction: "indisponivel", source, isProxy: false });
        }
        break;
      }

      // Sprint 7.0 (Z3) — Agenda Financeira própria do Diretor Financeiro. A Stone só forneceu os
      // fatos-base; toda leitura aqui já veio calculada por financialSchedule.ts (Diretor
      // Financeiro), nunca um cálculo novo neste arquivo.
      case "stone_financial_schedule": {
        if (result.status !== "ok" || !result.result.schedule) break;
        const schedule = result.result.schedule;
        const source = result.source;
        const curve7 = schedule.curves.find((c) => c.label === "proximos_7_dias");
        const curve30 = schedule.curves.find((c) => c.label === "proximos_30_dias");
        const totalSettled = schedule.daily.reduce((sum, d) => sum + d.settledAmount, 0);
        const totalPending = schedule.daily.reduce((sum, d) => sum + d.pendingCount, 0);
        const totalOverdue = schedule.daily.reduce((sum, d) => sum + d.overdueCount, 0);

        if (curve7) facts.push({ key: "stone_schedule_net_expected_7d", label: "Previsto para os próximos 7 dias (Stone)", statement: `Há R$ ${curve7.netAmountExpected.toFixed(2)} líquidos previstos para os próximos sete dias.`, direction: "indisponivel", source, isProxy: false });
        if (curve30) facts.push({ key: "stone_schedule_net_expected_30d", label: "Previsto para os próximos 30 dias (Stone)", statement: `Há R$ ${curve30.netAmountExpected.toFixed(2)} líquidos previstos para os próximos trinta dias.`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_schedule_settled_period", label: "Liquidado no período (Stone)", statement: `R$ ${totalSettled.toFixed(2)} já foram liquidados no período.`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_schedule_pending_count", label: "Recebíveis pendentes (Stone)", statement: `Existem ${totalPending} recebível(is) pendente(s).`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_schedule_overdue_count", label: "Recebíveis atrasados (Stone)", statement: `Existem ${totalOverdue} recebível(is) em atraso.`, direction: totalOverdue > 0 ? "queda" : "estavel", source, isProxy: false });
        break;
      }

      // Sprint 7.0 (Z3) — Conciliação Stone × JumpPark. Nunca cria/corrige nada, só sinaliza.
      case "stone_jumppark_reconciliation": {
        if (result.status !== "ok") break;
        const { results, divergences } = result.result;
        const source = result.source;
        const exactCount = results.filter((r) => r.type === "exact_match").length;
        const probableCount = results.filter((r) => r.type === "probable_match").length;
        const pendingCount = results.filter((r) => r.type === "pending_processing").length;

        facts.push({ key: "stone_jumppark_exact_matches", label: "Correspondências exatas Stone × JumpPark", statement: `Foram encontradas ${exactCount} correspondência(s) exata(s) entre Stone e JumpPark.`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_jumppark_probable_matches", label: "Correspondências prováveis Stone × JumpPark", statement: `Foram encontradas ${probableCount} correspondência(s) provável(is) entre Stone e JumpPark — nunca tratadas como certeza.`, direction: "indisponivel", source, isProxy: false });
        facts.push({ key: "stone_jumppark_divergence_count", label: "Divergências Stone × JumpPark", statement: `Existem ${divergences.length} divergência(s) que precisam de conferência.`, direction: divergences.length > 0 ? "queda" : "estavel", source, isProxy: false });
        if (pendingCount > 0) {
          facts.push({ key: "stone_jumppark_pending_processing", label: "Vendas em processamento pendente (Stone × JumpPark)", statement: `${pendingCount} venda(s) permanece(m) como processamento pendente e ainda não deve(m) ser tratada(s) como erro.`, direction: "indisponivel", source, isProxy: false });
        }
        break;
      }

      // Sprint 7.0 (Z4) — resumo das divergências já persistidas (nunca recalcula).
      case "stone_divergences_summary": {
        if (result.status !== "ok") break;
        const s = result.summary;
        const source = result.source;
        facts.push({ key: "stone_divergences_open_count", label: "Divergências Stone em aberto", statement: `Existem ${s.openCount} divergência(s) em aberto entre Stone e JumpPark.`, direction: s.openCount > 0 ? "queda" : "estavel", source, isProxy: false });
        if (s.highPriorityOpenCount > 0) {
          facts.push({ key: "stone_divergences_high_priority", label: "Divergências Stone de alta prioridade", statement: `${s.highPriorityOpenCount} divergência(s) em aberto são de alta prioridade.`, direction: "queda", source, isProxy: false });
        }
        break;
      }

      // Sprint 7.0 (Z4) — status/saúde real da integração (histórico de importação, nunca uma suposição).
      case "stone_integration_health": {
        if (result.status !== "ok") break;
        const { report } = result;
        const source = result.source;
        facts.push({ key: "stone_integration_health_status", label: "Saúde da integração Stone", statement: `A integração Stone Conciliação está com status "${report.health}".`, direction: report.health === "healthy" || report.health === "connected" ? "estavel" : "indisponivel", source, isProxy: false });
        break;
      }
    }
  }

  return facts;
}
