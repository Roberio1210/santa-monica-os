import { averageIntervalDays, computeFrequencyTrend, hasStoppedComing, type FrequencyTrend } from "@/lib/integrations/jumppark/vehicleAnalytics";
import { detectPossibleDuplicateCategories, type PossibleDuplicatePair } from "@/lib/integrations/jumppark/serviceAnalytics";

/**
 * Missão 32 (módulo gerencial de Fornecedores) — agregações puras (sem I/O). Reaproveita, sem
 * duplicar, funções já existentes e testadas noutros módulos: `averageIntervalDays`/
 * `computeFrequencyTrend`/`hasStoppedComing` (Veículos, Missão 30 — totalmente genéricas sobre
 * listas de datas, nada específico de veículo) e `detectPossibleDuplicateCategories` (Serviços,
 * Missão 31 — varredura léxica genérica sobre nomes, nada específico de categoria de serviço).
 */

export function detectPossibleDuplicateSupplierNames(names: string[], threshold = 0.3, limit = 20): PossibleDuplicatePair[] {
  return detectPossibleDuplicateCategories(names, threshold, limit);
}

export { averageIntervalDays, computeFrequencyTrend, hasStoppedComing, type FrequencyTrend };

/** Um lançamento real de Contas a Pagar já atribuído a um fornecedor (`supplierId` não nulo). */
export interface SupplierPurchaseItem {
  supplierId: string;
  /** Data de competência do lançamento — mesmo conceito já usado em Despesas (Missão 29). */
  orderDate: string;
  amount: number;
  description: string;
  categoryName: string;
}

export interface SupplierStats {
  supplierId: string;
  count: number;
  total: number;
  averageTicket: number;
  firstDate: string | null;
  lastDate: string | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function aggregateSupplierStats(items: SupplierPurchaseItem[]): SupplierStats[] {
  const groups = new Map<string, SupplierPurchaseItem[]>();
  for (const item of items) {
    const list = groups.get(item.supplierId) ?? [];
    list.push(item);
    groups.set(item.supplierId, list);
  }

  return Array.from(groups.entries()).map(([supplierId, list]) => {
    const total = round2(list.reduce((sum, i) => sum + i.amount, 0));
    const dates = list.map((i) => i.orderDate).sort();
    return {
      supplierId,
      count: list.length,
      total,
      averageTicket: list.length > 0 ? round2(total / list.length) : 0,
      firstDate: dates[0] ?? null,
      lastDate: dates[dates.length - 1] ?? null,
    };
  });
}

export interface ConcentrationResult {
  /** % do total gasto concentrado no maior fornecedor (por valor). */
  top1Share: number;
  top3Share: number;
  top5Share: number;
  /** Quantos fornecedores distintos tiveram gasto no conjunto analisado. */
  suppliersWithSpend: number;
}

/** `totals` já deve vir ordenado do maior para o menor gasto. */
export function computeConcentration(totalsDesc: number[]): ConcentrationResult {
  const grandTotal = totalsDesc.reduce((sum, t) => sum + t, 0);
  const shareOfTopN = (n: number) => (grandTotal > 0 ? round2((totalsDesc.slice(0, n).reduce((sum, t) => sum + t, 0) / grandTotal) * 100) : 0);
  return {
    top1Share: shareOfTopN(1),
    top3Share: shareOfTopN(3),
    top5Share: shareOfTopN(5),
    suppliersWithSpend: totalsDesc.length,
  };
}

export type InactivityBucket = "ativo" | "30_dias" | "60_dias" | "90_dias";

/** Classificação fixa por dias corridos desde a última compra — nunca um julgamento, só a contagem. */
export function classifyInactivity(daysSinceLastPurchase: number | null): InactivityBucket {
  if (daysSinceLastPurchase === null) return "ativo";
  if (daysSinceLastPurchase >= 90) return "90_dias";
  if (daysSinceLastPurchase >= 60) return "60_dias";
  if (daysSinceLastPurchase >= 30) return "30_dias";
  return "ativo";
}

/** Uma compra real de um produto, de um fornecedor, com preço unitário conhecido (`inventory_movements`, tipo compra/entrada). */
export interface SupplierProductPurchase {
  supplierId: string;
  itemId: string;
  itemName: string;
  date: string;
  quantity: number;
  unitPrice: number;
}

export interface SupplierProductPriceRow {
  supplierId: string;
  itemId: string;
  itemName: string;
  purchaseCount: number;
  totalQuantity: number;
  lastPrice: number;
  lastDate: string;
  averagePrice: number;
  minPrice: number;
  maxPrice: number;
}

/**
 * Agrega compras reais por (fornecedor, produto) — base da comparação de preços entre
 * fornecedores. Nunca declara um fornecedor "melhor": só expõe os números reais lado a lado,
 * quem for consultar decide. Só inclui linhas com preço unitário realmente informado — nunca
 * calcula um preço a partir de um total sem quantidade confiável.
 */
export function aggregateSupplierProductPrices(purchases: SupplierProductPurchase[]): SupplierProductPriceRow[] {
  const groups = new Map<string, SupplierProductPurchase[]>();
  for (const p of purchases) {
    const key = `${p.supplierId}|||${p.itemId}`;
    const list = groups.get(key) ?? [];
    list.push(p);
    groups.set(key, list);
  }

  return Array.from(groups.values()).map((list) => {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const prices = list.map((p) => p.unitPrice);
    return {
      supplierId: list[0].supplierId,
      itemId: list[0].itemId,
      itemName: list[0].itemName,
      purchaseCount: list.length,
      totalQuantity: round2(list.reduce((sum, p) => sum + p.quantity, 0)),
      lastPrice: sorted[sorted.length - 1].unitPrice,
      lastDate: sorted[sorted.length - 1].date,
      averagePrice: round2(prices.reduce((sum, p) => sum + p, 0) / prices.length),
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
    };
  });
}

/** Produtos que já foram comprados de mais de um fornecedor distinto — só esses são "comparáveis" entre fornecedores. */
export function productsWithMultipleSuppliers(rows: SupplierProductPriceRow[]): Map<string, SupplierProductPriceRow[]> {
  const byItem = new Map<string, SupplierProductPriceRow[]>();
  for (const row of rows) {
    const list = byItem.get(row.itemId) ?? [];
    list.push(row);
    byItem.set(row.itemId, list);
  }
  const result = new Map<string, SupplierProductPriceRow[]>();
  for (const [itemId, list] of byItem) {
    if (new Set(list.map((r) => r.supplierId)).size > 1) result.set(itemId, list);
  }
  return result;
}

