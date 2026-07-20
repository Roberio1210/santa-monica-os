import "server-only";
import { fetchOperationalOrders, computeOperationalSummary } from "@/lib/integrations/jumppark/operations-summary";
import { computeWashCategoryGroups } from "@/lib/integrations/jumppark/wash-grouping";
import { fetchCashLedger, fetchDreReport } from "@/lib/finance/service";
import { fetchCrmCustomers } from "@/lib/crm/service";
import { fetchInventoryOverview } from "@/lib/inventory/service";
import { fetchCentralOverview, computeConsolidatedAlerts } from "@/lib/operations/central";
import { isJumpParkConfigured } from "@/lib/config/env";
import { saoPauloDateISO } from "@/lib/utils/timezone";
import { buildComparisonReport, computePeakHour, metric, packageCounts, sumCashInRange, topServicesByRevenue, type ComparisonMetric, type PackageCounts } from "@/lib/zezinho/comparison-engine";
import { fetchWeatherForecast } from "@/lib/integrations/weather/service";
import { fetchActiveGoal, computeGoalProgress } from "@/lib/goals/service";
import { TOOL_REGISTRY } from "@/lib/zezinho/tools/registry";
import type { ToolCall, ToolResult } from "@/lib/zezinho/tools/types";

/**
 * Dispatcher do catálogo de ferramentas (Etapa 3 — ver docs/zezinho-3.0-architecture.md, seção
 * 6). Cada função `run*` abaixo é um envoltório fino sobre um service já existente: nenhuma
 * chamada de I/O nova é criada, nenhum cálculo é duplicado (reaproveita `metric`,
 * `sumCashInRange`, `packageCounts`, `computePeakHour`, `topServicesByRevenue`, todos exportados
 * de `comparison-engine.ts` especificamente para isso). Nunca lança — toda falha de fonte vira
 * `error` no `ToolResult`, igual ao padrão já usado em `buildComparisonReport`.
 */

const EMPTY_PACKAGES: PackageCounts = { Bronze: 0, Silver: 0, Gold: 0 };

async function runJumpparkPeriodSummary(call: ToolCall): Promise<ToolResult> {
  const source = TOOL_REGISTRY.jumppark_period_summary.source;
  if (!call.periodA) return { id: "jumppark_period_summary", source, error: "Nenhum período informado.", jumpparkConfigured: isJumpParkConfigured(), metrics: [], peakHourA: null, peakHourB: null, topServicesA: [] };
  if (!isJumpParkConfigured()) return { id: "jumppark_period_summary", source, error: "JumpPark não configurado neste ambiente.", jumpparkConfigured: false, metrics: [], peakHourA: null, peakHourB: null, topServicesA: [] };

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

  return {
    id: "jumppark_period_summary",
    source,
    error: resultA.error ?? resultB?.error ?? null,
    jumpparkConfigured: true,
    metrics,
    peakHourA: computePeakHour(ordersA),
    peakHourB: hasB ? computePeakHour(ordersB) : null,
    topServicesA: topServicesByRevenue(ordersA),
  };
}

async function runJumpparkWashPackages(call: ToolCall): Promise<ToolResult> {
  const source = TOOL_REGISTRY.jumppark_wash_packages.source;
  if (!call.periodA) return { id: "jumppark_wash_packages", source, error: "Nenhum período informado.", jumpparkConfigured: isJumpParkConfigured(), packageCountsA: EMPTY_PACKAGES, packageCountsB: EMPTY_PACKAGES };
  if (!isJumpParkConfigured()) return { id: "jumppark_wash_packages", source, error: "JumpPark não configurado neste ambiente.", jumpparkConfigured: false, packageCountsA: EMPTY_PACKAGES, packageCountsB: EMPTY_PACKAGES };

  const [resultA, resultB] = await Promise.all([
    fetchOperationalOrders(call.periodA.from, call.periodA.to),
    call.periodB ? fetchOperationalOrders(call.periodB.from, call.periodB.to) : Promise.resolve(null),
  ]);

  const washA = resultA.orders.filter((o) => o.kind === "lavacao");
  const washB = resultB ? resultB.orders.filter((o) => o.kind === "lavacao") : [];
  const [groupsA, groupsB] = await Promise.all([computeWashCategoryGroups(washA), resultB ? computeWashCategoryGroups(washB) : Promise.resolve([])]);

  return {
    id: "jumppark_wash_packages",
    source,
    error: resultA.error ?? resultB?.error ?? null,
    jumpparkConfigured: true,
    packageCountsA: packageCounts(groupsA),
    packageCountsB: packageCounts(groupsB),
  };
}

async function runCashLedgerTotals(call: ToolCall): Promise<ToolResult> {
  const source = TOOL_REGISTRY.cash_ledger_totals.source;
  if (!call.periodA) return { id: "cash_ledger_totals", source, error: "Nenhum período informado.", metrics: [] };
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
    return { id: "cash_ledger_totals", source, error: null, metrics };
  } catch {
    return { id: "cash_ledger_totals", source, error: "Não foi possível consultar o Fluxo de Caixa (Neon).", metrics: [] };
  }
}

async function runDreResult(call: ToolCall): Promise<ToolResult> {
  const source = TOOL_REGISTRY.dre_result.source;
  if (!call.periodA) return { id: "dre_result", source, error: "Nenhum período informado.", metrics: [] };
  try {
    const [dreA, dreB] = await Promise.all([
      fetchDreReport("competencia", call.periodA.from, call.periodA.to, "consolidado"),
      call.periodB ? fetchDreReport("competencia", call.periodB.from, call.periodB.to, "consolidado").catch(() => null) : Promise.resolve(null),
    ]);
    const hasB = !!call.periodB && dreB !== null;
    const metrics: ComparisonMetric[] = [metric("dreResultado", "Resultado gerencial (DRE)", "currency", dreA.resultadoOperacional, dreB?.resultadoOperacional ?? null, hasB, source)];
    return { id: "dre_result", source, error: null, metrics };
  } catch {
    return { id: "dre_result", source, error: "Não foi possível consultar o resultado gerencial (DRE).", metrics: [] };
  }
}

async function runCrmCustomers(): Promise<ToolResult> {
  const source = TOOL_REGISTRY.crm_customers.source;
  const result = await fetchCrmCustomers();
  return { id: "crm_customers", source, error: result.error, jumpparkConfigured: result.jumpparkConfigured, customers: result.customers };
}

async function runInventoryOverview(): Promise<ToolResult> {
  const source = TOOL_REGISTRY.inventory_overview.source;
  try {
    const { summary } = await fetchInventoryOverview();
    return { id: "inventory_overview", source, error: null, summary };
  } catch {
    return { id: "inventory_overview", source, error: "Não foi possível consultar o estoque.", summary: { totalItems: 0, lowStockCount: 0, nearEmptyCount: 0, sealedCount: 0, totalStockValue: null, itemsWithoutMinimum: 0 } };
  }
}

async function runCentralAlerts(): Promise<ToolResult> {
  const source = TOOL_REGISTRY.central_alerts.source;
  try {
    const overview = await fetchCentralOverview(saoPauloDateISO());
    return { id: "central_alerts", source, error: null, alerts: computeConsolidatedAlerts(overview) };
  } catch {
    return { id: "central_alerts", source, error: "Não foi possível consultar os alertas consolidados.", alerts: [] };
  }
}

async function runFullPeriodComparison(call: ToolCall): Promise<ToolResult> {
  const source = TOOL_REGISTRY.full_period_comparison.source;
  // O planejador só constrói uma ToolCall deste tipo depois de resolver periodA (ver
  // planner/selectTools.ts) — nunca chega aqui com período nulo.
  const periodA = call.periodA!;
  const report = await buildComparisonReport(periodA, call.periodB, { kind: call.filterKind ?? undefined });
  return { id: "full_period_comparison", source, error: report.errors[0] ?? null, report };
}

async function runWeatherForecast(): Promise<ToolResult> {
  const source = TOOL_REGISTRY.weather_forecast.source;
  const forecast = await fetchWeatherForecast();
  return { id: "weather_forecast", source, error: forecast.error, forecast };
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
    if (!goal) return { id: "goal_progress", source, error: `Nenhuma meta configurada para "${area}" no período atual.`, progress: null };

    if (!isJumpParkConfigured()) return { id: "goal_progress", source, error: "JumpPark não configurado neste ambiente — não é possível calcular o valor realizado.", progress: null };

    const result = await fetchOperationalOrders(goal.periodStart, todayIso);
    if (result.error) return { id: "goal_progress", source, error: result.error, progress: null };

    const relevantOrders = area === "consolidado" ? result.orders : result.orders.filter((o) => o.kind === area);
    const currentAmount = relevantOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    return { id: "goal_progress", source, error: null, progress: computeGoalProgress(goal, currentAmount, todayIso) };
  } catch {
    return { id: "goal_progress", source, error: "Não foi possível calcular o progresso da meta.", progress: null };
  }
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
  }
}

/** Executa várias ferramentas em paralelo (seção 6 do documento: nunca serial quando independentes). */
export async function executeTools(calls: ToolCall[]): Promise<ToolResult[]> {
  return Promise.all(calls.map(executeTool));
}
