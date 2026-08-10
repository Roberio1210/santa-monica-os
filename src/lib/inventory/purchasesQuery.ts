import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { fetchAccountsPayableOverview, fetchSuppliers } from "@/lib/finance/service";
import type { AccountsPayableView, Supplier } from "@/lib/finance/types";
import {
  aggregateSupplierProductPrices,
  productsWithMultipleSuppliers,
  type SupplierProductPriceRow,
  type SupplierProductPurchase,
} from "@/lib/finance/supplierAnalytics";
import {
  aggregateCategoryPurchaseStats,
  aggregateProductPurchaseStats,
  detectPriceIncreaseOpportunities,
  detectPriceOpportunities,
  detectPossibleDuplicateProductNames,
  estimateNextPurchase,
  hasStoppedComing,
  averageIntervalDays,
  purchaseTotalValue,
  type CategoryPurchaseStats,
  type EconomyOpportunity,
  type NextPurchaseEstimate,
  type ProductPurchaseStats,
  type PurchaseEvent,
} from "@/lib/inventory/purchaseAnalytics";
import { evolutionByGranularity, type EvolutionPoint } from "@/lib/integrations/jumppark/serviceAnalytics";
import { dailyBuckets, monthlyBuckets, weeklyBuckets } from "@/lib/utils/timeBuckets";
import { comparePeriodValues, previousPeriodOf, saoPauloDateISO, type PeriodComparison, type PeriodRange } from "@/lib/utils/timezone";

/**
 * Missão 33 (módulo gerencial de Produtos/Compras) — único ponto de I/O. Reaproveita
 * `getInventoryRepository()` (Estoque, sem alteração) e `fetchAccountsPayableOverview`/
 * `fetchSuppliers` (Financeiro, sem alteração) — nenhuma tabela nova.
 *
 * Fontes de verdade, documentadas para nunca contar a mesma compra duas vezes:
 *   - RASTRO DE ESTOQUE (quantidade física recebida): `inventory_movements` tipo `compra` — a
 *     fonte PRIMÁRIA e autoritativa deste módulo. É onde o fluxo já existente de registro de
 *     compra (`/estoque/entradas`, `recordManualEntry`) grava.
 *   - RASTRO FINANCEIRO (obrigação a pagar): `accounts_payable` filtradas pela categoria
 *     "Produtos e insumos" — mostrado em seção PRÓPRIA e claramente rotulada, NUNCA somado ao
 *     valor de `inventory_movements`. As duas fontes não têm nenhuma FK entre si hoje — uma
 *     mesma compra real pode legitimamente aparecer nas duas (quantidade física de um lado,
 *     obrigação financeira do outro) sem que isso seja dupla contagem, desde que cada KPI só
 *     some a SUA própria fonte.
 *   - `purchase_import_lines` (importação de NF-e) tem área própria em
 *     /estoque/auditoria/importar-compras — deliberadamente não cruzada aqui.
 *
 * Auditoria real (08/08/2026, Neon de produção): existem 19 movimentações reais de tipo
 * `compra`, todas com quantidade e data reais, mas NENHUMA com fornecedor ou preço unitário
 * informado (parecem ser o carregamento inicial de estoque, não compras do dia a dia com nota).
 * Nenhum produto tem 2+ eventos de compra ainda — "recorrência"/"previsão" ficam corretamente
 * vazias até existir histórico de verdade. `accounts_payable` está com 0 lançamentos. Nada disso
 * foi preenchido artificialmente — a UI mostra "sem dados disponíveis" em vez de zero quando o
 * dado é "desconhecido" (preço não informado), nunca confundindo com "zero" (valor real zero).
 */

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeForExactMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

async function fetchAllPurchaseEvents(): Promise<PurchaseEvent[]> {
  const repo = getInventoryRepository();
  const [items, movements] = await Promise.all([repo.listItems(), repo.listMovements()]);
  const itemById = new Map(items.map((i) => [i.id, i]));

  return movements
    .filter((m) => m.type === "compra")
    .map((m): PurchaseEvent | null => {
      const item = itemById.get(m.itemId);
      if (!item) return null;
      return {
        movementId: m.id,
        itemId: m.itemId,
        itemName: item.name,
        category: item.category,
        unit: m.unit,
        orderDate: m.date,
        quantity: m.quantity,
        unitPricePaid: m.unitPricePaid ?? null,
        supplierText: m.supplier ?? null,
        reference: m.reference,
        responsible: m.responsible,
        notes: m.notes,
      };
    })
    .filter((e): e is PurchaseEvent => e !== null);
}

function filterByPeriod(events: PurchaseEvent[], from: string, to: string): PurchaseEvent[] {
  return events.filter((e) => e.orderDate >= from && e.orderDate <= to);
}

export interface PurchasesOverview {
  purchaseCount: number;
  distinctProducts: number;
  distinctSuppliers: number;
  totalValue: number;
  purchasesWithKnownValue: number;
  averageTicket: number | null;
  averageDailySpend: number;
  averageMonthlySpend: number;
}

export interface PurchasesOverviewComparison {
  purchaseCount: PeriodComparison;
  totalValue: PeriodComparison;
}

export interface DataQualityReport {
  possibleDuplicateProductNames: ReturnType<typeof detectPossibleDuplicateProductNames>;
  purchasesWithoutQuantity: number;
  purchasesWithoutSupplier: number;
  purchasesWithoutPrice: number;
}

export interface FinancialCrossReference {
  categoryName: string;
  payables: AccountsPayableView[];
  total: number;
}

export interface PurchasesGerencialResult {
  storageMode: "postgres" | "memory";
  period: PeriodRange;
  previousPeriod: { from: string; to: string };
  overview: PurchasesOverview;
  comparison: PurchasesOverviewComparison;
  productStats: (ProductPurchaseStats & { estimate: NextPurchaseEstimate | null })[];
  categoryStats: CategoryPurchaseStats[];
  evolutionDaily: EvolutionPoint[];
  evolutionWeekly: EvolutionPoint[];
  evolutionMonthly: EvolutionPoint[];
  economyOpportunities: EconomyOpportunity[];
  dataQuality: DataQualityReport;
  financialCrossReference: FinancialCrossReference;
  rows: PurchaseEvent[];
  hasAnyPurchase: boolean;
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000) + 1;
}

export async function fetchPurchasesGerencial(period: PeriodRange): Promise<PurchasesGerencialResult> {
  const { getStorageMode } = await import("@/lib/storage/mode");
  const storageMode = getStorageMode();
  const today = saoPauloDateISO();
  const previous = previousPeriodOf(period);

  const allEvents = await fetchAllPurchaseEvents();
  const currentEvents = filterByPeriod(allEvents, period.from, period.to);
  const previousEvents = filterByPeriod(allEvents, previous.from, previous.to);

  const currentTotalValue = round2(currentEvents.reduce((sum, e) => sum + (purchaseTotalValue(e) ?? 0), 0));
  const previousTotalValue = round2(previousEvents.reduce((sum, e) => sum + (purchaseTotalValue(e) ?? 0), 0));
  const currentWithKnownValue = currentEvents.filter((e) => e.unitPricePaid !== null).length;
  const distinctSuppliersInPeriod = new Set(currentEvents.filter((e) => e.supplierText).map((e) => normalizeForExactMatch(e.supplierText as string))).size;
  const periodDays = daysBetween(period.from, period.to);

  const overview: PurchasesOverview = {
    purchaseCount: currentEvents.length,
    distinctProducts: new Set(currentEvents.map((e) => e.itemId)).size,
    distinctSuppliers: distinctSuppliersInPeriod,
    totalValue: currentTotalValue,
    purchasesWithKnownValue: currentWithKnownValue,
    averageTicket: currentWithKnownValue > 0 ? round2(currentTotalValue / currentWithKnownValue) : null,
    averageDailySpend: round2(currentTotalValue / periodDays),
    averageMonthlySpend: round2((currentTotalValue / periodDays) * 30),
  };

  const comparison: PurchasesOverviewComparison = {
    purchaseCount: comparePeriodValues(currentEvents.length, previousEvents.length),
    totalValue: comparePeriodValues(currentTotalValue, previousTotalValue),
  };

  const lifetimeProductStats = aggregateProductPurchaseStats(allEvents);
  const datesByItem = new Map<string, string[]>();
  for (const e of allEvents) {
    const list = datesByItem.get(e.itemId) ?? [];
    list.push(e.orderDate);
    datesByItem.set(e.itemId, list);
  }
  const productStats = lifetimeProductStats
    .map((s) => ({ ...s, estimate: estimateNextPurchase(datesByItem.get(s.itemId) ?? []) }))
    .sort((a, b) => b.totalValue - a.totalValue);

  const categoryStats = aggregateCategoryPurchaseStats(currentEvents).sort((a, b) => b.totalValue - a.totalValue);

  const evolutionItems = allEvents.map((e) => ({ orderDate: e.orderDate, amount: purchaseTotalValue(e) ?? 0 }));
  const evolutionDaily = evolutionByGranularity(
    currentEvents.map((e) => ({ orderDate: e.orderDate, amount: purchaseTotalValue(e) ?? 0 })),
    "day",
    dailyBuckets(period.from, period.to),
  );
  const evolutionWeekly = evolutionByGranularity(
    currentEvents.map((e) => ({ orderDate: e.orderDate, amount: purchaseTotalValue(e) ?? 0 })),
    "week",
    weeklyBuckets(period.from, period.to),
  );
  const evolutionMonthly = evolutionByGranularity(evolutionItems, "month", monthlyBuckets(12, today.slice(0, 7)));

  const priceOpportunities = detectPriceOpportunities(lifetimeProductStats);
  const priceIncreaseOpportunities = detectPriceIncreaseOpportunities(allEvents);
  const frequentPurchaseOpportunities: EconomyOpportunity[] = lifetimeProductStats
    .filter((s) => {
      const dates = datesByItem.get(s.itemId) ?? [];
      return hasStoppedComing(dates, 0, 3, 1) === false && dates.length >= 3 && (averageIntervalDays(dates) ?? Infinity) < 15;
    })
    .map((s) => ({
      kind: "compra_muito_frequente" as const,
      itemId: s.itemId,
      itemName: s.itemName,
      description: `Comprado com intervalo médio menor que 15 dias — verificar se dá para negociar um lote maior ou contrato com o fornecedor.`,
      evidence: `${s.purchaseCount} compra(s) registradas, intervalo médio de ${averageIntervalDays(datesByItem.get(s.itemId) ?? [])} dia(s).`,
    }));
  const economyOpportunities = [...priceOpportunities, ...priceIncreaseOpportunities, ...frequentPurchaseOpportunities];

  const possibleDuplicateProductNames = detectPossibleDuplicateProductNames(Array.from(new Set(allEvents.map((e) => e.itemName))));
  const dataQuality: DataQualityReport = {
    possibleDuplicateProductNames,
    purchasesWithoutQuantity: allEvents.filter((e) => !e.quantity || e.quantity <= 0).length,
    purchasesWithoutSupplier: allEvents.filter((e) => !e.supplierText).length,
    purchasesWithoutPrice: allEvents.filter((e) => e.unitPricePaid === null).length,
  };

  const { items: allPayables } = await fetchAccountsPayableOverview(today);
  const productPayables = allPayables.filter((p) => p.computedStatus !== "cancelada" && p.categoryName === "Produtos e insumos" && p.competenceDate >= period.from && p.competenceDate <= period.to);
  const financialCrossReference: FinancialCrossReference = {
    categoryName: "Produtos e insumos",
    payables: productPayables,
    total: round2(productPayables.reduce((sum, p) => sum + p.originalAmount, 0)),
  };

  return {
    storageMode,
    period,
    previousPeriod: previous,
    overview,
    comparison,
    productStats,
    categoryStats,
    evolutionDaily,
    evolutionWeekly,
    evolutionMonthly,
    economyOpportunities,
    dataQuality,
    financialCrossReference,
    rows: currentEvents.sort((a, b) => b.orderDate.localeCompare(a.orderDate)),
    hasAnyPurchase: allEvents.length > 0,
  };
}

export interface ProductPurchaseDetailResult {
  found: true;
  itemId: string;
  itemName: string;
  category: string;
  unit: string;
  currentQuantity: number;
  minimumStock: number | null;
  idealStock: number | null;
  unitCost: number | null;
  location: string | null;
  lifetimeStats: ProductPurchaseStats;
  events: PurchaseEvent[];
  estimate: NextPurchaseEstimate | null;
  frequencyTrendAverageIntervalDays: number | null;
  supplierComparison: (SupplierProductPriceRow & { supplierName: string })[];
  evolutionMonthly: EvolutionPoint[];
}

export async function fetchProductPurchaseDetail(itemId: string): Promise<ProductPurchaseDetailResult | { found: false }> {
  const repo = getInventoryRepository();
  const item = await repo.getItem(itemId);
  if (!item) return { found: false };

  const allEvents = await fetchAllPurchaseEvents();
  const events = allEvents.filter((e) => e.itemId === itemId).sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  const [lifetimeStats] = aggregateProductPurchaseStats(events);
  const dates = events.map((e) => e.orderDate);
  const today = saoPauloDateISO();

  const allSuppliers = await fetchSuppliers();
  const supplierByNormalizedName = new Map(allSuppliers.map((s) => [normalizeForExactMatch(s.name), s]));
  const productPurchases: SupplierProductPurchase[] = events
    .filter((e) => e.supplierText && e.unitPricePaid !== null)
    .map((e) => {
      const supplier = supplierByNormalizedName.get(normalizeForExactMatch(e.supplierText as string));
      return supplier ? { supplierId: supplier.id, itemId, itemName: item.name, date: e.orderDate, quantity: e.quantity, unitPrice: e.unitPricePaid as number } : null;
    })
    .filter((p): p is SupplierProductPurchase => p !== null);
  const supplierById = new Map(allSuppliers.map((s) => [s.id, s.name]));
  const supplierComparison = aggregateSupplierProductPrices(productPurchases).map((row) => ({ ...row, supplierName: supplierById.get(row.supplierId) ?? "Fornecedor desconhecido" }));

  return {
    found: true,
    itemId,
    itemName: item.name,
    category: item.category,
    unit: item.unit,
    currentQuantity: item.currentQuantity,
    minimumStock: item.minimumStock,
    idealStock: item.idealStock,
    unitCost: item.unitCost,
    location: item.location,
    lifetimeStats: lifetimeStats ?? { itemId, itemName: item.name, category: item.category, unit: item.unit, purchaseCount: 0, totalQuantity: 0, totalValue: 0, purchasesWithKnownValue: 0, lastPrice: null, lastDate: null, firstDate: null, averagePrice: null, minPrice: null, maxPrice: null },
    events,
    estimate: estimateNextPurchase(dates),
    frequencyTrendAverageIntervalDays: averageIntervalDays(dates),
    supplierComparison,
    evolutionMonthly: evolutionByGranularity(
      events.map((e) => ({ orderDate: e.orderDate, amount: purchaseTotalValue(e) ?? 0 })),
      "month",
      monthlyBuckets(12, today.slice(0, 7)),
    ),
  };
}

/** Produtos comprados de 2+ fornecedores distintos — reaproveita a mesma lógica de Fornecedores (Missão 32). */
export async function fetchComparableProductsAcrossSuppliers(): Promise<Map<string, SupplierProductPriceRow[]>> {
  const allEvents = await fetchAllPurchaseEvents();
  const allSuppliers = await fetchSuppliers();
  const supplierByNormalizedName = new Map(allSuppliers.map((s: Supplier) => [normalizeForExactMatch(s.name), s]));

  const purchases: SupplierProductPurchase[] = allEvents
    .filter((e) => e.supplierText && e.unitPricePaid !== null)
    .map((e) => {
      const supplier = supplierByNormalizedName.get(normalizeForExactMatch(e.supplierText as string));
      return supplier ? { supplierId: supplier.id, itemId: e.itemId, itemName: e.itemName, date: e.orderDate, quantity: e.quantity, unitPrice: e.unitPricePaid as number } : null;
    })
    .filter((p): p is SupplierProductPurchase => p !== null);

  const rows = aggregateSupplierProductPrices(purchases);
  return productsWithMultipleSuppliers(rows);
}
