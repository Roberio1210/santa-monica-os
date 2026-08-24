import "server-only";
import type { UserRole } from "@/lib/auth/roles";
import { buildComparisonReport, type ComparisonReport, type ComparisonMetric } from "@/lib/zezinho/comparison-engine";
import { fetchInventoryOverview } from "@/lib/inventory/service";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import type { InventoryItemView, StockMovement } from "@/lib/inventory/types";
import { fetchPlanningBoard } from "@/lib/planning/service";
import type { AppointmentView, TomorrowPreparation } from "@/lib/planning/types";
import { fetchServiceCatalog, type ServiceCatalogEntry } from "@/lib/services/catalog";
import type { WashCategoryGroup } from "@/lib/integrations/jumppark/wash-grouping";
import { buildFinancialScheduleForToday } from "@/lib/integrations/stone/financialScheduleService";
import { isStoneConfigured } from "@/lib/config/env";
import { resolvePeriod, previousPeriodOf, saoPauloDateISO, addDaysIso, type PeriodRange } from "@/lib/utils/timezone";

/**
 * Missão Z4/Z5 — fechamento gerencial do dia. Camada de AGREGAÇÃO pura por cima de fontes já
 * existentes e auditadas (Regra Nº1 da missão): `buildComparisonReport` (Z2, mesmo motor que já
 * alimenta `full_period_comparison` e foi a fonte confirmada da resposta real auditada na Z3.4),
 * `fetchInventoryOverview`/`listMovements()` (estoque, uma consulta cada — nunca uma por item),
 * `fetchPlanningBoard` (agenda real de `/planejamento`) e `fetchServiceCatalog` (produtos
 * homologados x estoque real, Z3.3). Nenhuma consulta nova ao JumpPark/Stone/estoque é criada
 * aqui — só composição e leitura somente-leitura.
 *
 * Missão Z5 — "quantidade por serviço"/"adicionais" vêm de `report.washCategoryGroupsA`, o MESMO
 * agrupamento que `buildComparisonReport` já calculava internamente só para extrair
 * `packageCountsA` (Bronze/Silver/Gold) — nunca uma segunda consulta ou um segundo agrupamento,
 * só o resto do mesmo resultado, antes descartado.
 */

/** Serviços de pacote (mesmos rótulos de `packageCounts` em comparison-engine.ts) — todo outro serviço de lavação real é "adicional". */
const PACKAGE_LABELS = new Set(["Bronze", "Silver", "Gold"]);
/** Janela de "comprado recentemente" no resumo de estoque — nunca escondida, sempre com a data real da movimentação. */
const RECENT_PURCHASE_WINDOW_DAYS = 7;

export interface ClosingInsight {
  id: string;
  title: string;
  evidence: string;
  severity: "info" | "warning" | "critical";
}

export interface ProductRisk {
  serviceName: string;
  scheduledCount: number;
  status: "disponivel" | "indisponivel" | "servico_sem_produto_homologado";
  detail: string;
}

export interface InventoryAttentionItem {
  name: string;
  brand: string;
  currentQuantity: number;
  unit: string;
  status: "comprar" | "atencao";
}

/** Item "OK" relevante hoje (usado em serviço vendido ou comprado recentemente) — nunca a lista completa de itens normais (seção 3 da missão). */
export interface RelevantOkItem {
  name: string;
  brand: string;
  currentQuantity: number;
  unit: string;
  reason: "usado_em_servico_hoje" | "comprado_recentemente";
}

export interface RecentPurchase {
  name: string;
  quantity: number;
  unit: string;
  date: string;
}

export interface ServiceCount {
  description: string;
  count: number;
}

export interface DailyOperationalSummary {
  ordersCount: number;
  vehiclesCount: number;
  customersCount: number;
  washCount: number;
  parkingCount: number;
  packageCounts: { Bronze: number; Silver: number; Gold: number };
  topServices: { description: string; amount: number | null }[];
  /** Quantidade por serviço de lavação real (nome canônico, nunca inventado) — seção 1A da missão. */
  serviceCounts: ServiceCount[];
  /** Serviços de lavação que NÃO são Bronze/Silver/Gold (adicionais reais vendidos hoje). */
  additionalServicesCount: number;
}

export interface DailyFinancialSummary {
  grossRevenue: number;
  washRevenue: number;
  parkingRevenue: number;
  averageTicket: number | null;
  cashEntradas: number;
  cashSaidas: number;
  cashResultado: number;
  dreResultado: number | null;
  stoneConfigured: boolean;
  stoneSettledToday: number | null;
  stonePendingToday: number | null;
}

export interface TomorrowSummary {
  vehicleCount: number;
  capacityConfigured: boolean;
  availableMinutes: number | null;
  percentOccupied: number | null;
  mainServices: string[];
  productRisks: ProductRisk[];
}

export interface DailyClosingResult {
  role: UserRole;
  period: PeriodRange;
  comparisonPeriod: PeriodRange;
  /** `true` quando `period` inclui hoje (dia ainda em andamento) — nunca comparar um dia parcial como se fosse fechado sem sinalizar isso. */
  partialPeriod: boolean;
  jumpparkConfigured: boolean;
  operational: DailyOperationalSummary;
  /** `null` para o papel operacional — dado financeiro gerencial nunca chega nessa role (RBAC Z1). */
  financial: DailyFinancialSummary | null;
  inventoryAttention: InventoryAttentionItem[];
  /** OK relevantes hoje (nunca a lista completa de itens normais) + comprados recentemente — seção 3 da missão Z5. */
  inventoryOkRelevant: RelevantOkItem[];
  recentPurchases: RecentPurchase[];
  tomorrow: TomorrowSummary;
  insights: ClosingInsight[];
  /** No máximo 5, só quando algum insight realmente sustentar uma ação — nunca genéricas (seção 21 da missão). */
  recommendations: string[];
  errors: string[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function metricValue(metrics: ComparisonMetric[], key: string): number {
  return metrics.find((m) => m.key === key)?.a ?? 0;
}
function metricNullable(metrics: ComparisonMetric[], key: string): number | null {
  const m = metrics.find((m) => m.key === key);
  return m ? m.a : null;
}
function metricComparison(metrics: ComparisonMetric[], key: string) {
  return metrics.find((m) => m.key === key)?.comparison ?? null;
}

/**
 * Insights transparentes derivados só do que `ComparisonReport` já trouxe — nunca um segundo
 * pipeline de cálculo paralelo a `painel-gerencial/insights.ts` (evita dois números diferentes
 * para a mesma métrica, risco identificado na auditoria desta missão). Limiares documentados
 * inline, nunca um score opaco.
 */
export function deriveClosingInsights(report: ComparisonReport, role: UserRole, additionalServicesCount: number = 0): ClosingInsight[] {
  const insights: ClosingInsight[] = [];
  const { metrics, packageCountsA, jumpparkConfigured } = report;
  if (!jumpparkConfigured) return insights;

  const revenueCmp = metricComparison(metrics, "revenue");
  const ticketCmp = metricComparison(metrics, "avgTicket");
  const ordersCmp = metricComparison(metrics, "orders");
  const vehiclesCount = metricValue(metrics, "vehicles");
  const avgTicket = metricValue(metrics, "avgTicket");

  if (role === "admin" && revenueCmp && revenueCmp.trend !== "indisponivel" && revenueCmp.deltaPercent !== null && Math.abs(revenueCmp.deltaPercent) >= 15) {
    insights.push({
      id: "revenue-trend",
      title: revenueCmp.trend === "aumento" ? "Faturamento acima do período de comparação" : "Faturamento abaixo do período de comparação",
      evidence: `Faturamento de ${round2(metricValue(metrics, "revenue"))} vs. ${round2(revenueCmp.previous ?? 0)} no período anterior (${revenueCmp.deltaPercent > 0 ? "+" : ""}${revenueCmp.deltaPercent}%).`,
      severity: revenueCmp.trend === "aumento" ? "info" : "warning",
    });
  }

  if (role === "admin" && ticketCmp && ticketCmp.trend === "queda" && ticketCmp.deltaPercent !== null) {
    insights.push({
      id: "ticket-drop",
      title: "Ticket médio caiu em relação ao período de comparação",
      evidence: `Ticket médio de ${round2(metricValue(metrics, "avgTicket"))} vs. ${round2(ticketCmp.previous ?? 0)} (${ticketCmp.deltaPercent}%).`,
      severity: "warning",
    });
  }

  const packageTotal = packageCountsA.Bronze + packageCountsA.Silver + packageCountsA.Gold;
  const washCount = metricValue(metrics, "washCount");
  if (washCount > 0 && packageTotal > 0) {
    const goldShare = round2((packageCountsA.Gold / packageTotal) * 100);
    const bronzeShare = round2((packageCountsA.Bronze / packageTotal) * 100);
    if (bronzeShare >= 60 && packageTotal >= 3) {
      insights.push({
        id: "mix-bronze-heavy",
        title: "Mix concentrado em Bronze — oportunidade de upgrade",
        evidence: `${packageCountsA.Bronze} de ${packageTotal} pacotes vendidos foram Bronze (${bronzeShare}%), contra ${packageCountsA.Gold} Gold.`,
        severity: "info",
      });
    } else if (goldShare >= 40 && packageTotal >= 3) {
      insights.push({
        id: "mix-gold-strong",
        title: "Boa participação de Gold no mix do dia",
        evidence: `${packageCountsA.Gold} de ${packageTotal} pacotes vendidos foram Gold (${goldShare}%).`,
        severity: "info",
      });
    }
  }

  if (ordersCmp && ordersCmp.trend === "queda" && ordersCmp.deltaPercent !== null && Math.abs(ordersCmp.deltaPercent) >= 20) {
    insights.push({
      id: "orders-drop",
      title: "Volume de ordens abaixo do período de comparação",
      evidence: `${metricValue(metrics, "orders")} ordens hoje vs. ${ordersCmp.previous} no período anterior (${ordersCmp.deltaPercent}%).`,
      severity: "warning",
    });
  }

  // Poucos adicionais vendidos — só quando houve volume real de lavação para comparar contra (evita "0 de 0" soar como achado).
  if (washCount >= 5 && additionalServicesCount === 0) {
    insights.push({
      id: "few-addons",
      title: "Poucos serviços adicionais vendidos hoje",
      evidence: `${washCount} lavações concluídas e nenhum serviço adicional (fora Bronze/Silver/Gold) registrado.`,
      severity: "info",
    });
  }

  const vehiclesCmp = metricComparison(metrics, "vehicles");
  if (role === "admin" && vehiclesCmp && ticketCmp && vehiclesCmp.trend !== "queda" && vehiclesCmp.trend !== "indisponivel" && ticketCmp.trend === "queda") {
    insights.push({
      id: "high-volume-low-ticket",
      title: "Bom volume de veículos, mas ticket médio abaixo do período de comparação",
      evidence: `${vehiclesCount} veículos atendidos (${vehiclesCmp.trend}) com ticket médio de ${round2(avgTicket)} (${ticketCmp.deltaPercent}% vs. período anterior).`,
      severity: "info",
    });
  } else if (role === "admin" && vehiclesCmp && ticketCmp && vehiclesCmp.trend === "queda" && ticketCmp.trend === "aumento") {
    insights.push({
      id: "low-volume-high-ticket",
      title: "Poucos veículos, mas ticket médio acima do período de comparação",
      evidence: `${vehiclesCount} veículos atendidos (${vehiclesCmp.deltaPercent}%) com ticket médio de ${round2(avgTicket)} (+${ticketCmp.deltaPercent}%).`,
      severity: "info",
    });
  }

  return insights;
}

/** No máximo 5, priorizando severidade crítica/atenção — nunca uma lista genérica de dicas (seção 21). */
function buildRecommendations(insights: ClosingInsight[], inventoryAttention: InventoryAttentionItem[], tomorrow: TomorrowSummary): string[] {
  const recs: string[] = [];
  const critical = insights.filter((i) => i.severity !== "info");
  for (const i of critical) recs.push(i.title);

  if (inventoryAttention.length > 0) {
    const names = inventoryAttention.slice(0, 3).map((i) => i.name).join(", ");
    recs.push(`Providenciar reposição: ${names}${inventoryAttention.length > 3 ? ` e mais ${inventoryAttention.length - 3} item(ns)` : ""}.`);
  }

  const missingProduct = tomorrow.productRisks.filter((r) => r.status !== "disponivel");
  for (const r of missingProduct.slice(0, 2)) recs.push(`Amanhã: ${r.detail}`);

  if (tomorrow.capacityConfigured && tomorrow.percentOccupied !== null && tomorrow.percentOccupied < 50) {
    recs.push(`Amanhã há capacidade ociosa (${tomorrow.percentOccupied}% ocupada) — vale trabalhar encaixe/campanha.`);
  }

  return recs.slice(0, 5);
}

export async function buildTomorrowSummary(catalog: ServiceCatalogEntry[]): Promise<TomorrowSummary> {
  const board = await fetchPlanningBoard("amanha");
  const appointments: AppointmentView[] = board.days[0]?.appointments ?? [];
  const prep: TomorrowPreparation = board.tomorrowPreparation;

  const serviceNames = Array.from(new Set(appointments.map((a) => a.serviceName)));
  const countByService = new Map<string, number>();
  for (const a of appointments) countByService.set(a.serviceName, (countByService.get(a.serviceName) ?? 0) + 1);

  const catalogByName = new Map<string, ServiceCatalogEntry>(catalog.map((c) => [c.name, c]));
  const productRisks: ProductRisk[] = [];
  for (const name of serviceNames) {
    const entry = catalogByName.get(name);
    const count = countByService.get(name) ?? 0;
    if (!entry || entry.products.length === 0) continue; // sem produto homologado cadastrado -> nada a cruzar, nunca inventa risco
    const availableProduct = entry.products.find((p) => p.estoque?.disponivel === true);
    if (availableProduct) {
      productRisks.push({ serviceName: name, scheduledCount: count, status: "disponivel", detail: `${availableProduct.productName} disponível (${availableProduct.estoque!.quantidadeAtual} ${availableProduct.estoque!.unidade}) para ${name}.` });
    } else {
      productRisks.push({ serviceName: name, scheduledCount: count, status: "indisponivel", detail: `Amanhã há ${count} agendamento(s) de "${name}" e nenhum produto homologado disponível no estoque.` });
    }
  }

  return {
    vehicleCount: prep.vehicleCount,
    capacityConfigured: prep.capacity.configured,
    availableMinutes: prep.capacity.configured ? prep.capacity.availableMinutes : null,
    percentOccupied: prep.capacity.configured ? prep.capacity.percentOccupied : null,
    mainServices: serviceNames.slice(0, 8),
    productRisks: productRisks.filter((r) => r.status !== "disponivel").concat(productRisks.filter((r) => r.status === "disponivel")).slice(0, 8),
  };
}

export function buildInventoryAttention(items: InventoryItemView[]): InventoryAttentionItem[] {
  return items
    .filter((i) => i.status === "comprar" || i.status === "atencao")
    .sort((a, b) => (a.status === b.status ? a.currentQuantity - b.currentQuantity : a.status === "comprar" ? -1 : 1))
    .slice(0, 10)
    .map((i) => ({ name: i.name, brand: i.brand, currentQuantity: i.currentQuantity, unit: i.unit, status: i.status as "comprar" | "atencao" }));
}

/** Pura — "quantidade por serviço"/"adicionais" (seção 1A da missão Z5), a partir do MESMO agrupamento já calculado por `buildComparisonReport` (nunca um segundo cálculo). */
export function computeServiceCounts(groups: WashCategoryGroup[]): { serviceCounts: ServiceCount[]; additionalServicesCount: number } {
  const serviceCounts = groups.map((g) => ({ description: g.label, count: g.count }));
  const additionalServicesCount = groups.filter((g) => !PACKAGE_LABELS.has(g.label)).reduce((sum, g) => sum + g.count, 0);
  return { serviceCounts, additionalServicesCount };
}

/** Pura — movimentações reais de compra dos últimos `RECENT_PURCHASE_WINDOW_DAYS` dias (seção 3/8 da missão Z5: "itens comprados recentemente"). */
export function computeRecentPurchases(movements: StockMovement[], itemsById: Map<string, InventoryItemView>, todayIso: string): RecentPurchase[] {
  const sinceIso = addDaysIso(todayIso, -RECENT_PURCHASE_WINDOW_DAYS);
  return movements
    .filter((m) => m.type === "compra" && m.date >= sinceIso && m.date <= todayIso)
    .map((m) => ({ name: itemsById.get(m.itemId)?.name ?? "Item não identificado", quantity: m.quantity, unit: m.unit, date: m.date }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);
}

/**
 * Pura — itens "OK" que merecem aparecer mesmo sem exigir decisão (seção 3: "não precisa listar
 * dezenas de produtos normais, priorizar o que importa"): usados em serviço vendido hoje (produto
 * homologado real, Z3.3) ou comprados recentemente. Nunca lista os demais itens "ok" irrelevantes.
 */
export function computeRelevantOkItems(items: InventoryItemView[], soldServiceNames: string[], catalog: ServiceCatalogEntry[], recentPurchases: RecentPurchase[]): RelevantOkItem[] {
  const okItems = items.filter((i) => i.status === "ok" || i.status === "sem_minimo");
  const soldNamesSet = new Set(soldServiceNames);
  const relevantProductNames = new Set<string>();
  for (const entry of catalog) {
    if (!soldNamesSet.has(entry.name)) continue;
    for (const p of entry.products) relevantProductNames.add(p.productName);
  }
  const recentNames = new Set(recentPurchases.map((p) => p.name));

  const result: RelevantOkItem[] = [];
  const seen = new Set<string>();
  for (const item of okItems) {
    if (relevantProductNames.has(item.name) && !seen.has(item.name)) {
      result.push({ name: item.name, brand: item.brand, currentQuantity: item.currentQuantity, unit: item.unit, reason: "usado_em_servico_hoje" });
      seen.add(item.name);
    }
  }
  for (const item of okItems) {
    if (recentNames.has(item.name) && !seen.has(item.name)) {
      result.push({ name: item.name, brand: item.brand, currentQuantity: item.currentQuantity, unit: item.unit, reason: "comprado_recentemente" });
      seen.add(item.name);
    }
  }
  return result.slice(0, 10);
}

export async function fetchDailyClosing(dia: { periodo?: "today" | "yesterday" } | undefined, role: UserRole): Promise<DailyClosingResult> {
  const period = resolvePeriod(dia?.periodo ?? "today");
  const comparisonRange = previousPeriodOf(period);
  const comparisonPeriod: PeriodRange = { key: "custom", from: comparisonRange.from, to: comparisonRange.to, label: "Período de comparação" };
  const todayIso = saoPauloDateISO();
  const partialPeriod = period.to >= todayIso;

  const [report, inventoryOverview, catalog, movements, stoneResult] = await Promise.all([
    buildComparisonReport(period, comparisonPeriod),
    fetchInventoryOverview(),
    fetchServiceCatalog(),
    getInventoryRepository().listMovements(),
    role === "admin" && isStoneConfigured() ? buildFinancialScheduleForToday(todayIso) : Promise.resolve(null),
  ]);
  const tomorrow = await buildTomorrowSummary(catalog);

  const inventoryAttention = buildInventoryAttention(inventoryOverview.items);
  const itemsById = new Map(inventoryOverview.items.map((i) => [i.id, i]));
  const recentPurchases = computeRecentPurchases(movements, itemsById, todayIso);
  const { serviceCounts, additionalServicesCount } = computeServiceCounts(report.washCategoryGroupsA);
  const inventoryOkRelevant = computeRelevantOkItems(
    inventoryOverview.items,
    serviceCounts.map((s) => s.description),
    catalog,
    recentPurchases,
  );
  const insights = deriveClosingInsights(report, role, additionalServicesCount);
  const recommendations = buildRecommendations(insights, inventoryAttention, tomorrow);

  const operational: DailyOperationalSummary = {
    ordersCount: metricValue(report.metrics, "orders"),
    vehiclesCount: metricValue(report.metrics, "vehicles"),
    customersCount: metricValue(report.metrics, "clients"),
    washCount: metricValue(report.metrics, "washCount"),
    parkingCount: metricValue(report.metrics, "parkingCount"),
    packageCounts: report.packageCountsA,
    topServices: report.topServicesA.slice(0, 8).map((s) => ({ description: s.description, amount: role === "admin" ? s.amount : null })),
    serviceCounts,
    additionalServicesCount,
  };

  let financial: DailyFinancialSummary | null = null;
  if (role === "admin") {
    const hojeCurve = stoneResult?.schedule?.curves.find((c) => c.label === "hoje") ?? null;
    financial = {
      grossRevenue: metricValue(report.metrics, "revenue"),
      washRevenue: metricValue(report.metrics, "washRevenue"),
      parkingRevenue: metricValue(report.metrics, "parkingRevenue"),
      averageTicket: metricNullable(report.metrics, "avgTicket"),
      cashEntradas: metricValue(report.metrics, "cashEntradas"),
      cashSaidas: metricValue(report.metrics, "cashSaidas"),
      cashResultado: metricValue(report.metrics, "cashResultado"),
      dreResultado: metricNullable(report.metrics, "dreResultado"),
      stoneConfigured: stoneResult !== null && stoneResult.status !== "not_configured",
      stoneSettledToday: hojeCurve?.settledAmount ?? null,
      stonePendingToday: hojeCurve?.pendingAmount ?? null,
    };
  }

  return {
    role,
    period,
    comparisonPeriod,
    partialPeriod,
    jumpparkConfigured: report.jumpparkConfigured,
    operational,
    financial,
    inventoryAttention,
    inventoryOkRelevant,
    recentPurchases,
    tomorrow,
    insights,
    recommendations,
    errors: report.errors,
  };
}
