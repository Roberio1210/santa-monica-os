import "server-only";
import { and, eq, inArray, sql as sqlOp } from "drizzle-orm";
import { getDb, isDatabaseConfigured } from "@/db/client";
import { inventoryItems, inventoryMovements } from "@/db/schema/inventory";
import { fetchAccountsPayableOverview, fetchRecurringBillTemplates, fetchSuppliers } from "@/lib/finance/service";
import type { AccountsPayableView, RecurringBillTemplate, Supplier } from "@/lib/finance/types";
import {
  aggregateSupplierProductPrices,
  aggregateSupplierStats,
  classifyInactivity,
  computeConcentration,
  detectPossibleDuplicateSupplierNames,
  hasStoppedComing,
  type InactivityBucket,
  type SupplierProductPriceRow,
  type SupplierProductPurchase,
  type SupplierPurchaseItem,
  type SupplierStats,
} from "@/lib/finance/supplierAnalytics";
import { evolutionByGranularity, type EvolutionPoint } from "@/lib/integrations/jumppark/serviceAnalytics";
import { dailyBuckets, monthlyBuckets, weeklyBuckets } from "@/lib/utils/timeBuckets";
import { comparePeriodValues, previousPeriodOf, saoPauloDateISO, type PeriodComparison, type PeriodRange } from "@/lib/utils/timezone";
import { getStorageMode, type StorageMode } from "@/lib/storage/mode";

/**
 * Missão 32 (módulo gerencial de Fornecedores) — único ponto de I/O. Reaproveita
 * `fetchSuppliers`/`fetchAccountsPayableOverview`/`fetchRecurringBillTemplates` (Financeiro, sem
 * alteração nenhuma) — nenhuma tabela nova.
 *
 * Fontes de verdade, documentadas para nunca contar o mesmo gasto duas vezes (auditado antes de
 * implementar, ver relatório da missão):
 *   - GASTO FINANCEIRO por fornecedor: SOMENTE `accounts_payable.supplierId` (mesma fonte já
 *     estabelecida pelo módulo Despesas, Missão 29). `recurring_bill_templates` mostra a
 *     RELAÇÃO esperada (ex.: "Aluguel, mensal"), nunca um valor gasto real.
 *   - PRODUTOS comprados por fornecedor: `inventory_movements` (tipo compra/entrada) cujo campo
 *     `supplier` (texto livre) bate, por igualdade exata (case/acento-insensível), com
 *     `suppliers.name`. Fonte estruturalmente DIFERENTE de `accounts_payable` — nunca somada ao
 *     gasto financeiro, sempre exibida em seção própria.
 *   - `purchase_import_lines` (importação de notas fiscais) tem sua própria área dedicada em
 *     /estoque/auditoria/importar-compras — deliberadamente NÃO cruzada aqui, para não criar uma
 *     terceira fonte de verdade paralela; quando dados fluírem por lá, o fluxo já existente os
 *     materializa em `inventory_movements` reais, que aí sim entram nesta tela.
 *
 * Auditoria real (08/08/2026, Neon de produção): `accounts_payable` está com 0 lançamentos e
 * `inventory_movements.supplier` está 0/19 preenchido — não existe hoje nenhuma compra real
 * atribuída a um fornecedor em nenhuma das duas fontes. O módulo foi construído para ficar correto
 * assim que dados reais passarem a existir, mas exibe honestamente "sem dados disponíveis" em
 * praticamente todo indicador de compra enquanto isso não acontece — nunca preenchido
 * artificialmente.
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

function toSupplierPurchaseItem(view: AccountsPayableView): SupplierPurchaseItem | null {
  if (!view.supplierId) return null;
  return { supplierId: view.supplierId, orderDate: view.competenceDate, amount: view.originalAmount, description: view.description, categoryName: view.categoryName };
}

async function fetchAllSupplierProductPurchases(supplierByNormalizedName: Map<string, Supplier>): Promise<SupplierProductPurchase[]> {
  if (!isDatabaseConfigured()) return [];
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      supplier: inventoryMovements.supplier,
      itemId: inventoryMovements.itemId,
      itemName: inventoryItems.name,
      date: inventoryMovements.date,
      quantity: inventoryMovements.quantity,
      unitPricePaid: inventoryMovements.unitPricePaid,
    })
    .from(inventoryMovements)
    .innerJoin(inventoryItems, eq(inventoryMovements.itemId, inventoryItems.id))
    .where(and(inArray(inventoryMovements.type, ["compra", "entrada"]), sqlOp`${inventoryMovements.supplier} is not null`, sqlOp`${inventoryMovements.unitPricePaid} is not null`));

  const purchases: SupplierProductPurchase[] = [];
  for (const row of rows) {
    if (!row.supplier || row.unitPricePaid === null) continue;
    const supplier = supplierByNormalizedName.get(normalizeForExactMatch(row.supplier));
    if (!supplier) continue; // texto livre sem correspondência exata no catálogo — nunca associado por aproximação.
    purchases.push({ supplierId: supplier.id, itemId: row.itemId, itemName: row.itemName, date: row.date, quantity: Number(row.quantity), unitPrice: Number(row.unitPricePaid) });
  }
  return purchases;
}

export interface SupplierListItem {
  id: string;
  name: string;
  contactName: string | null;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  purchaseCount: number;
  totalSpent: number;
  averageTicket: number;
  firstPurchaseDate: string | null;
  lastPurchaseDate: string | null;
  daysSinceLastPurchase: number | null;
  inactivityBucket: InactivityBucket;
  distinctProductsCount: number;
  recurringRelationships: { description: string; periodicity: string; dueDay: number | null }[];
  share: number;
}

export interface SuppliersOverview {
  totalSuppliers: number;
  suppliersWithPurchases: number;
  suppliersActiveInPeriod: number;
  suppliersInactive90d: number;
  totalSpent: number;
  purchaseCount: number;
  averageTicket: number;
  averageSpentPerSupplier: number;
}

export interface SuppliersOverviewComparison {
  totalSpent: PeriodComparison;
  purchaseCount: PeriodComparison;
  suppliersActiveInPeriod: PeriodComparison;
}

export interface DataQualityReport {
  possibleDuplicateNames: ReturnType<typeof detectPossibleDuplicateSupplierNames>;
  purchasesWithoutSupplier: number;
  suppliersWithoutAnyPurchase: number;
}

export interface SuppliersGerencialResult {
  storageMode: StorageMode;
  period: PeriodRange;
  previousPeriod: { from: string; to: string };
  overview: SuppliersOverview;
  comparison: SuppliersOverviewComparison;
  suppliers: SupplierListItem[];
  concentration: ReturnType<typeof computeConcentration>;
  evolutionDaily: EvolutionPoint[];
  evolutionWeekly: EvolutionPoint[];
  evolutionMonthly: EvolutionPoint[];
  dataQuality: DataQualityReport;
  hasAnyPurchaseData: boolean;
}

function daysSince(dateIso: string, today: string): number {
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dateIso}T00:00:00Z`)) / 86_400_000);
}

export async function fetchSuppliersGerencial(period: PeriodRange): Promise<SuppliersGerencialResult> {
  const storageMode = getStorageMode();
  const today = saoPauloDateISO();
  const previous = previousPeriodOf(period);

  const [allSuppliers, { items: allPayables }, recurringTemplates] = await Promise.all([fetchSuppliers(), fetchAccountsPayableOverview(today), fetchRecurringBillTemplates()]);

  const supplierByNormalizedName = new Map(allSuppliers.map((s) => [normalizeForExactMatch(s.name), s]));
  const productPurchases = await fetchAllSupplierProductPurchases(supplierByNormalizedName);
  const productPriceRows = aggregateSupplierProductPrices(productPurchases);
  const distinctProductsBySupplier = new Map<string, Set<string>>();
  for (const row of productPriceRows) {
    const set = distinctProductsBySupplier.get(row.supplierId) ?? new Set<string>();
    set.add(row.itemId);
    distinctProductsBySupplier.set(row.supplierId, set);
  }

  const activePayables = allPayables.filter((p) => p.computedStatus !== "cancelada");
  const allItems = activePayables.map(toSupplierPurchaseItem).filter((i): i is SupplierPurchaseItem => i !== null);
  const currentItems = allItems.filter((i) => i.orderDate >= period.from && i.orderDate <= period.to);
  const previousItems = allItems.filter((i) => i.orderDate >= previous.from && i.orderDate <= previous.to);

  const lifetimeStatsBySupplier = new Map(aggregateSupplierStats(allItems).map((s) => [s.supplierId, s]));
  const currentStatsBySupplier = new Map(aggregateSupplierStats(currentItems).map((s) => [s.supplierId, s]));
  const previousStatsBySupplier = new Map(aggregateSupplierStats(previousItems).map((s) => [s.supplierId, s]));

  const recurringBySupplier = new Map<string, RecurringBillTemplate[]>();
  for (const t of recurringTemplates) {
    if (!t.supplierId) continue;
    const list = recurringBySupplier.get(t.supplierId) ?? [];
    list.push(t);
    recurringBySupplier.set(t.supplierId, list);
  }

  const grandLifetimeTotal = Array.from(lifetimeStatsBySupplier.values()).reduce((sum, s) => sum + s.total, 0);

  const suppliers: SupplierListItem[] = allSuppliers.map((s) => {
    const lifetime = lifetimeStatsBySupplier.get(s.id) ?? null;
    const daysSinceLastPurchase = lifetime?.lastDate ? daysSince(lifetime.lastDate, today) : null;
    return {
      id: s.id,
      name: s.name,
      contactName: s.contactName,
      taxId: s.taxId,
      phone: s.phone,
      email: s.email,
      purchaseCount: lifetime?.count ?? 0,
      totalSpent: lifetime?.total ?? 0,
      averageTicket: lifetime?.averageTicket ?? 0,
      firstPurchaseDate: lifetime?.firstDate ?? null,
      lastPurchaseDate: lifetime?.lastDate ?? null,
      daysSinceLastPurchase,
      inactivityBucket: classifyInactivity(daysSinceLastPurchase),
      distinctProductsCount: distinctProductsBySupplier.get(s.id)?.size ?? 0,
      recurringRelationships: (recurringBySupplier.get(s.id) ?? []).map((t) => ({ description: t.description, periodicity: t.periodicity, dueDay: t.dueDay })),
      share: grandLifetimeTotal > 0 ? round2(((lifetime?.total ?? 0) / grandLifetimeTotal) * 100) : 0,
    };
  });

  const totalSpentCurrent = currentItems.reduce((sum, i) => sum + i.amount, 0);
  const totalSpentPrevious = previousItems.reduce((sum, i) => sum + i.amount, 0);
  const activeSuppliersCurrent = currentStatsBySupplier.size;
  const activeSuppliersPrevious = previousStatsBySupplier.size;

  const overview: SuppliersOverview = {
    totalSuppliers: allSuppliers.length,
    suppliersWithPurchases: lifetimeStatsBySupplier.size,
    suppliersActiveInPeriod: activeSuppliersCurrent,
    suppliersInactive90d: suppliers.filter((s) => s.inactivityBucket === "90_dias").length,
    totalSpent: round2(totalSpentCurrent),
    purchaseCount: currentItems.length,
    averageTicket: currentItems.length > 0 ? round2(totalSpentCurrent / currentItems.length) : 0,
    averageSpentPerSupplier: activeSuppliersCurrent > 0 ? round2(totalSpentCurrent / activeSuppliersCurrent) : 0,
  };

  const comparison: SuppliersOverviewComparison = {
    totalSpent: comparePeriodValues(round2(totalSpentCurrent), round2(totalSpentPrevious)),
    purchaseCount: comparePeriodValues(currentItems.length, previousItems.length),
    suppliersActiveInPeriod: comparePeriodValues(activeSuppliersCurrent, activeSuppliersPrevious),
  };

  const concentration = computeConcentration(
    Array.from(lifetimeStatsBySupplier.values())
      .map((s) => s.total)
      .sort((a, b) => b - a),
  );

  const evolutionItems = allItems.map((i) => ({ orderDate: i.orderDate, amount: i.amount }));
  const evolutionDaily = evolutionByGranularity(currentItems.map((i) => ({ orderDate: i.orderDate, amount: i.amount })), "day", dailyBuckets(period.from, period.to));
  const evolutionWeekly = evolutionByGranularity(currentItems.map((i) => ({ orderDate: i.orderDate, amount: i.amount })), "week", weeklyBuckets(period.from, period.to));
  const evolutionMonthly = evolutionByGranularity(evolutionItems, "month", monthlyBuckets(12, today.slice(0, 7)));

  const possibleDuplicateNames = detectPossibleDuplicateSupplierNames(allSuppliers.map((s) => s.name));
  const purchasesWithoutSupplier = activePayables.filter((p) => !p.supplierId).length;
  const suppliersWithoutAnyPurchase = allSuppliers.length - lifetimeStatsBySupplier.size;

  return {
    storageMode,
    period,
    previousPeriod: previous,
    overview,
    comparison,
    suppliers: suppliers.sort((a, b) => b.totalSpent - a.totalSpent),
    concentration,
    evolutionDaily,
    evolutionWeekly,
    evolutionMonthly,
    dataQuality: { possibleDuplicateNames, purchasesWithoutSupplier, suppliersWithoutAnyPurchase },
    hasAnyPurchaseData: allItems.length > 0 || productPurchases.length > 0,
  };
}

export interface SupplierDetailResult {
  supplier: Supplier;
  found: true;
  lifetimeStats: SupplierStats | null;
  currentStats: SupplierStats | null;
  previousStats: SupplierStats | null;
  comparison: { total: PeriodComparison; count: PeriodComparison };
  daysSinceLastPurchase: number | null;
  inactivityBucket: InactivityBucket;
  isStoppedRelativeToOwnPattern: boolean;
  evolutionMonthly: EvolutionPoint[];
  payables: AccountsPayableView[];
  products: SupplierProductPriceRow[];
  recurringRelationships: RecurringBillTemplate[];
  shareOfTotalSpend: number;
}

export async function fetchSupplierDetail(id: string, period: PeriodRange): Promise<SupplierDetailResult | { found: false }> {
  if (!isDatabaseConfigured()) return { found: false };
  const today = saoPauloDateISO();

  const [allSuppliers, { items: allPayables }, recurringTemplates] = await Promise.all([fetchSuppliers(), fetchAccountsPayableOverview(today), fetchRecurringBillTemplates()]);
  const supplier = allSuppliers.find((s) => s.id === id);
  if (!supplier) return { found: false };

  const supplierByNormalizedName = new Map(allSuppliers.map((s) => [normalizeForExactMatch(s.name), s]));
  const productPurchases = await fetchAllSupplierProductPurchases(supplierByNormalizedName);
  const products = aggregateSupplierProductPrices(productPurchases.filter((p) => p.supplierId === id));

  const activePayables = allPayables.filter((p) => p.computedStatus !== "cancelada" && p.supplierId === id);
  const allItems = activePayables.map(toSupplierPurchaseItem).filter((i): i is SupplierPurchaseItem => i !== null);

  const previous = previousPeriodOf(period);
  const currentItems = allItems.filter((i) => i.orderDate >= period.from && i.orderDate <= period.to);
  const previousItems = allItems.filter((i) => i.orderDate >= previous.from && i.orderDate <= previous.to);

  const [lifetimeStats] = aggregateSupplierStats(allItems);
  const [currentStats] = aggregateSupplierStats(currentItems);
  const [previousStats] = aggregateSupplierStats(previousItems);

  const daysSinceLastPurchase = lifetimeStats?.lastDate ? daysSince(lifetimeStats.lastDate, today) : null;
  const purchaseDates = allItems.map((i) => i.orderDate);

  const allActivePayablesEverywhere = allPayables.filter((p) => p.computedStatus !== "cancelada" && p.supplierId).map(toSupplierPurchaseItem).filter((i): i is SupplierPurchaseItem => i !== null);
  const grandTotal = aggregateSupplierStats(allActivePayablesEverywhere).reduce((sum, s) => sum + s.total, 0);

  return {
    supplier,
    found: true,
    lifetimeStats: lifetimeStats ?? null,
    currentStats: currentStats ?? null,
    previousStats: previousStats ?? null,
    comparison: {
      total: comparePeriodValues(currentStats?.total ?? 0, previousStats?.total ?? 0),
      count: comparePeriodValues(currentStats?.count ?? 0, previousStats?.count ?? 0),
    },
    daysSinceLastPurchase,
    inactivityBucket: classifyInactivity(daysSinceLastPurchase),
    isStoppedRelativeToOwnPattern: hasStoppedComing(purchaseDates, daysSinceLastPurchase),
    evolutionMonthly: evolutionByGranularity(
      allItems.map((i) => ({ orderDate: i.orderDate, amount: i.amount })),
      "month",
      monthlyBuckets(12, today.slice(0, 7)),
    ),
    payables: activePayables.sort((a, b) => b.competenceDate.localeCompare(a.competenceDate)),
    products: products.sort((a, b) => b.purchaseCount - a.purchaseCount),
    recurringRelationships: recurringTemplates.filter((t) => t.supplierId === id),
    shareOfTotalSpend: grandTotal > 0 ? round2(((lifetimeStats?.total ?? 0) / grandTotal) * 100) : 0,
  };
}

/** Produtos com histórico real de compra em mais de um fornecedor — base da comparação de preços (item 5). */
export async function fetchComparableProducts(): Promise<Map<string, SupplierProductPriceRow[]>> {
  if (!isDatabaseConfigured()) return new Map();
  const allSuppliers = await fetchSuppliers();
  const supplierByNormalizedName = new Map(allSuppliers.map((s) => [normalizeForExactMatch(s.name), s]));
  const purchases = await fetchAllSupplierProductPurchases(supplierByNormalizedName);
  const rows = aggregateSupplierProductPrices(purchases);

  const byItem = new Map<string, SupplierProductPriceRow[]>();
  for (const row of rows) {
    const list = byItem.get(row.itemId) ?? [];
    list.push(row);
    byItem.set(row.itemId, list);
  }
  const comparable = new Map<string, SupplierProductPriceRow[]>();
  for (const [itemId, list] of byItem) {
    if (new Set(list.map((r) => r.supplierId)).size > 1) comparable.set(itemId, list);
  }
  return comparable;
}
