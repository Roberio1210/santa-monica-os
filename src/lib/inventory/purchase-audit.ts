import type { StockMovement } from "@/lib/inventory/types";

/**
 * Auditoria de Compras por Produto (Missão 23, seção 10) — só lê movimentações do tipo "compra"
 * já existentes (ou geradas por uma futura importação confirmada). Nunca inventa uma compra:
 * quando não há nenhuma movimentação de compra para o item, todo campo numérico vem `null`/0 e
 * `purchaseCount` é 0 — a tela precisa mostrar isso como "sem histórico", não como zero real.
 */

export interface PricePoint {
  date: string;
  price: number;
}

export interface SupplierFrequency {
  supplier: string;
  count: number;
}

export interface ItemPurchaseStats {
  itemId: string;
  purchaseCount: number;
  totalQuantityPurchased: number;
  /** Já na unidade-base do item — nesta missão as compras registradas como movimentação já chegam convertidas. */
  totalQuantityConvertedToBaseUnit: number;
  totalValuePurchased: number;
  averagePrice: number | null;
  lowestPrice: number | null;
  highestPrice: number | null;
  lastPrice: number | null;
  lastPurchaseDate: string | null;
  /** Ordenada por data crescente — só os pontos com preço conhecido. */
  priceEvolution: PricePoint[];
  suppliers: SupplierFrequency[];
  mostFrequentSupplier: string | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeItemPurchaseStats(itemId: string, movements: StockMovement[]): ItemPurchaseStats {
  const purchases = movements.filter((m) => m.itemId === itemId && m.type === "compra");

  if (purchases.length === 0) {
    return {
      itemId,
      purchaseCount: 0,
      totalQuantityPurchased: 0,
      totalQuantityConvertedToBaseUnit: 0,
      totalValuePurchased: 0,
      averagePrice: null,
      lowestPrice: null,
      highestPrice: null,
      lastPrice: null,
      lastPurchaseDate: null,
      priceEvolution: [],
      suppliers: [],
      mostFrequentSupplier: null,
    };
  }

  const sortedByDate = [...purchases].sort((a, b) => a.date.localeCompare(b.date));

  let totalQuantity = 0;
  let totalValue = 0;
  let valueWeight = 0;
  const priceEvolution: PricePoint[] = [];
  const supplierCounts = new Map<string, number>();

  for (const movement of sortedByDate) {
    totalQuantity += movement.quantity;
    const price = movement.unitPricePaid ?? null;
    if (price !== null) {
      totalValue += movement.quantity * price;
      valueWeight += movement.quantity;
      priceEvolution.push({ date: movement.date, price });
    }
    if (movement.supplier) supplierCounts.set(movement.supplier, (supplierCounts.get(movement.supplier) ?? 0) + 1);
  }

  const prices = priceEvolution.map((p) => p.price);
  const suppliers = Array.from(supplierCounts.entries())
    .map(([supplier, count]) => ({ supplier, count }))
    .sort((a, b) => b.count - a.count);

  const last = sortedByDate[sortedByDate.length - 1];

  return {
    itemId,
    purchaseCount: purchases.length,
    totalQuantityPurchased: totalQuantity,
    totalQuantityConvertedToBaseUnit: totalQuantity,
    totalValuePurchased: round2(totalValue),
    averagePrice: valueWeight > 0 ? round2(totalValue / valueWeight) : null,
    lowestPrice: prices.length > 0 ? Math.min(...prices) : null,
    highestPrice: prices.length > 0 ? Math.max(...prices) : null,
    lastPrice: last.unitPricePaid ?? null,
    lastPurchaseDate: last.date,
    priceEvolution,
    suppliers,
    mostFrequentSupplier: suppliers[0]?.supplier ?? null,
  };
}

export function computePurchaseStatsForItems(itemIds: string[], movements: StockMovement[]): Map<string, ItemPurchaseStats> {
  const result = new Map<string, ItemPurchaseStats>();
  for (const itemId of itemIds) result.set(itemId, computeItemPurchaseStats(itemId, movements));
  return result;
}
