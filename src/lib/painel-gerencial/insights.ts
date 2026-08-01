import { comparePeriods } from "@/lib/integrations/jumppark/operations-summary";
import { formatCurrency, formatPercent } from "@/lib/utils/format";
import type {
  CustomerAggregate,
  ExpensesSummary,
  ManagementFinding,
  ManagementIndicators,
  ManagementOrderRow,
  ServiceAggregate,
} from "@/lib/painel-gerencial/types";
import { groupNetRevenueByDay } from "@/lib/painel-gerencial/orders";

/**
 * "Pontos de atenção" — análises determinísticas, sem modelo generativo. Cada checagem é pura,
 * compara o período atual com o anterior (ou com a própria distribuição do período) e só produz
 * uma conclusão quando há evidência numérica real. Nunca inventa causa — só aponta o número e uma
 * recomendação simples.
 */

const SIGNIFICANT_DELTA_PERCENT = 10;

export interface InsightsInput {
  periodLabel: string;
  currentRows: ManagementOrderRow[];
  currentIndicators: ManagementIndicators;
  previousIndicators: ManagementIndicators;
  currentServices: ServiceAggregate[];
  currentCustomers: CustomerAggregate[];
  previousCustomers: CustomerAggregate[];
  currentExpenses: ExpensesSummary;
  previousExpenses: ExpensesSummary;
}

function revenueVariationFinding(input: InsightsInput): ManagementFinding | null {
  const cmp = comparePeriods(input.currentIndicators.netRevenue, input.previousIndicators.netRevenue);
  if (cmp.deltaPercent === null || Math.abs(cmp.deltaPercent) < SIGNIFICANT_DELTA_PERCENT) return null;
  const isDrop = cmp.deltaPercent < 0;
  return {
    id: "revenue-variation",
    title: isDrop ? "Queda de faturamento em relação ao período anterior" : "Alta de faturamento em relação ao período anterior",
    metric: "Faturamento líquido",
    comparison: `${formatCurrency(cmp.current)} vs. ${formatCurrency(cmp.previous ?? 0)} no período anterior`,
    period: input.periodLabel,
    evidence: `Variação de ${formatPercent(cmp.deltaPercent, 1)}`,
    recommendation: isDrop
      ? "Investigar a causa da queda (menos atendimentos, ticket médio menor ou concentração de descontos) antes de agir."
      : "Identificar o que impulsionou o crescimento para tentar repetir no próximo período.",
    severity: isDrop ? "warning" : "info",
  };
}

function averageTicketVariationFinding(input: InsightsInput): ManagementFinding | null {
  if (input.currentIndicators.averageTicket === null || input.previousIndicators.averageTicket === null) return null;
  const cmp = comparePeriods(input.currentIndicators.averageTicket, input.previousIndicators.averageTicket);
  if (cmp.deltaPercent === null || Math.abs(cmp.deltaPercent) < SIGNIFICANT_DELTA_PERCENT) return null;
  const isDrop = cmp.deltaPercent < 0;
  return {
    id: "average-ticket-variation",
    title: isDrop ? "Queda no ticket médio em relação ao período anterior" : "Aumento no ticket médio em relação ao período anterior",
    metric: "Ticket médio",
    comparison: `${formatCurrency(cmp.current)} vs. ${formatCurrency(cmp.previous ?? 0)} no período anterior`,
    period: input.periodLabel,
    evidence: `Variação de ${formatPercent(cmp.deltaPercent, 1)}`,
    recommendation: isDrop
      ? "Avaliar se houve mais serviços de menor valor ou descontos maiores no período."
      : "Serviços de maior valor estão puxando o ticket para cima — bom sinal para manter o mix atual.",
    severity: isDrop ? "warning" : "info",
  };
}

const CONCENTRATION_THRESHOLD_PERCENT = 40;

function serviceConcentrationFinding(input: InsightsInput): ManagementFinding | null {
  if (input.currentServices.length < 2) return null;
  const top = input.currentServices[0];
  if (top.revenueShare < CONCENTRATION_THRESHOLD_PERCENT) return null;
  return {
    id: "service-concentration",
    title: "Concentração excessiva em poucos serviços",
    metric: `Participação de "${top.description}" no faturamento de serviços`,
    comparison: `${formatPercent(top.revenueShare, 1)} do faturamento de serviços vem de um único serviço`,
    period: input.periodLabel,
    evidence: `${formatCurrency(top.grossAmount)} em "${top.description}" de um total de ${input.currentServices.length} serviços distintos`,
    recommendation: "Avaliar oportunidades de upsell para diversificar a receita entre mais serviços.",
    severity: "info",
  };
}

const RELEVANT_CUSTOMER_RANK = 3;

function inactiveRelevantCustomerFinding(input: InsightsInput): ManagementFinding | null {
  const currentIds = new Set(input.currentCustomers.map((c) => c.customerId));
  const topPrevious = [...input.previousCustomers].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, RELEVANT_CUSTOMER_RANK);
  const missing = topPrevious.find((c) => !currentIds.has(c.customerId));
  if (!missing) return null;
  return {
    id: "inactive-relevant-customer",
    title: "Cliente relevante sem retorno no período",
    metric: "Cliente entre os que mais gastaram no período anterior",
    comparison: `${missing.name ?? "Cliente não identificado"} gastou ${formatCurrency(missing.totalSpent)} no período anterior e não voltou neste período`,
    period: input.periodLabel,
    evidence: `${missing.visits} visita(s) no período anterior, 0 neste período`,
    recommendation: "Considerar contato direto (WhatsApp) para reengajar este cliente.",
    severity: "warning",
  };
}

const EXPENSE_CATEGORY_GROWTH_THRESHOLD_PERCENT = 20;

function expenseCategoryGrowthFinding(input: InsightsInput): ManagementFinding | null {
  const top = input.currentExpenses.topCategory;
  if (!top) return null;
  const previousTopSameCategory = input.previousExpenses.topCategory?.name === top.name ? input.previousExpenses.topCategory.amount : null;
  if (previousTopSameCategory === null || previousTopSameCategory <= 0) return null;
  const deltaPercent = ((top.amount - previousTopSameCategory) / previousTopSameCategory) * 100;
  if (deltaPercent < EXPENSE_CATEGORY_GROWTH_THRESHOLD_PERCENT) return null;
  return {
    id: "expense-category-growth",
    title: "Categoria de despesa crescendo",
    metric: `Categoria "${top.name}"`,
    comparison: `${formatCurrency(top.amount)} neste período vs. ${formatCurrency(previousTopSameCategory)} no anterior`,
    period: input.periodLabel,
    evidence: `Crescimento de ${formatPercent(deltaPercent, 1)}`,
    recommendation: "Revisar os lançamentos dessa categoria para confirmar se o aumento é esperado.",
    severity: "warning",
  };
}

const HIGH_DISCOUNT_RATIO_PERCENT = 5;

function highDiscountRatioFinding(input: InsightsInput): ManagementFinding | null {
  if (input.currentIndicators.grossRevenue <= 0) return null;
  const ratio = (input.currentIndicators.discountTotal / input.currentIndicators.grossRevenue) * 100;
  if (ratio < HIGH_DISCOUNT_RATIO_PERCENT) return null;
  return {
    id: "high-discount-ratio",
    title: "Desconto médio elevado no período",
    metric: "Desconto sobre faturamento bruto",
    comparison: `${formatCurrency(input.currentIndicators.discountTotal)} de desconto sobre ${formatCurrency(input.currentIndicators.grossRevenue)} de faturamento bruto`,
    period: input.periodLabel,
    evidence: `${formatPercent(ratio, 1)} de desconto médio`,
    recommendation: "Revisar critérios de concessão de desconto no período.",
    severity: "warning",
  };
}

const GROSS_NET_GAP_THRESHOLD_PERCENT = 5;

function grossNetGapFinding(input: InsightsInput): ManagementFinding | null {
  const { grossRevenue, netRevenue } = input.currentIndicators;
  if (grossRevenue <= 0) return null;
  const gap = grossRevenue - netRevenue;
  const gapPercent = (gap / grossRevenue) * 100;
  if (gapPercent < GROSS_NET_GAP_THRESHOLD_PERCENT) return null;
  return {
    id: "gross-net-gap",
    title: "Diferença relevante entre faturamento bruto e líquido",
    metric: "Faturamento bruto vs. líquido",
    comparison: `${formatCurrency(grossRevenue)} bruto vs. ${formatCurrency(netRevenue)} líquido`,
    period: input.periodLabel,
    evidence: `Diferença de ${formatCurrency(gap)} (${formatPercent(gapPercent, 1)})`,
    recommendation: "Confirmar se a diferença reflete descontos esperados no período.",
    severity: "info",
  };
}

function ordersCountVariationFinding(input: InsightsInput): ManagementFinding | null {
  const cmp = comparePeriods(input.currentIndicators.ordersCount, input.previousIndicators.ordersCount);
  if (cmp.deltaPercent === null || Math.abs(cmp.deltaPercent) < SIGNIFICANT_DELTA_PERCENT) return null;
  const isDrop = cmp.deltaPercent < 0;
  return {
    id: "orders-count-variation",
    title: isDrop ? "Queda na quantidade de atendimentos" : "Crescimento na quantidade de atendimentos",
    metric: "Quantidade de atendimentos",
    comparison: `${cmp.current} atendimento(s) vs. ${cmp.previous ?? 0} no período anterior`,
    period: input.periodLabel,
    evidence: `Variação de ${formatPercent(cmp.deltaPercent, 1)}`,
    recommendation: isDrop ? "Avaliar sazonalidade ou concorrência antes de qualquer ação." : "Confirmar se a estrutura atual suporta o crescimento do volume.",
    severity: isDrop ? "warning" : "info",
  };
}

const LOW_REVENUE_DAY_RATIO = 0.5;

function lowRevenueDaysFinding(input: InsightsInput): ManagementFinding | null {
  const byDay = groupNetRevenueByDay(input.currentRows);
  if (byDay.size < 3) return null;
  const values = Array.from(byDay.values());
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;
  if (average <= 0) return null;
  const lowDays = Array.from(byDay.entries()).filter(([, revenue]) => revenue < average * LOW_REVENUE_DAY_RATIO);
  if (lowDays.length === 0) return null;
  return {
    id: "low-revenue-days",
    title: "Dias com faturamento muito abaixo da média do período",
    metric: "Faturamento líquido diário",
    comparison: `${lowDays.length} de ${byDay.size} dia(s) do período abaixo de 50% da média diária`,
    period: input.periodLabel,
    evidence: `Média diária de ${formatCurrency(average)}; menor dia: ${formatCurrency(Math.min(...lowDays.map(([, v]) => v)))}`,
    recommendation: "Verificar se há um padrão (dia da semana, clima, agenda) por trás dos dias mais fracos.",
    severity: "info",
  };
}

const LOW_TICKET_RATIO = 0.5;

function lowTicketHighVolumeServiceFinding(input: InsightsInput): ManagementFinding | null {
  if (input.currentServices.length === 0 || input.currentIndicators.averageTicket === null) return null;
  const quantities = input.currentServices.map((s) => s.quantity).sort((a, b) => a - b);
  const median = quantities[Math.floor(quantities.length / 2)];
  const threshold = input.currentIndicators.averageTicket * LOW_TICKET_RATIO;
  const candidate = input.currentServices.find((s) => s.quantity >= median && s.quantity > 1 && s.averageTicket < threshold);
  if (!candidate) return null;
  return {
    id: "low-ticket-high-volume-service",
    title: "Serviço com muitas vendas e ticket abaixo da média",
    metric: `Ticket médio de "${candidate.description}"`,
    comparison: `${formatCurrency(candidate.averageTicket)} vs. ticket médio geral de ${formatCurrency(input.currentIndicators.averageTicket)}`,
    period: input.periodLabel,
    evidence: `${candidate.quantity} venda(s) no período`,
    recommendation: "Avaliar oportunidade de reposicionar preço ou oferecer como porta de entrada para serviços de maior valor.",
    severity: "info",
  };
}

function expensesExceedRevenueFinding(input: InsightsInput): ManagementFinding | null {
  if (!input.currentExpenses.hasData) return null;
  if (input.currentExpenses.total <= input.currentIndicators.netRevenue) return null;
  return {
    id: "expenses-exceed-revenue",
    title: "Despesas registradas superiores ao faturamento líquido no período",
    metric: "Despesas vs. faturamento líquido",
    comparison: `${formatCurrency(input.currentExpenses.total)} em despesas vs. ${formatCurrency(input.currentIndicators.netRevenue)} de faturamento líquido`,
    period: input.periodLabel,
    evidence: `Diferença de ${formatCurrency(input.currentExpenses.total - input.currentIndicators.netRevenue)}`,
    recommendation: "Revisar despesas do período e confirmar se todas pertencem realmente a esta competência.",
    severity: "critical",
  };
}

const CHECKS: ((input: InsightsInput) => ManagementFinding | null)[] = [
  revenueVariationFinding,
  averageTicketVariationFinding,
  serviceConcentrationFinding,
  inactiveRelevantCustomerFinding,
  expenseCategoryGrowthFinding,
  highDiscountRatioFinding,
  grossNetGapFinding,
  ordersCountVariationFinding,
  lowRevenueDaysFinding,
  lowTicketHighVolumeServiceFinding,
  expensesExceedRevenueFinding,
];

/**
 * Quando não há nenhum atendimento no período, nenhuma checagem faz sentido — retorna uma única
 * observação honesta em vez de tentar calcular variações sobre zero.
 */
export function buildFindings(input: InsightsInput): ManagementFinding[] {
  if (input.currentRows.length === 0) {
    return [
      {
        id: "no-data",
        title: "Dados insuficientes para análise",
        metric: "Atendimentos no período",
        comparison: "Nenhum atendimento finalizado no período selecionado",
        period: input.periodLabel,
        evidence: "0 atendimentos",
        recommendation: "Selecione um período com atendimentos registrados para ver os pontos de atenção.",
        severity: "info",
      },
    ];
  }

  return CHECKS.map((check) => check(input)).filter((f): f is ManagementFinding => f !== null);
}
