import { findTrend } from "@/lib/finance/intelligence/trends/engine";
import type { Diagnostic, DiagnosticConfidence, FinancialMetricSet, TrendResult } from "@/lib/finance/intelligence/types";

/**
 * Motor de diagnósticos (Sprint 8, seção "DIAGNÓSTICOS") — regras fixas, reproduzíveis, sempre
 * rastreáveis a `metrics`/`trends` (nunca uma inferência solta). Cada regra é uma função
 * independente e testável; `runDiagnostics` só as combina.
 */

const TICKET_DROP_THRESHOLD_PERCENT = 10;
const FEE_INCREASE_THRESHOLD_PERCENT = 5;
const OVERDUE_GROWTH_THRESHOLD_PERCENT = 15;
const SLOW_SETTLEMENT_THRESHOLD_DAYS = 2;
const EXCESSIVE_ADVANCE_THRESHOLD_PERCENT = 30;
const HIGH_CONCENTRATION_THRESHOLD_PERCENT = 50;
const ABNORMAL_VOLUME_THRESHOLD_PERCENT = 30;
/** Abaixo disso, qualquer diagnóstico baseado em tendência tem confiança reduzida — poucas vendas tornam a variação percentual pouco confiável. */
const MIN_SAMPLE_FOR_HIGH_CONFIDENCE = 30;
const MIN_SAMPLE_FOR_MEDIUM_CONFIDENCE = 5;

function confidenceFromSampleSize(transactionCount: number): DiagnosticConfidence {
  if (transactionCount >= MIN_SAMPLE_FOR_HIGH_CONFIDENCE) return "high";
  if (transactionCount >= MIN_SAMPLE_FOR_MEDIUM_CONFIDENCE) return "medium";
  return "low";
}

function pct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function currency(value: number): string {
  return `R$ ${value.toFixed(2)}`;
}

export function diagnoseTicketDrop(metrics: FinancialMetricSet, trends: TrendResult[]): Diagnostic | null {
  const trend = findTrend(trends, "averageTicket");
  if (!trend || trend.direction !== "caindo" || trend.percentageChange === null || Math.abs(trend.percentageChange) < TICKET_DROP_THRESHOLD_PERCENT) return null;
  return {
    id: "ticket_medio_caiu",
    severity: "warning",
    confidence: confidenceFromSampleSize(metrics.transactionCount),
    title: "Ticket médio caiu significativamente",
    description: `O ticket médio caiu ${pct(Math.abs(trend.percentageChange))} em relação ao período anterior.`,
    reason: `Ticket médio atual ${currency(trend.currentValue)} vs. ${currency(trend.previousValue)} no período anterior — queda acima do limite de ${TICKET_DROP_THRESHOLD_PERCENT}%.`,
    evidence: [`Ticket médio: ${currency(trend.currentValue)} (anterior: ${currency(trend.previousValue)})`, `Variação: ${pct(trend.percentageChange)}`],
    recommendation: "Investigar se houve mudança no mix de vendas (produtos/serviços de menor valor) ou queda no valor médio por cliente.",
  };
}

export function diagnoseRevenueGrowth(metrics: FinancialMetricSet, trends: TrendResult[]): Diagnostic | null {
  const trend = findTrend(trends, "netRevenue");
  if (!trend || trend.direction !== "subindo" || trend.percentageChange === null) return null;
  return {
    id: "receita_cresceu",
    severity: "info",
    confidence: confidenceFromSampleSize(metrics.transactionCount),
    title: "Receita líquida cresceu",
    description: `A receita líquida cresceu ${pct(trend.percentageChange)} em relação ao período anterior.`,
    reason: `Receita líquida atual ${currency(trend.currentValue)} vs. ${currency(trend.previousValue)} no período anterior.`,
    evidence: [`Receita líquida: ${currency(trend.currentValue)} (anterior: ${currency(trend.previousValue)})`, `Variação: ${pct(trend.percentageChange)}`],
    recommendation: "Manter as ações comerciais e operacionais atuais — o crescimento está sendo capturado.",
  };
}

export function diagnoseFeeIncrease(metrics: FinancialMetricSet, trends: TrendResult[]): Diagnostic | null {
  const trend = findTrend(trends, "feePercentage");
  if (!trend || trend.direction !== "subindo" || trend.absoluteChange < FEE_INCREASE_THRESHOLD_PERCENT / 100) return null;
  return {
    id: "taxas_aumentaram",
    severity: "warning",
    confidence: confidenceFromSampleSize(metrics.transactionCount),
    title: "Taxas aumentaram",
    description: `O percentual de taxas subiu de ${pct(trend.previousValue)} para ${pct(trend.currentValue)}.`,
    reason: `Possível mudança no mix de bandeiras/parcelamento (crédito parcelado tem taxa maior que débito) ou renegociação de taxa com a adquirente.`,
    evidence: [`Percentual de taxas: ${pct(trend.currentValue)} (anterior: ${pct(trend.previousValue)})`, `Total de taxas no período: ${currency(metrics.totalFees)}`],
    recommendation: "Vale revisar as taxas negociadas com a adquirente e o mix de formas de pagamento incentivado no ponto de venda.",
  };
}

export function diagnoseOverdueGrowth(metrics: FinancialMetricSet, trends: TrendResult[]): Diagnostic | null {
  const trend = findTrend(trends, "overdueReceivablesAmount");
  if (!trend || trend.direction !== "subindo" || trend.percentageChange === null || trend.percentageChange < OVERDUE_GROWTH_THRESHOLD_PERCENT) return null;
  return {
    id: "recebiveis_atrasados_cresceram",
    severity: metrics.overdueReceivablesAmount > metrics.settledReceivablesAmount * 0.2 ? "critical" : "warning",
    confidence: confidenceFromSampleSize(metrics.transactionCount),
    title: "Recebíveis atrasados cresceram",
    description: `O valor de recebíveis vencidos cresceu ${pct(trend.percentageChange)} em relação ao período anterior.`,
    reason: `Recebíveis vencidos atuais ${currency(trend.currentValue)} vs. ${currency(trend.previousValue)} no período anterior.`,
    evidence: [`Recebíveis vencidos: ${currency(trend.currentValue)} (anterior: ${currency(trend.previousValue)})`],
    recommendation: "Investigar a causa do atraso — divergência de liquidação, chargeback não identificado, ou defasagem no arquivo Stone.",
  };
}

export function diagnoseSlowSettlement(metrics: FinancialMetricSet): Diagnostic | null {
  if (metrics.averageSettlementDays === null || metrics.averageSettlementDays <= SLOW_SETTLEMENT_THRESHOLD_DAYS) return null;
  return {
    id: "liquidacao_lenta",
    severity: "warning",
    confidence: confidenceFromSampleSize(metrics.transactionCount),
    title: "Liquidação mais lenta que o esperado",
    description: `O prazo médio de liquidação está em ${metrics.averageSettlementDays.toFixed(1)} dias além do previsto.`,
    reason: `Prazo médio observado acima do limite de referência de ${SLOW_SETTLEMENT_THRESHOLD_DAYS} dias.`,
    evidence: [`Prazo médio de liquidação: ${metrics.averageSettlementDays.toFixed(1)} dias`],
    recommendation: "Confirmar se a defasagem é normal para o meio de pagamento predominante ou se há um problema pontual na adquirente.",
  };
}

export function diagnoseExcessiveAdvance(metrics: FinancialMetricSet): Diagnostic | null {
  if (metrics.advancedPercentage < EXCESSIVE_ADVANCE_THRESHOLD_PERCENT) return null;
  return {
    id: "excesso_antecipacao",
    severity: "warning",
    confidence: confidenceFromSampleSize(metrics.transactionCount),
    title: "Excesso de antecipação de recebíveis",
    description: `${pct(metrics.advancedPercentage)} do valor liquidado no período veio de antecipação.`,
    reason: `Percentual antecipado acima do limite de referência de ${EXCESSIVE_ADVANCE_THRESHOLD_PERCENT}%.`,
    evidence: [`Valor antecipado: ${currency(metrics.advancedAmount)}`, `Percentual antecipado: ${pct(metrics.advancedPercentage)}`],
    recommendation: "Avaliar se a antecipação é estritamente necessária — a taxa de antecipação reduz a margem líquida.",
  };
}

export function diagnoseHighConcentration(metrics: FinancialMetricSet): Diagnostic | null {
  if (metrics.topSalesConcentration < HIGH_CONCENTRATION_THRESHOLD_PERCENT) return null;
  return {
    id: "concentracao_elevada",
    severity: "warning",
    confidence: confidenceFromSampleSize(metrics.transactionCount),
    title: "Concentração elevada em poucas vendas",
    description: `As ~10% maiores vendas do período respondem por ${pct(metrics.topSalesConcentration)} da receita bruta.`,
    reason: `Concentração acima do limite de referência de ${HIGH_CONCENTRATION_THRESHOLD_PERCENT}%.`,
    evidence: [`Concentração das maiores vendas: ${pct(metrics.topSalesConcentration)}`, `Maior venda do período: ${currency(metrics.highestSale)}`],
    recommendation: "Diversificar a base de clientes/vendas reduz o risco de uma única venda grande distorcer o resultado do período.",
  };
}

export function diagnoseAbnormalVolume(metrics: FinancialMetricSet, trends: TrendResult[]): Diagnostic | null {
  const trend = findTrend(trends, "transactionCount");
  if (!trend || trend.percentageChange === null || Math.abs(trend.percentageChange) < ABNORMAL_VOLUME_THRESHOLD_PERCENT) return null;
  const above = trend.direction === "subindo";
  return {
    id: above ? "volume_acima_da_media" : "volume_abaixo_da_media",
    severity: above ? "info" : "warning",
    confidence: confidenceFromSampleSize(metrics.transactionCount),
    title: above ? "Volume de vendas acima da média" : "Volume de vendas abaixo da média",
    description: `A quantidade de vendas variou ${pct(trend.percentageChange)} em relação ao período anterior.`,
    reason: `Quantidade de vendas atual ${trend.currentValue} vs. ${trend.previousValue} no período anterior.`,
    evidence: [`Quantidade de vendas: ${trend.currentValue} (anterior: ${trend.previousValue})`],
    recommendation: above ? "Confirmar se a operação (equipe, estoque, agenda) suporta o volume mais alto de forma sustentável." : "Investigar a causa da queda de movimento — sazonalidade, concorrência, ou problema operacional.",
  };
}

const DIAGNOSTIC_RULES: ((metrics: FinancialMetricSet, trends: TrendResult[]) => Diagnostic | null)[] = [
  diagnoseTicketDrop,
  diagnoseRevenueGrowth,
  diagnoseFeeIncrease,
  diagnoseOverdueGrowth,
  (metrics) => diagnoseSlowSettlement(metrics),
  (metrics) => diagnoseExcessiveAdvance(metrics),
  (metrics) => diagnoseHighConcentration(metrics),
  diagnoseAbnormalVolume,
];

/** Executa todas as regras de diagnóstico — nunca lança, uma regra sem sinal suficiente simplesmente não produz diagnóstico. */
export function runDiagnostics(metrics: FinancialMetricSet, trends: TrendResult[]): Diagnostic[] {
  return DIAGNOSTIC_RULES.map((rule) => rule(metrics, trends)).filter((d): d is Diagnostic => d !== null);
}
