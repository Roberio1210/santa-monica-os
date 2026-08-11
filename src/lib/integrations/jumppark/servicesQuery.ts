import "server-only";
import { eq, sql as sqlOp } from "drizzle-orm";
import { getDb, isDatabaseConfigured, type Database } from "@/db/client";
import { jumpParkServiceOrderItems, jumpParkServiceOrders } from "@/db/schema/jumppark";
import { services as servicesCatalogTable } from "@/db/schema/inventory";
import { serviceCategoryOf } from "@/lib/integrations/jumppark/customerServiceProfile";
import {
  aggregateServiceStats,
  buildBasicOnlyUpsellOpportunities,
  buildCrossSellOpportunities,
  classifyServiceTrend,
  detectPossibleDuplicateCategories,
  evolutionByGranularity,
  topServiceCombinations,
  type EnrichedServiceItem,
  type EvolutionPoint,
  type PossibleDuplicatePair,
  type ServiceCombination,
  type ServiceOpportunity,
  type ServiceStats,
  type ServiceTrend,
} from "@/lib/integrations/jumppark/serviceAnalytics";
import { comparePeriodValues, previousPeriodOf, saoPauloDateISO, type PeriodComparison, type PeriodRange } from "@/lib/utils/timezone";
import { dailyBuckets, monthlyBuckets, weeklyBuckets } from "@/lib/utils/timeBuckets";

/**
 * Missão 31 (módulo gerencial de Serviços) — único ponto de I/O. "Serviço" é sempre a categoria
 * derivada de `serviceCategoryOf` (Missão 29), reaproveitada sem duplicação — mesmo conceito já
 * usado em Clientes e Veículos. Uma consulta só (join `jumppark_service_order_items` +
 * `jumppark_service_orders`) alimenta visão geral, rankings, evolução, combinações, recorrência,
 * "sem saída" e oportunidades — nenhuma tabela nova, nenhum campo duplicado.
 *
 * Auditoria real (07/08/2026, Neon de produção): existe uma infraestrutura formal de
 * normalização (`jumppark_service_mappings` + catálogo `services`), mas está 0% confirmada (40
 * textos vistos, todos com status "nao_mapeado") — não é usável como fonte de verdade hoje. Por
 * isso este módulo usa a mesma heurística de categoria já validada em Clientes/Veículos, e expõe
 * a comparação com o catálogo `services` (19 linhas reais) só por nome exato (case/acento
 * insensível) para "nunca vendido" — nunca por aproximação.
 */

export function slugifyServiceCategory(category: string): string {
  return Buffer.from(category, "utf-8").toString("base64url");
}

export function unslugifyServiceCategory(slug: string): string | null {
  try {
    return Buffer.from(slug, "base64url").toString("utf-8");
  } catch {
    return null;
  }
}

async function fetchAllServiceItemsContext(db: Database): Promise<EnrichedServiceItem[]> {
  const rows = await db
    .select({
      orderId: jumpParkServiceOrders.id,
      orderDate: jumpParkServiceOrders.orderDate,
      customerId: jumpParkServiceOrders.customerId,
      customerName: jumpParkServiceOrders.clientName,
      vehicleId: jumpParkServiceOrders.vehicleId,
      vehicleModel: jumpParkServiceOrders.vehicleModel,
      description: jumpParkServiceOrderItems.description,
      amount: jumpParkServiceOrderItems.amount,
    })
    .from(jumpParkServiceOrderItems)
    .innerJoin(jumpParkServiceOrders, eq(jumpParkServiceOrderItems.serviceOrderId, jumpParkServiceOrders.id))
    .where(sqlOp`${jumpParkServiceOrderItems.description} is not null`);

  return rows
    .filter((r): r is typeof r & { description: string } => !!r.description)
    .map((r) => ({
      orderId: r.orderId,
      orderDate: r.orderDate,
      customerId: r.customerId,
      customerName: r.customerName,
      vehicleId: r.vehicleId,
      vehicleModel: r.vehicleModel,
      category: serviceCategoryOf(r.description),
      amount: Number(r.amount ?? 0),
    }));
}

function filterByPeriod(items: EnrichedServiceItem[], from: string, to: string): EnrichedServiceItem[] {
  return items.filter((i) => i.orderDate >= from && i.orderDate <= to);
}

function categoriesByOrder(items: EnrichedServiceItem[]): string[][] {
  const map = new Map<string, string[]>();
  for (const item of items) {
    const list = map.get(item.orderId) ?? [];
    list.push(item.category);
    map.set(item.orderId, list);
  }
  return Array.from(map.values());
}

export interface ServicesOverview {
  quantity: number;
  revenue: number;
  distinctOrders: number;
  averageServicesPerOrder: number;
  averageTicket: number;
  distinctCustomers: number;
  distinctVehicles: number;
}

function buildOverview(items: EnrichedServiceItem[]): ServicesOverview {
  const revenue = Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100;
  const orderIds = new Set(items.map((i) => i.orderId));
  const customers = new Set(items.filter((i) => i.customerId).map((i) => i.customerId));
  const vehicles = new Set(items.filter((i) => i.vehicleId).map((i) => i.vehicleId));
  const distinctOrders = orderIds.size;
  return {
    quantity: items.length,
    revenue,
    distinctOrders,
    averageServicesPerOrder: distinctOrders > 0 ? Math.round((items.length / distinctOrders) * 100) / 100 : 0,
    averageTicket: distinctOrders > 0 ? Math.round((revenue / distinctOrders) * 100) / 100 : 0,
    distinctCustomers: customers.size,
    distinctVehicles: vehicles.size,
  };
}

export interface ServicesOverviewComparison {
  quantity: PeriodComparison;
  revenue: PeriodComparison;
  distinctOrders: PeriodComparison;
  averageServicesPerOrder: PeriodComparison;
  averageTicket: PeriodComparison;
  distinctCustomers: PeriodComparison;
  distinctVehicles: PeriodComparison;
}

export interface CategoryRanking extends ServiceStats {
  slug: string;
  share: number;
  trend: ServiceTrend;
}

export interface OutOfStockCategory {
  category: string;
  slug: string;
  lastSoldDate: string;
  daysSinceLastSale: number;
}

export interface RecurrenceEntry {
  category: string;
  slug: string;
  distinctCustomers: number;
  repeatCustomers: number;
  repeatRate: number;
  averageIntervalDays: number | null;
}

export interface ServicesGerencialResult {
  storageMode: "postgres" | "memory";
  period: PeriodRange;
  previousPeriod: { from: string; to: string };
  overview: ServicesOverview;
  comparison: ServicesOverviewComparison;
  rankings: CategoryRanking[];
  growing: CategoryRanking[];
  falling: CategoryRanking[];
  evolutionDaily: EvolutionPoint[];
  evolutionWeekly: EvolutionPoint[];
  evolutionMonthly: EvolutionPoint[];
  combinations: ServiceCombination[];
  possibleDuplicates: PossibleDuplicatePair[];
  neverSoldFromCatalog: { name: string; category: string | null }[];
  noSaleInPeriod: OutOfStockCategory[];
  stoppedSelling: OutOfStockCategory[];
  recurrence: RecurrenceEntry[];
  crossSellOpportunities: ServiceOpportunity[];
  upsellOpportunities: ServiceOpportunity[];
  hasData: boolean;
  /** Itens de serviço reais do período selecionado, mais recentes primeiro — base do drill-down dos KPIs da visão geral. */
  rows: EnrichedServiceItem[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const OUT_OF_STOCK_DAYS_THRESHOLD = 60;

export async function fetchServicesGerencial(period: PeriodRange): Promise<ServicesGerencialResult> {
  const storageMode: "postgres" | "memory" = isDatabaseConfigured() ? "postgres" : "memory";
  const today = saoPauloDateISO();
  const previous = previousPeriodOf(period);

  const empty: ServicesGerencialResult = {
    storageMode,
    period,
    previousPeriod: previous,
    overview: { quantity: 0, revenue: 0, distinctOrders: 0, averageServicesPerOrder: 0, averageTicket: 0, distinctCustomers: 0, distinctVehicles: 0 },
    comparison: {
      quantity: comparePeriodValues(0, 0),
      revenue: comparePeriodValues(0, 0),
      distinctOrders: comparePeriodValues(0, 0),
      averageServicesPerOrder: comparePeriodValues(0, 0),
      averageTicket: comparePeriodValues(0, 0),
      distinctCustomers: comparePeriodValues(0, 0),
      distinctVehicles: comparePeriodValues(0, 0),
    },
    rankings: [],
    growing: [],
    falling: [],
    evolutionDaily: [],
    evolutionWeekly: [],
    evolutionMonthly: [],
    combinations: [],
    possibleDuplicates: [],
    neverSoldFromCatalog: [],
    noSaleInPeriod: [],
    stoppedSelling: [],
    recurrence: [],
    crossSellOpportunities: [],
    upsellOpportunities: [],
    hasData: false,
    rows: [],
  };

  if (!isDatabaseConfigured()) return empty;
  const db = getDb();
  if (!db) return empty;

  const allItems = await fetchAllServiceItemsContext(db);
  if (allItems.length === 0) return empty;

  const currentItems = filterByPeriod(allItems, period.from, period.to);
  const previousItems = filterByPeriod(allItems, previous.from, previous.to);

  const overview = buildOverview(currentItems);
  const previousOverview = buildOverview(previousItems);
  const comparison: ServicesOverviewComparison = {
    quantity: comparePeriodValues(overview.quantity, previousOverview.quantity),
    revenue: comparePeriodValues(overview.revenue, previousOverview.revenue),
    distinctOrders: comparePeriodValues(overview.distinctOrders, previousOverview.distinctOrders),
    averageServicesPerOrder: comparePeriodValues(overview.averageServicesPerOrder, previousOverview.averageServicesPerOrder),
    averageTicket: comparePeriodValues(overview.averageTicket, previousOverview.averageTicket),
    distinctCustomers: comparePeriodValues(overview.distinctCustomers, previousOverview.distinctCustomers),
    distinctVehicles: comparePeriodValues(overview.distinctVehicles, previousOverview.distinctVehicles),
  };

  const currentStats = aggregateServiceStats(currentItems);
  const previousQuantityByCategory = new Map(aggregateServiceStats(previousItems).map((s) => [s.category, s.quantity]));
  const totalRevenue = currentStats.reduce((sum, s) => sum + s.revenue, 0);

  const rankings: CategoryRanking[] = currentStats
    .map((s) => ({
      ...s,
      slug: slugifyServiceCategory(s.category),
      share: totalRevenue > 0 ? round2((s.revenue / totalRevenue) * 100) : 0,
      trend: classifyServiceTrend(s.quantity, previousQuantityByCategory.get(s.category) ?? 0),
    }))
    .sort((a, b) => b.quantity - a.quantity);

  const growing = rankings.filter((r) => r.trend.direction === "crescendo").sort((a, b) => (b.trend.comparison.percent ?? 0) - (a.trend.comparison.percent ?? 0));
  const falling = rankings.filter((r) => r.trend.direction === "caindo").sort((a, b) => (a.trend.comparison.percent ?? 0) - (b.trend.comparison.percent ?? 0));

  const evolutionDaily = evolutionByGranularity(currentItems, "day", dailyBuckets(period.from, period.to));
  const evolutionWeekly = evolutionByGranularity(currentItems, "week", weeklyBuckets(period.from, period.to));
  const evolutionMonthly = evolutionByGranularity(allItems, "month", monthlyBuckets(12, today.slice(0, 7)));

  const combinations = topServiceCombinations(categoriesByOrder(currentItems), 15);

  const allCategoriesEverSeen = Array.from(new Set(allItems.map((i) => i.category)));
  const possibleDuplicates = detectPossibleDuplicateCategories(allCategoriesEverSeen);

  // "Nunca vendido do catálogo" — comparação por nome exato (case/acento insensível) contra o catálogo real (services, 19 linhas). Ver nota de auditoria no topo do arquivo.
  const catalogRows = await db.select({ name: servicesCatalogTable.name, category: servicesCatalogTable.category }).from(servicesCatalogTable).where(eq(servicesCatalogTable.active, true));
  const normalizedRealized = new Set(allCategoriesEverSeen.map(normalizeForExactMatch));
  const neverSoldFromCatalog = catalogRows.filter((c) => !normalizedRealized.has(normalizeForExactMatch(c.name))).map((c) => ({ name: c.name, category: c.category }));

  const lifetimeStats = aggregateServiceStats(allItems);
  const currentCategorySet = new Set(currentStats.map((s) => s.category));
  const noSaleInPeriod: OutOfStockCategory[] = lifetimeStats
    .filter((s) => !currentCategorySet.has(s.category) && s.lastSoldDate)
    .map((s) => ({ category: s.category, slug: slugifyServiceCategory(s.category), lastSoldDate: s.lastSoldDate as string, daysSinceLastSale: daysSince(s.lastSoldDate as string, today) }))
    .sort((a, b) => b.daysSinceLastSale - a.daysSinceLastSale);

  const stoppedSelling = noSaleInPeriod.filter((s) => s.daysSinceLastSale >= OUT_OF_STOCK_DAYS_THRESHOLD);

  const recurrence = computeRecurrence(allItems, lifetimeStats);

  const crossSellOpportunities = buildCrossSellOpportunities(allItems, combinations.length > 0 ? combinations : topServiceCombinations(categoriesByOrder(allItems), 15));
  const upsellOpportunities = buildBasicOnlyUpsellOpportunities(allItems, lifetimeStats);

  return {
    storageMode,
    period,
    previousPeriod: previous,
    overview,
    comparison,
    rankings,
    growing,
    falling,
    evolutionDaily,
    evolutionWeekly,
    evolutionMonthly,
    combinations,
    possibleDuplicates,
    neverSoldFromCatalog,
    noSaleInPeriod,
    stoppedSelling,
    recurrence,
    crossSellOpportunities,
    upsellOpportunities,
    hasData: currentItems.length > 0,
    rows: [...currentItems].sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.orderId.localeCompare(a.orderId)),
  };
}


function daysSince(dateIso: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dateIso}T00:00:00Z`)) / 86_400_000);
}

function normalizeForExactMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** % de clientes que repetiram a mesma categoria e intervalo médio, em dias, entre repetições — só entre clientes que compraram 2+ vezes. */
function computeRecurrence(items: EnrichedServiceItem[], stats: ServiceStats[]): RecurrenceEntry[] {
  const byCategory = new Map<string, Map<string, string[]>>(); // category -> customerId -> dates
  for (const item of items) {
    if (!item.customerId) continue;
    const byCustomer = byCategory.get(item.category) ?? new Map<string, string[]>();
    const dates = byCustomer.get(item.customerId) ?? [];
    dates.push(item.orderDate);
    byCustomer.set(item.customerId, dates);
    byCategory.set(item.category, byCustomer);
  }

  return stats
    .map((s) => {
      const byCustomer = byCategory.get(s.category) ?? new Map<string, string[]>();
      const customerIds = Array.from(byCustomer.keys());
      const repeatCustomerDates = customerIds.map((id) => Array.from(new Set(byCustomer.get(id)!)).sort()).filter((dates) => dates.length >= 2);

      let totalGaps = 0;
      let gapCount = 0;
      for (const dates of repeatCustomerDates) {
        for (let i = 1; i < dates.length; i++) {
          totalGaps += daysSince(dates[i - 1], dates[i]);
          gapCount += 1;
        }
      }

      return {
        category: s.category,
        slug: slugifyServiceCategory(s.category),
        distinctCustomers: customerIds.length,
        repeatCustomers: repeatCustomerDates.length,
        repeatRate: customerIds.length > 0 ? round2((repeatCustomerDates.length / customerIds.length) * 100) : 0,
        averageIntervalDays: gapCount > 0 ? Math.round(totalGaps / gapCount) : null,
      };
    })
    .sort((a, b) => b.repeatRate - a.repeatRate);
}

export interface ServiceCustomerEntry {
  customerId: string;
  customerName: string | null;
  vehicleId: string | null;
  vehicleModel: string | null;
  count: number;
  firstDate: string;
  lastDate: string;
  totalSpent: number;
}

export interface ServiceVehicleEntry {
  vehicleId: string;
  vehicleModel: string | null;
  count: number;
  lastDate: string;
}

export interface ServiceDetailResult {
  category: string;
  slug: string;
  found: boolean;
  lifetimeStats: ServiceStats | null;
  currentStats: ServiceStats | null;
  previousStats: ServiceStats | null;
  comparison: { quantity: PeriodComparison; revenue: PeriodComparison };
  trend: ServiceTrend;
  evolutionMonthly: EvolutionPoint[];
  combinations: ServiceCombination[];
  customers: ServiceCustomerEntry[];
  vehicles: ServiceVehicleEntry[];
  daysSinceLastSale: number | null;
  /** % do faturamento vitalício de TODOS os serviços que esta categoria representa. */
  revenueShareLifetime: number;
}

function emptyStats(category: string): ServiceStats {
  return { category, quantity: 0, revenue: 0, distinctOrders: 0, distinctCustomers: 0, distinctVehicles: 0, averageTicket: 0, lastSoldDate: null, firstSoldDate: null };
}

export async function fetchServiceDetail(slug: string, period: PeriodRange): Promise<ServiceDetailResult | null> {
  const category = unslugifyServiceCategory(slug);
  if (!category) return null;
  if (!isDatabaseConfigured()) return null;
  const db = getDb();
  if (!db) return null;

  const allItems = await fetchAllServiceItemsContext(db);
  const categoryItems = allItems.filter((i) => i.category === category);
  if (categoryItems.length === 0) {
    return {
      category,
      slug,
      found: false,
      lifetimeStats: null,
      currentStats: null,
      previousStats: null,
      comparison: { quantity: comparePeriodValues(0, 0), revenue: comparePeriodValues(0, 0) },
      trend: classifyServiceTrend(0, 0),
      evolutionMonthly: [],
      combinations: [],
      customers: [],
      vehicles: [],
      daysSinceLastSale: null,
      revenueShareLifetime: 0,
    };
  }

  const previous = previousPeriodOf(period);
  const currentItems = filterByPeriod(categoryItems, period.from, period.to);
  const previousItems = filterByPeriod(categoryItems, previous.from, previous.to);

  const [lifetimeStats] = aggregateServiceStats(categoryItems);
  const currentStats = aggregateServiceStats(currentItems)[0] ?? emptyStats(category);
  const previousStats = aggregateServiceStats(previousItems)[0] ?? emptyStats(category);

  const today = saoPauloDateISO();
  const allTotalRevenue = aggregateServiceStats(allItems).reduce((sum, s) => sum + s.revenue, 0);

  const orderIdsWithCategory = new Set(categoryItems.map((i) => i.orderId));
  const ordersContainingCategory = allItems.filter((i) => orderIdsWithCategory.has(i.orderId));
  const combinations = topServiceCombinations(categoriesByOrder(ordersContainingCategory), 10).filter((c) => c.categories.includes(category));

  const byCustomer = new Map<string, ServiceCustomerEntry>();
  for (const item of categoryItems) {
    if (!item.customerId) continue;
    const entry = byCustomer.get(item.customerId) ?? { customerId: item.customerId, customerName: item.customerName, vehicleId: item.vehicleId, vehicleModel: item.vehicleModel, count: 0, firstDate: item.orderDate, lastDate: item.orderDate, totalSpent: 0 };
    entry.count += 1;
    entry.totalSpent = round2(entry.totalSpent + item.amount);
    if (item.orderDate < entry.firstDate) entry.firstDate = item.orderDate;
    if (item.orderDate >= entry.lastDate) {
      entry.lastDate = item.orderDate;
      entry.vehicleId = item.vehicleId;
      entry.vehicleModel = item.vehicleModel;
      entry.customerName = item.customerName ?? entry.customerName;
    }
    byCustomer.set(item.customerId, entry);
  }

  const byVehicle = new Map<string, ServiceVehicleEntry>();
  for (const item of categoryItems) {
    if (!item.vehicleId) continue;
    const entry = byVehicle.get(item.vehicleId) ?? { vehicleId: item.vehicleId, vehicleModel: item.vehicleModel, count: 0, lastDate: item.orderDate };
    entry.count += 1;
    if (item.orderDate >= entry.lastDate) {
      entry.lastDate = item.orderDate;
      entry.vehicleModel = item.vehicleModel;
    }
    byVehicle.set(item.vehicleId, entry);
  }

  return {
    category,
    slug,
    found: true,
    lifetimeStats,
    currentStats,
    previousStats,
    comparison: { quantity: comparePeriodValues(currentStats.quantity, previousStats.quantity), revenue: comparePeriodValues(currentStats.revenue, previousStats.revenue) },
    trend: classifyServiceTrend(currentStats.quantity, previousStats.quantity),
    evolutionMonthly: evolutionByGranularity(categoryItems, "month", monthlyBuckets(12, today.slice(0, 7))),
    combinations,
    customers: Array.from(byCustomer.values()).sort((a, b) => b.count - a.count),
    vehicles: Array.from(byVehicle.values()).sort((a, b) => b.count - a.count),
    daysSinceLastSale: lifetimeStats.lastSoldDate ? daysSince(lifetimeStats.lastSoldDate, today) : null,
    revenueShareLifetime: allTotalRevenue > 0 ? round2((lifetimeStats.revenue / allTotalRevenue) * 100) : 0,
  };
}
