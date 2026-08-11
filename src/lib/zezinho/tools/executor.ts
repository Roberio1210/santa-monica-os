import "server-only";
import { fetchOperationalOrders, computeOperationalSummary } from "@/lib/integrations/jumppark/operations-summary";
import { computeWashCategoryGroups } from "@/lib/integrations/jumppark/wash-grouping";
import { computeHistoricalPattern } from "@/lib/integrations/jumppark/historical-pattern";
import { fetchCashLedger, fetchDreReport } from "@/lib/finance/service";
import { listCustomerOverviews } from "@/lib/crm-intelligente/overview";
import { fetchInventoryOverview } from "@/lib/inventory/service";
import { fetchCentralOverview, computeConsolidatedAlerts } from "@/lib/operations/central";
import { isJumpParkConfigured } from "@/lib/config/env";
import { addDaysIso, saoPauloDateISO, saoPauloTimeHM } from "@/lib/utils/timezone";
import { buildComparisonReport, computePeakHour, metric, packageCounts, sumCashInRange, topServicesByRevenue, type ComparisonMetric, type PackageCounts } from "@/lib/zezinho/comparison-engine";
import { getWeatherForecast } from "@/lib/integrations/weather/service";
import { fetchActiveGoal, computeGoalProgress } from "@/lib/goals/service";
import { fetchAccountsPayableOverview, fetchAccountsReceivableDashboard } from "@/lib/finance/service";
import { computeSituationalContext } from "@/lib/zezinho/situational/stage";
import { buildReconciliationSummary } from "@/lib/integrations/stone/reconciliationSummary";
import { buildFinancialScheduleForToday } from "@/lib/integrations/stone/financialScheduleService";
import { reconcileStoneWithJumpparkForPeriod } from "@/lib/integrations/stone/jumpparkReconciliationService";
import { buildDivergencesSummary } from "@/lib/integrations/stone/divergencesSummary";
import { getStoneIntegrationHealth } from "@/lib/integrations/stone/healthStatus";
import { runFinancialDirector } from "@/lib/finance/intelligence/director/service";
import { TOOL_REGISTRY } from "@/lib/zezinho/tools/registry";
import type { ToolCall, ToolMeta, ToolResult, ToolResultStatus } from "@/lib/zezinho/tools/types";
import type { ToolTraceEntry } from "@/lib/zezinho/reasoning/types";

/**
 * Dispatcher do catálogo de ferramentas (Etapa 3 — ver docs/zezinho-3.0-architecture.md, seção
 * 6). Cada função `run*` abaixo é um envoltório fino sobre um service já existente: nenhuma
 * chamada de I/O nova é criada, nenhum cálculo é duplicado (reaproveita `metric`,
 * `sumCashInRange`, `packageCounts`, `computePeakHour`, `topServicesByRevenue`, todos exportados
 * de `comparison-engine.ts` especificamente para isso). Nunca lança — toda falha de fonte vira
 * `status`/`error` no `ToolResult`, igual ao padrão já usado em `buildComparisonReport`.
 */

const EMPTY_PACKAGES: PackageCounts = { Bronze: 0, Silver: 0, Gold: 0 };

/** Monta os campos comuns de rastreabilidade (status, collectedAt, limitations) — evita repetir `new Date().toISOString()` em cada retorno. */
function meta(status: ToolResultStatus, limitations: string[] = []): ToolMeta {
  return { status, collectedAt: new Date().toISOString(), limitations };
}

async function runJumpparkPeriodSummary(call: ToolCall): Promise<ToolResult> {
  const source = TOOL_REGISTRY.jumppark_period_summary.source;
  if (!call.periodA) return { id: "jumppark_period_summary", source, error: "Nenhum período informado.", ...meta("no_data"), jumpparkConfigured: isJumpParkConfigured(), metrics: [], peakHourA: null, peakHourB: null, topServicesA: [] };
  if (!isJumpParkConfigured()) return { id: "jumppark_period_summary", source, error: "JumpPark não configurado neste ambiente.", ...meta("not_configured"), jumpparkConfigured: false, metrics: [], peakHourA: null, peakHourB: null, topServicesA: [] };

  const [resultA, resultB] = await Promise.all([
    fetchOperationalOrders(call.periodA.from, call.periodA.to),
    call.periodB ? fetchOperationalOrders(call.periodB.from, call.periodB.to) : Promise.resolve(null),
  ]);

  const ordersA = call.filterKind ? resultA.orders.filter((o) => o.kind === call.filterKind) : resultA.orders;
  const ordersB = resultB ? (call.filterKind ? resultB.orders.filter((o) => o.kind === call.filterKind) : resultB.orders) : [];
  const hasB = !!call.periodB;

  const summaryA = computeOperationalSummary(ordersA);
  const summaryB = hasB ? computeOperationalSummary(ordersB) : null;

  const metrics: ComparisonMetric[] = [
    metric("revenue", "Faturamento operacional", "currency", summaryA.revenue, summaryB?.revenue ?? null, hasB, source),
    metric("orders", "Ordens finalizadas", "count", summaryA.ordersCount, summaryB?.ordersCount ?? null, hasB, source),
    metric("vehicles", "Veículos atendidos", "count", summaryA.vehiclesServed, summaryB?.vehiclesServed ?? null, hasB, source),
    metric("clients", "Clientes identificados", "count", summaryA.clientsIdentified, summaryB?.clientsIdentified ?? null, hasB, source),
    metric("avgTicket", "Ticket médio", "currency", summaryA.averageTicket ?? 0, summaryB?.averageTicket ?? null, hasB, source),
    metric("washCount", "Lavações", "count", summaryA.washCount, summaryB?.washCount ?? null, hasB, source),
    metric("washRevenue", "Faturamento de lavação", "currency", summaryA.washRevenue, summaryB?.washRevenue ?? null, hasB, source),
    metric("parkingCount", "Ordens de estacionamento", "count", summaryA.parkingCount, summaryB?.parkingCount ?? null, hasB, source),
    metric("parkingRevenue", "Faturamento de estacionamento", "currency", summaryA.parkingRevenue, summaryB?.parkingRevenue ?? null, hasB, source),
  ];

  const requestError = resultA.error ?? resultB?.error ?? null;
  return {
    id: "jumppark_period_summary",
    source,
    error: requestError,
    ...meta(requestError ? "temporary_failure" : "ok"),
    jumpparkConfigured: true,
    metrics,
    peakHourA: computePeakHour(ordersA),
    peakHourB: hasB ? computePeakHour(ordersB) : null,
    topServicesA: topServicesByRevenue(ordersA),
  };
}

async function runJumpparkWashPackages(call: ToolCall): Promise<ToolResult> {
  const source = TOOL_REGISTRY.jumppark_wash_packages.source;
  if (!call.periodA) return { id: "jumppark_wash_packages", source, error: "Nenhum período informado.", ...meta("no_data"), jumpparkConfigured: isJumpParkConfigured(), packageCountsA: EMPTY_PACKAGES, packageCountsB: EMPTY_PACKAGES };
  if (!isJumpParkConfigured()) return { id: "jumppark_wash_packages", source, error: "JumpPark não configurado neste ambiente.", ...meta("not_configured"), jumpparkConfigured: false, packageCountsA: EMPTY_PACKAGES, packageCountsB: EMPTY_PACKAGES };

  const [resultA, resultB] = await Promise.all([
    fetchOperationalOrders(call.periodA.from, call.periodA.to),
    call.periodB ? fetchOperationalOrders(call.periodB.from, call.periodB.to) : Promise.resolve(null),
  ]);

  const washA = resultA.orders.filter((o) => o.kind === "lavacao");
  const washB = resultB ? resultB.orders.filter((o) => o.kind === "lavacao") : [];
  const [groupsA, groupsB] = await Promise.all([computeWashCategoryGroups(washA), resultB ? computeWashCategoryGroups(washB) : Promise.resolve([])]);

  const requestError = resultA.error ?? resultB?.error ?? null;
  return {
    id: "jumppark_wash_packages",
    source,
    error: requestError,
    ...meta(requestError ? "temporary_failure" : "ok"),
    jumpparkConfigured: true,
    packageCountsA: packageCounts(groupsA),
    packageCountsB: packageCounts(groupsB),
  };
}

async function runCashLedgerTotals(call: ToolCall): Promise<ToolResult> {
  const source = TOOL_REGISTRY.cash_ledger_totals.source;
  if (!call.periodA) return { id: "cash_ledger_totals", source, error: "Nenhum período informado.", ...meta("no_data"), metrics: [] };
  try {
    const ledger = await fetchCashLedger();
    const hasB = !!call.periodB;
    const cashA = sumCashInRange(ledger, call.periodA.from, call.periodA.to);
    const cashB = call.periodB ? sumCashInRange(ledger, call.periodB.from, call.periodB.to) : null;
    const metrics: ComparisonMetric[] = [
      metric("cashEntradas", "Entradas de caixa", "currency", cashA.entradas, cashB?.entradas ?? null, hasB, source),
      metric("cashSaidas", "Saídas de caixa", "currency", cashA.saidas, cashB?.saidas ?? null, hasB, source),
      metric("cashResultado", "Resultado de caixa", "currency", cashA.resultado, cashB?.resultado ?? null, hasB, source),
    ];
    return { id: "cash_ledger_totals", source, error: null, ...meta("ok"), metrics };
  } catch {
    return { id: "cash_ledger_totals", source, error: "Não foi possível consultar o Fluxo de Caixa (Neon).", ...meta("temporary_failure"), metrics: [] };
  }
}

async function runDreResult(call: ToolCall): Promise<ToolResult> {
  const source = TOOL_REGISTRY.dre_result.source;
  if (!call.periodA) return { id: "dre_result", source, error: "Nenhum período informado.", ...meta("no_data"), metrics: [] };
  try {
    const [dreA, dreB] = await Promise.all([
      fetchDreReport("competencia", call.periodA.from, call.periodA.to, "consolidado"),
      call.periodB ? fetchDreReport("competencia", call.periodB.from, call.periodB.to, "consolidado").catch(() => null) : Promise.resolve(null),
    ]);
    if (dreA.resultadoOperacional === null) {
      const motivo = dreA.resultadoOperacionalIndisponivelMotivo ?? "Dados insuficientes para calcular o resultado gerencial no período.";
      return { id: "dre_result", source, error: null, ...meta("no_data", [motivo]), metrics: [] };
    }
    const dreBValue = dreB && dreB.resultadoOperacional !== null ? dreB.resultadoOperacional : null;
    const hasB = !!call.periodB && dreBValue !== null;
    const metrics: ComparisonMetric[] = [metric("dreResultado", "Resultado gerencial (DRE)", "currency", dreA.resultadoOperacional, dreBValue, hasB, source)];
    return { id: "dre_result", source, error: null, ...meta("ok"), metrics };
  } catch {
    return { id: "dre_result", source, error: "Não foi possível consultar o resultado gerencial (DRE).", ...meta("temporary_failure"), metrics: [] };
  }
}

async function runCrmCustomers(): Promise<ToolResult> {
  const source = TOOL_REGISTRY.crm_customers.source;
  try {
    const customers = await listCustomerOverviews();
    const status: ToolResultStatus = customers.length === 0 ? "no_data" : "ok";
    const limitations = customers.length === 0 ? ["Nenhum cliente cadastrado via Atendimento ainda — a carteira de clientes só existe a partir de visitas registradas no módulo Atendimento."] : [];
    return { id: "crm_customers", source, error: null, ...meta(status, limitations), customers };
  } catch {
    return { id: "crm_customers", source, error: "Não foi possível consultar a carteira de clientes.", ...meta("temporary_failure"), customers: [] };
  }
}

async function runInventoryOverview(): Promise<ToolResult> {
  const source = TOOL_REGISTRY.inventory_overview.source;
  try {
    const { summary } = await fetchInventoryOverview();
    return { id: "inventory_overview", source, error: null, ...meta("ok"), summary };
  } catch {
    return { id: "inventory_overview", source, error: "Não foi possível consultar o estoque.", ...meta("temporary_failure"), summary: { totalItems: 0, lowStockCount: 0, nearEmptyCount: 0, sealedCount: 0, totalStockValue: null, itemsWithoutMinimum: 0 } };
  }
}

async function runCentralAlerts(): Promise<ToolResult> {
  const source = TOOL_REGISTRY.central_alerts.source;
  try {
    const overview = await fetchCentralOverview(saoPauloDateISO());
    return { id: "central_alerts", source, error: null, ...meta("ok"), alerts: computeConsolidatedAlerts(overview) };
  } catch {
    return { id: "central_alerts", source, error: "Não foi possível consultar os alertas consolidados.", ...meta("temporary_failure"), alerts: [] };
  }
}

async function runFullPeriodComparison(call: ToolCall): Promise<ToolResult> {
  const source = TOOL_REGISTRY.full_period_comparison.source;
  // O planejador só constrói uma ToolCall deste tipo depois de resolver periodA (ver
  // planner/selectTools.ts) — nunca chega aqui com período nulo.
  const periodA = call.periodA!;
  const report = await buildComparisonReport(periodA, call.periodB, { kind: call.filterKind ?? undefined });
  const status: ToolResultStatus = !report.jumpparkConfigured ? "not_configured" : report.errors.length > 0 ? "temporary_failure" : "ok";
  return { id: "full_period_comparison", source, error: report.errors[0] ?? null, ...meta(status, report.errors.slice(1)), report };
}

async function runWeatherForecast(): Promise<ToolResult> {
  const source = TOOL_REGISTRY.weather_forecast.source;
  const forecast = await getWeatherForecast();
  return { id: "weather_forecast", source, error: forecast.error, ...meta(forecast.status, forecast.limitations), forecast };
}

/**
 * Progresso da meta — busca a meta ativa da área (padrão "lavacao", único cadastrada até agora)
 * e o faturamento já realizado no período dela (do início do período até hoje), reaproveitando
 * `fetchOperationalOrders` (mesma fonte de `jumppark_period_summary`). Sem meta cadastrada para
 * o período atual, devolve `progress: null` honestamente — nunca assume a de outro mês.
 */
async function runGoalProgress(call: ToolCall): Promise<ToolResult> {
  const source = TOOL_REGISTRY.goal_progress.source;
  const area = call.goalArea ?? "lavacao";
  const todayIso = saoPauloDateISO();

  try {
    const goal = await fetchActiveGoal(area, todayIso);
    if (!goal) return { id: "goal_progress", source, error: `Nenhuma meta configurada para "${area}" no período atual.`, ...meta("no_data"), progress: null };

    if (!isJumpParkConfigured()) return { id: "goal_progress", source, error: "JumpPark não configurado neste ambiente — não é possível calcular o valor realizado.", ...meta("not_configured"), progress: null };

    const result = await fetchOperationalOrders(goal.periodStart, todayIso);
    if (result.error) return { id: "goal_progress", source, error: result.error, ...meta("temporary_failure"), progress: null };

    const relevantOrders = area === "consolidado" ? result.orders : result.orders.filter((o) => o.kind === area);
    const currentAmount = relevantOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    return { id: "goal_progress", source, error: null, ...meta("ok"), progress: computeGoalProgress(goal, currentAmount, todayIso) };
  } catch {
    return { id: "goal_progress", source, error: "Não foi possível calcular o progresso da meta.", ...meta("temporary_failure"), progress: null };
  }
}

/**
 * Padrão histórico — busca uma janela ampla (12 semanas) UMA vez e agrega em memória
 * (`computeHistoricalPattern`, pura). Quando `call.periodA` vem preenchido (comparação em
 * andamento), usa o dia da semana e o horário de corte dele; sem período, usa hoje e a hora
 * atual — sempre comparando "até este horário", nunca um dia em andamento contra dias
 * históricos inteiros.
 */
async function runHistoricalPattern(call: ToolCall): Promise<ToolResult> {
  const source = TOOL_REGISTRY.historical_pattern.source;
  if (!isJumpParkConfigured()) return { id: "historical_pattern", source, error: "JumpPark não configurado neste ambiente.", ...meta("not_configured"), pattern: null };

  const referenceDateIso = call.periodA?.to ?? saoPauloDateISO();
  const [y, m, d] = referenceDateIso.split("-").map(Number);
  const weekdayIndex = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const cutoffTimeHM = call.periodA ? null : saoPauloTimeHM();

  const WEEKS_BACK = 12;
  const windowStart = new Date(Date.UTC(y, m - 1, d));
  windowStart.setUTCDate(windowStart.getUTCDate() - WEEKS_BACK * 7);
  const windowStartIso = windowStart.toISOString().slice(0, 10);

  const result = await fetchOperationalOrders(windowStartIso, referenceDateIso);
  if (result.error) return { id: "historical_pattern", source, error: result.error, ...meta("temporary_failure"), pattern: null };

  const orders = call.filterKind ? result.orders.filter((o) => o.kind === call.filterKind) : result.orders;
  const pattern = computeHistoricalPattern(orders, { weekdayIndex, referenceDateIso, cutoffTimeHM });
  const status: ToolResultStatus = pattern.sampleWeeks === 0 ? "no_data" : "ok";

  return { id: "historical_pattern", source, error: null, ...meta(status, pattern.limitations), pattern };
}

/** Contexto situacional — puro, sem I/O, sempre disponível (Sprint 4.0, Z1 construiu `computeSituationalContext`; Z3 finalmente o conecta ao catálogo de ferramentas). */
async function runSituationalContext(): Promise<ToolResult> {
  const source = TOOL_REGISTRY.situational_context.source;
  const context = computeSituationalContext(new Date());
  return { id: "situational_context", source, error: null, ...meta("ok"), context };
}

async function runAccountsPayable(): Promise<ToolResult> {
  const source = TOOL_REGISTRY.accounts_payable.source;
  try {
    const { summary } = await fetchAccountsPayableOverview(saoPauloDateISO());
    return { id: "accounts_payable", source, error: null, ...meta("ok"), summary };
  } catch {
    return { id: "accounts_payable", source, error: "Não foi possível consultar Contas a Pagar.", ...meta("temporary_failure"), summary: null };
  }
}

async function runAccountsReceivable(): Promise<ToolResult> {
  const source = TOOL_REGISTRY.accounts_receivable.source;
  try {
    const dashboard = await fetchAccountsReceivableDashboard(saoPauloDateISO());
    return { id: "accounts_receivable", source, error: null, ...meta("ok"), dashboard };
  } catch {
    return { id: "accounts_receivable", source, error: "Não foi possível consultar Contas a Receber.", ...meta("temporary_failure"), dashboard: null };
  }
}

/** Integração de mensageria (WhatsApp) ainda não existe — nunca inventa contagem, sempre honesto sobre a ausência. */
async function runUnansweredClients(): Promise<ToolResult> {
  const source = TOOL_REGISTRY.unanswered_clients.source;
  return {
    id: "unanswered_clients",
    source,
    error: "Integração de mensagens (WhatsApp) ainda não implementada.",
    ...meta("not_configured", ["Quando implementada, autorizado apenas metadados (quantidade de conversas, tempo médio de resposta) — nunca o conteúdo das mensagens."]),
  };
}

/** `/agenda` hoje exibe só dado ilustrativo (mock) — nunca tratado como real nas respostas do Zézinho. */
async function runAgendaSummary(): Promise<ToolResult> {
  const source = TOOL_REGISTRY.agenda_summary.source;
  return { id: "agenda_summary", source, error: "Agenda real ainda não integrada neste ambiente.", ...meta("not_configured", ["A página /agenda mostra dados ilustrativos (mock), não usados aqui."]) };
}

/** Meta Ads/Instagram (Fase B) ainda não implementado — nunca inventa métrica de marketing. */
async function runMarketingSummary(): Promise<ToolResult> {
  const source = TOOL_REGISTRY.marketing_summary.source;
  return { id: "marketing_summary", source, error: "Integração de marketing (Meta Ads/Instagram) ainda não implementada.", ...meta("not_configured") };
}

/**
 * Conciliação financeira Stone (Sprint 7.0, Z2) — nunca toca `client.ts`/XML/gzip/credenciais
 * diretamente, só `buildReconciliationSummary` (já normalizado). O arquivo é sempre de um único
 * dia; sem período resolvido, usa "ontem" (nunca "hoje" — o arquivo do dia D só é publicado às 5h
 * do dia D+1, pedir "hoje" quase sempre devolveria `no_data`).
 */
async function runStoneReconciliationSummary(call: ToolCall): Promise<ToolResult> {
  const source = TOOL_REGISTRY.stone_reconciliation_summary.source;
  const referenceDate = call.periodA?.to ?? addDaysIso(saoPauloDateISO(), -1);
  const summary = await buildReconciliationSummary(referenceDate);
  return { id: "stone_reconciliation_summary", source, error: summary.error, ...meta(summary.status, summary.limitations), summary };
}

/**
 * Agenda Financeira (Sprint 7.0, Z3) — nunca toca `client.ts`/XML/gzip diretamente, só
 * `buildFinancialScheduleForToday` (já normalizado e agregado). Sempre ancorada em "hoje"
 * (`periodA.to` como override quando presente).
 */
async function runStoneFinancialSchedule(call: ToolCall): Promise<ToolResult> {
  const source = TOOL_REGISTRY.stone_financial_schedule.source;
  const todayIso = call.periodA?.to ?? saoPauloDateISO();
  const result = await buildFinancialScheduleForToday(todayIso);
  return { id: "stone_financial_schedule", source, error: result.error, ...meta(result.status, result.limitations), result };
}

/**
 * Conciliação Stone × JumpPark (Sprint 7.0, Z3) — nunca consulta clima/CRM/nenhuma integração
 * fora de Stone e JumpPark. Sem período explícito, usa "ontem" (mesmo default honesto de
 * `stone_reconciliation_summary`, já que o arquivo Stone de hoje ainda não existe).
 */
async function runStoneJumpparkReconciliation(call: ToolCall): Promise<ToolResult> {
  const source = TOOL_REGISTRY.stone_jumppark_reconciliation.source;
  const yesterday = addDaysIso(saoPauloDateISO(), -1);
  const fromIso = call.periodA?.from ?? yesterday;
  const toIso = call.periodA?.to ?? yesterday;
  const result = await reconcileStoneWithJumpparkForPeriod(fromIso, toIso);
  return { id: "stone_jumppark_reconciliation", source, error: result.error, ...meta(result.status, result.limitations), result };
}

/** Resumo de divergências já persistidas (Sprint 7.0, Z4) — nunca recalcula, só lê `stone_divergences`. */
async function runStoneDivergencesSummary(): Promise<ToolResult> {
  const source = TOOL_REGISTRY.stone_divergences_summary.source;
  const summary = await buildDivergencesSummary();
  return { id: "stone_divergences_summary", source, error: summary.error, ...meta(summary.status, summary.limitations), summary };
}

/** Status/saúde real da integração (Sprint 7.0, Z4) — deriva de `stone_import_runs`, nunca de uma suposição. */
async function runStoneIntegrationHealth(): Promise<ToolResult> {
  const source = TOOL_REGISTRY.stone_integration_health.source;
  const report = await getStoneIntegrationHealth();
  const status: ToolResultStatus = report.configured ? "ok" : "not_configured";
  const error = report.configured ? null : "Integração Stone Conciliação não configurada neste ambiente.";
  return { id: "stone_integration_health", source, error, ...meta(status), report };
}

/**
 * Diretor Financeiro Inteligente (Sprint 8) — nunca toca `client.ts`/XML/gzip diretamente, só
 * `runFinancialDirector` (já normalizado, métricas/tendências/diagnósticos/recomendações
 * baseados em regras, nunca IA generativa). Sempre ancorado em "hoje" (`periodA.to` como
 * override), mesmo padrão de `stone_financial_schedule`.
 */
async function runFinancialIntelligence(call: ToolCall): Promise<ToolResult> {
  const source = TOOL_REGISTRY.financial_intelligence.source;
  const todayIso = call.periodA?.to ?? saoPauloDateISO();
  const report = await runFinancialDirector(todayIso);
  return { id: "financial_intelligence", source, error: report.error, ...meta(report.status, report.limitations), report };
}

/** Executa uma `ToolCall`, despachando para o service real correspondente. Nunca lança. */
export async function executeTool(call: ToolCall): Promise<ToolResult> {
  switch (call.id) {
    case "jumppark_period_summary":
      return runJumpparkPeriodSummary(call);
    case "jumppark_wash_packages":
      return runJumpparkWashPackages(call);
    case "cash_ledger_totals":
      return runCashLedgerTotals(call);
    case "dre_result":
      return runDreResult(call);
    case "crm_customers":
      return runCrmCustomers();
    case "inventory_overview":
      return runInventoryOverview();
    case "central_alerts":
      return runCentralAlerts();
    case "full_period_comparison":
      return runFullPeriodComparison(call);
    case "weather_forecast":
      return runWeatherForecast();
    case "goal_progress":
      return runGoalProgress(call);
    case "historical_pattern":
      return runHistoricalPattern(call);
    case "situational_context":
      return runSituationalContext();
    case "accounts_payable":
      return runAccountsPayable();
    case "accounts_receivable":
      return runAccountsReceivable();
    case "unanswered_clients":
      return runUnansweredClients();
    case "agenda_summary":
      return runAgendaSummary();
    case "marketing_summary":
      return runMarketingSummary();
    case "stone_reconciliation_summary":
      return runStoneReconciliationSummary(call);
    case "stone_financial_schedule":
      return runStoneFinancialSchedule(call);
    case "stone_jumppark_reconciliation":
      return runStoneJumpparkReconciliation(call);
    case "stone_divergences_summary":
      return runStoneDivergencesSummary();
    case "stone_integration_health":
      return runStoneIntegrationHealth();
    case "financial_intelligence":
      return runFinancialIntelligence(call);
  }
}

/** Executa várias ferramentas em paralelo (seção 6 do documento: nunca serial quando independentes). */
export async function executeTools(calls: ToolCall[]): Promise<ToolResult[]> {
  return Promise.all(calls.map(executeTool));
}

/**
 * Executa ferramentas em paralelo medindo a duração de cada uma — usado por `service.ts`
 * (pipeline de raciocínio single-intent) e por `planner/contextBuilder.ts` (Sprint 4.0, Z3).
 * Movido para cá na Z3 para não duplicar a mesma lógica em dois lugares.
 */
export async function executeToolsWithTrace(calls: ToolCall[]): Promise<{ results: ToolResult[]; trace: ToolTraceEntry[] }> {
  const timed = await Promise.all(
    calls.map(async (call) => {
      const start = Date.now();
      const result = await executeTool(call);
      const trace: ToolTraceEntry = { id: call.id, durationMs: Date.now() - start, error: result.error };
      return { result, trace };
    }),
  );
  return { results: timed.map((t) => t.result), trace: timed.map((t) => t.trace) };
}
