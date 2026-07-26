import "server-only";
import { isStoneConfigured } from "@/lib/config/env";
import { getCached, setCached } from "@/lib/integrations/stone/cache";
import { dataAvailableThroughDate, fetchNormalizedConciliations, lookbackDates, successfulNormalizedConciliations } from "@/lib/integrations/stone/multiDay";
import { addDaysIso } from "@/lib/utils/timezone";
import { computeFinancialMetrics } from "@/lib/finance/intelligence/metrics/engine";
import { compareMetricSets, findTrend } from "@/lib/finance/intelligence/trends/engine";
import { runDiagnostics } from "@/lib/finance/intelligence/diagnostics/engine";
import { generateRecommendations } from "@/lib/finance/intelligence/recommendations/engine";
import { currentMonth, daysWithinBounds, lastNDays, previousMonth, priorNDays, singleDay } from "@/lib/finance/intelligence/utils/dates";
import type { NormalizedConciliation } from "@/lib/integrations/stone/normalize";
import type { Diagnostic, ExecutiveSummary, FinancialDirectorReport, FinancialMetricSet, PeriodBounds, Recommendation, TrendComparison } from "@/lib/finance/intelligence/types";

/**
 * Diretor Financeiro Inteligente (Sprint 8, seção "FINANCIAL DIRECTOR") — único ponto de I/O do
 * módulo `finance/intelligence`. Orquestra `multiDay.ts` (I/O, já existente, nunca alterado) +
 * as camadas puras deste módulo (`metrics` → `trends` → `diagnostics` → `recommendations`), na
 * ordem exigida: coletar métricas → calcular tendências → executar diagnósticos → gerar
 * recomendações → gerar resumo executivo. Retorna sempre um `FinancialDirectorReport`
 * estruturado, nunca texto solto.
 */

/** Cobre folgadamente 30x30 dias + o mês anterior inteiro, mesmo em fevereiro/dias de virada de ano. */
const LOOKBACK_DAYS = 70;
/** Toda a agregação pesada (buscar + normalizar dias, calcular métricas/tendências/diagnósticos) ocorre uma única vez por `todayIso`; chamadas repetidas na mesma janela reaproveitam o relatório já pronto (seção "PERFORMANCE"). */
const REPORT_CACHE_TTL_MS = 15 * 60 * 1000;

function buildPeriodMetrics(days: NormalizedConciliation[], bounds: PeriodBounds, todayIso: string, dataAvailableThroughDate: string): FinancialMetricSet {
  return computeFinancialMetrics({ periodFrom: bounds.from, periodTo: bounds.to, days: daysWithinBounds(days, bounds), todayIso, dataAvailableThroughDate });
}

function buildComparison(label: string, days: NormalizedConciliation[], current: PeriodBounds, previous: PeriodBounds, todayIso: string, availableThrough: string): TrendComparison {
  const currentMetrics = buildPeriodMetrics(days, current, todayIso, availableThrough);
  const previousMetrics = buildPeriodMetrics(days, previous, todayIso, availableThrough);
  return { label, currentPeriod: current, previousPeriod: previous, currentMetrics, previousMetrics, trends: compareMetricSets(currentMetrics, previousMetrics) };
}

/** As 5 comparações-exemplo pedidas (hoje x ontem, mesmo dia da semana, 7 dias, 30 dias, mês x mês) — sempre ancoradas em `availableThrough`, nunca em "hoje" no relógio de parede (o arquivo do dia D só é publicado no dia D+1). */
function buildComparisons(days: NormalizedConciliation[], todayIso: string, availableThrough: string): TrendComparison[] {
  return [
    buildComparison("Hoje x ontem", days, singleDay(availableThrough), singleDay(addDaysIso(availableThrough, -1)), todayIso, availableThrough),
    buildComparison("Mesmo dia da semana anterior", days, singleDay(availableThrough), singleDay(addDaysIso(availableThrough, -7)), todayIso, availableThrough),
    buildComparison("Últimos 7 dias x 7 dias anteriores", days, lastNDays(availableThrough, 7), priorNDays(availableThrough, 7), todayIso, availableThrough),
    buildComparison("Últimos 30 dias x 30 dias anteriores", days, lastNDays(availableThrough, 30), priorNDays(availableThrough, 30), todayIso, availableThrough),
    buildComparison("Mês atual x mês anterior", days, currentMonth(availableThrough), previousMonth(availableThrough), todayIso, availableThrough),
  ];
}

const PRIMARY_COMPARISON_LABEL = "Últimos 30 dias x 30 dias anteriores";

function currency(value: number): string {
  return `R$ ${value.toFixed(2)}`;
}

function buildExecutiveSummary(metrics: FinancialMetricSet, comparisons: TrendComparison[], diagnostics: Diagnostic[], recommendations: Recommendation[]): ExecutiveSummary {
  const primary = comparisons.find((c) => c.label === PRIMARY_COMPARISON_LABEL) ?? comparisons[0] ?? null;
  const revenueTrend = primary ? findTrend(primary.trends, "netRevenue") : null;

  const critical = diagnostics.filter((d) => d.severity === "critical");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const opportunity = diagnostics.find((d) => d.id === "receita_cresceu");

  const mainRisk = critical[0]?.title ?? warnings[0]?.title ?? "Nenhum risco relevante identificado no período.";
  const mainOpportunity = opportunity?.title ?? (metrics.advancedPercentage < 10 && metrics.overdueReceivablesAmount < metrics.settledReceivablesAmount * 0.05 ? "Fluxo de caixa saudável — espaço para negociar melhores condições com fornecedores ou investir em crescimento." : "Nenhuma oportunidade adicional identificada no período.");

  const situation = critical.length > 0 ? "Atenção — há risco crítico identificado no período." : warnings.length > 0 ? "Estável, com pontos de atenção." : "Saudável.";
  const mainRecommendation = recommendations[0]?.text ?? "Nenhuma ação adicional necessária no momento.";
  const revenueTrendLabel = revenueTrend ? ` (${revenueTrend.direction} ${revenueTrend.percentageChange !== null ? `${Math.abs(revenueTrend.percentageChange).toFixed(1)}%` : ""} em relação aos 30 dias anteriores)` : "";

  return {
    netRevenueLabel: `${currency(metrics.netRevenue)} nos últimos 30 dias com dado disponível${revenueTrendLabel}`,
    receivablesLabel: `${currency(metrics.settledReceivablesAmount)} liquidados, ${currency(metrics.pendingReceivablesAmount)} futuros, ${currency(metrics.overdueReceivablesAmount)} vencidos`,
    mainRisk,
    mainOpportunity,
    situation,
    mainRecommendation,
  };
}

function emptyReport(overrides: Pick<FinancialDirectorReport, "status" | "error" | "limitations">): FinancialDirectorReport {
  return {
    ...overrides,
    generatedAt: new Date().toISOString(),
    dataAvailableThroughDate: null,
    primaryMetrics: null,
    comparisons: [],
    diagnostics: [],
    recommendations: [],
    executiveSummary: null,
  };
}

/**
 * Único ponto de entrada público do Diretor Financeiro Inteligente. `todayIso` é a data de "hoje"
 * real (`YYYY-MM-DD`, América/São Paulo) — nunca lança, toda falha vira `status`/`error` honestos.
 */
export async function runFinancialDirector(todayIso: string): Promise<FinancialDirectorReport> {
  if (!isStoneConfigured()) {
    return emptyReport({ status: "not_configured", error: "Integração Stone não configurada neste ambiente.", limitations: ["STONE_API_KEY/STONE_ACCOUNT_ID ausentes — o Diretor Financeiro Inteligente depende dos dados de conciliação Stone."] });
  }

  const cacheKey = `financial-director-report:${todayIso}`;
  const cached = getCached<FinancialDirectorReport>(cacheKey);
  if (cached) return cached;

  const dates = lookbackDates(todayIso, LOOKBACK_DAYS);
  const dayResults = await fetchNormalizedConciliations(dates);
  const successfulDays = successfulNormalizedConciliations(dayResults);
  const availableThrough = dataAvailableThroughDate(dayResults);

  if (successfulDays.length === 0 || !availableThrough) {
    // Nenhum dia teve status "ok" (garantido por `dataAvailableThroughDate` devolver null) — a janela inteira falhou ou não tem dado ainda.
    const statuses = new Set(dayResults.map((r) => r.status));
    const status = statuses.size === 1 ? [...statuses][0] : "temporary_failure";
    return emptyReport({
      status: status === "not_configured" ? "not_configured" : status === "no_data" ? "no_data" : "temporary_failure",
      error: "Nenhum arquivo de conciliação disponível na janela consultada — inteligência financeira indisponível.",
      limitations: ["Todos os dias da janela retornaram sem dado — arquivo ainda não publicado ou indisponível."],
    });
  }

  const comparisons = buildComparisons(successfulDays, todayIso, availableThrough);
  const primaryMetrics = buildPeriodMetrics(successfulDays, lastNDays(availableThrough, 30), todayIso, availableThrough);
  const primaryComparison = comparisons.find((c) => c.label === PRIMARY_COMPARISON_LABEL)!;

  const diagnostics = runDiagnostics(primaryMetrics, primaryComparison.trends);
  const recommendations = generateRecommendations(primaryMetrics, primaryComparison.trends, diagnostics);
  const executiveSummary = buildExecutiveSummary(primaryMetrics, comparisons, diagnostics, recommendations);

  const failedDaysCount = dayResults.length - successfulDays.length;
  const limitations = [`Cobre só os dias presentes nos ${successfulDays.length} arquivo(s) diário(s) já processado(s) dentro da janela de ${LOOKBACK_DAYS} dias — nunca uma projeção.`];
  if (failedDaysCount > 0) limitations.push(`${failedDaysCount} de ${dayResults.length} dia(s) da janela não puderam ser obtidos — métricas de períodos que os incluem podem estar incompletas.`);

  const report: FinancialDirectorReport = {
    status: "ok",
    error: null,
    limitations,
    generatedAt: new Date().toISOString(),
    dataAvailableThroughDate: availableThrough,
    primaryMetrics,
    comparisons,
    diagnostics,
    recommendations,
    executiveSummary,
  };

  setCached(cacheKey, report, REPORT_CACHE_TTL_MS);
  return report;
}
