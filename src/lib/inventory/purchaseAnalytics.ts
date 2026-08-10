import { averageIntervalDays, computeFrequencyTrend, hasStoppedComing, type FrequencyTrend } from "@/lib/integrations/jumppark/vehicleAnalytics";
import { detectPossibleDuplicateCategories, type PossibleDuplicatePair } from "@/lib/integrations/jumppark/serviceAnalytics";
import { addDaysIso } from "@/lib/utils/timezone";

/**
 * Missão 33 (módulo gerencial de Produtos/Compras) — agregações puras (sem I/O) sobre eventos
 * reais de compra (`inventory_movements`, tipo `compra`). Reaproveita, sem duplicar,
 * `averageIntervalDays`/`computeFrequencyTrend`/`hasStoppedComing` (Veículos, Missão 30) e a
 * varredura léxica de nomes semelhantes (Serviços, Missão 31 — já genérica, reaproveitada
 * também em Fornecedores, Missão 32).
 */

export function detectPossibleDuplicateProductNames(names: string[], threshold = 0.3, limit = 20): PossibleDuplicatePair[] {
  return detectPossibleDuplicateCategories(names, threshold, limit);
}

export { averageIntervalDays, computeFrequencyTrend, hasStoppedComing, type FrequencyTrend };

/** Um evento real de compra (`inventory_movements`, tipo compra) já enriquecido com dados do produto. */
export interface PurchaseEvent {
  movementId: string;
  itemId: string;
  itemName: string;
  category: string;
  unit: string;
  orderDate: string;
  quantity: number;
  /** Null quando a compra não informou preço pago — NUNCA inferido a partir de outro dado. */
  unitPricePaid: number | null;
  supplierText: string | null;
  reference: string | null;
  responsible: string | null;
  notes: string | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** `null` quando a compra não tem preço — nunca vira 0 (0 significaria "de graça", diferente de "não informado"). */
export function purchaseTotalValue(event: Pick<PurchaseEvent, "quantity" | "unitPricePaid">): number | null {
  return event.unitPricePaid === null ? null : round2(event.quantity * event.unitPricePaid);
}

export interface ProductPurchaseStats {
  itemId: string;
  itemName: string;
  category: string;
  unit: string;
  purchaseCount: number;
  totalQuantity: number;
  /** Soma só das compras com preço informado — nunca confundir com "total gasto = 0". */
  totalValue: number;
  purchasesWithKnownValue: number;
  lastPrice: number | null;
  lastDate: string | null;
  firstDate: string | null;
  averagePrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
}

export function aggregateProductPurchaseStats(events: PurchaseEvent[]): ProductPurchaseStats[] {
  const groups = new Map<string, PurchaseEvent[]>();
  for (const e of events) {
    const list = groups.get(e.itemId) ?? [];
    list.push(e);
    groups.set(e.itemId, list);
  }

  return Array.from(groups.entries()).map(([itemId, list]) => {
    const sorted = [...list].sort((a, b) => a.orderDate.localeCompare(b.orderDate));
    const priced = list.filter((e) => e.unitPricePaid !== null);
    const prices = priced.map((e) => e.unitPricePaid as number);
    const dates = sorted.map((e) => e.orderDate);
    const lastPriced = [...priced].sort((a, b) => a.orderDate.localeCompare(b.orderDate)).at(-1) ?? null;

    return {
      itemId,
      itemName: sorted[0].itemName,
      category: sorted[0].category,
      unit: sorted[0].unit,
      purchaseCount: list.length,
      totalQuantity: round2(list.reduce((sum, e) => sum + e.quantity, 0)),
      totalValue: round2(priced.reduce((sum, e) => sum + (purchaseTotalValue(e) ?? 0), 0)),
      purchasesWithKnownValue: priced.length,
      lastPrice: lastPriced?.unitPricePaid ?? null,
      lastDate: dates.at(-1) ?? null,
      firstDate: dates[0] ?? null,
      averagePrice: prices.length > 0 ? round2(prices.reduce((s, p) => s + p, 0) / prices.length) : null,
      minPrice: prices.length > 0 ? Math.min(...prices) : null,
      maxPrice: prices.length > 0 ? Math.max(...prices) : null,
    };
  });
}

export interface CategoryPurchaseStats {
  category: string;
  purchaseCount: number;
  totalValue: number;
  purchasesWithKnownValue: number;
  distinctProducts: number;
  share: number;
}

/** `share` = % do `totalValue` desta categoria sobre o total geral (só entre compras com valor conhecido). */
export function aggregateCategoryPurchaseStats(events: PurchaseEvent[]): CategoryPurchaseStats[] {
  const groups = new Map<string, PurchaseEvent[]>();
  for (const e of events) {
    const list = groups.get(e.category) ?? [];
    list.push(e);
    groups.set(e.category, list);
  }

  const grandTotal = events.reduce((sum, e) => sum + (purchaseTotalValue(e) ?? 0), 0);

  return Array.from(groups.entries()).map(([category, list]) => {
    const priced = list.filter((e) => e.unitPricePaid !== null);
    const total = round2(priced.reduce((sum, e) => sum + (purchaseTotalValue(e) ?? 0), 0));
    return {
      category,
      purchaseCount: list.length,
      totalValue: total,
      purchasesWithKnownValue: priced.length,
      distinctProducts: new Set(list.map((e) => e.itemId)).size,
      share: grandTotal > 0 ? round2((total / grandTotal) * 100) : 0,
    };
  });
}

export interface NextPurchaseEstimate {
  estimatedDate: string;
  averageIntervalDays: number;
  basis: string;
}

const MIN_PURCHASES_FOR_ESTIMATE = 3;

/**
 * Estimativa puramente estatística — nunca uma previsão real. Só calculada com evidência mínima
 * (`MIN_PURCHASES_FOR_ESTIMATE`+ compras em datas distintas). `basis` explica a regra em
 * linguagem direta, para nunca ser confundida com um compromisso real.
 */
export function estimateNextPurchase(datesSortedAsc: string[]): NextPurchaseEstimate | null {
  const distinct = Array.from(new Set(datesSortedAsc)).sort();
  if (distinct.length < MIN_PURCHASES_FOR_ESTIMATE) return null;
  const avg = averageIntervalDays(distinct);
  if (avg === null) return null;
  const lastDate = distinct.at(-1) as string;
  return {
    estimatedDate: addDaysIso(lastDate, avg),
    averageIntervalDays: avg,
    basis: `Estimativa baseada no intervalo médio real entre as ${distinct.length} últimas compras deste produto (${avg} dias) somado à última compra (${lastDate}) — não é uma previsão real, só uma projeção estatística do padrão observado.`,
  };
}

export type EconomyOpportunityKind = "preco_menor_no_passado" | "preco_subiu" | "concentracao_fornecedor" | "compra_muito_frequente";

export interface EconomyOpportunity {
  kind: EconomyOpportunityKind;
  itemId: string;
  itemName: string;
  description: string;
  evidence: string;
}

const PRICE_INCREASE_THRESHOLD_PERCENT = 20;

/**
 * Só evidências reais e objetivas — nunca estima "economia potencial" em R$. "Preço menor no
 * passado": o preço mais recente é maior que o menor preço já pago pelo MESMO produto. "Preço
 * subiu": variação entre o primeiro e o último preço conhecido acima de `PRICE_INCREASE_THRESHOLD_PERCENT`.
 */
export function detectPriceOpportunities(stats: ProductPurchaseStats[]): EconomyOpportunity[] {
  const opportunities: EconomyOpportunity[] = [];
  for (const s of stats) {
    if (s.lastPrice === null || s.minPrice === null || s.purchasesWithKnownValue < 2) continue;

    if (s.lastPrice > s.minPrice) {
      opportunities.push({
        kind: "preco_menor_no_passado",
        itemId: s.itemId,
        itemName: s.itemName,
        description: `Último preço pago (${s.lastPrice}) é maior que o menor preço já pago (${s.minPrice}) por este produto.`,
        evidence: `${s.purchasesWithKnownValue} compra(s) com preço conhecido; menor preço histórico: ${s.minPrice}; último preço: ${s.lastPrice}.`,
      });
    }
  }
  return opportunities;
}

export function detectPriceIncreaseOpportunities(events: PurchaseEvent[]): EconomyOpportunity[] {
  const byItem = new Map<string, PurchaseEvent[]>();
  for (const e of events) {
    if (e.unitPricePaid === null) continue;
    const list = byItem.get(e.itemId) ?? [];
    list.push(e);
    byItem.set(e.itemId, list);
  }

  const opportunities: EconomyOpportunity[] = [];
  for (const [itemId, list] of byItem) {
    if (list.length < 2) continue;
    const sorted = [...list].sort((a, b) => a.orderDate.localeCompare(b.orderDate));
    const first = sorted[0].unitPricePaid as number;
    const last = sorted.at(-1)!.unitPricePaid as number;
    if (first <= 0) continue;
    const percentChange = round2(((last - first) / first) * 100);
    if (percentChange > PRICE_INCREASE_THRESHOLD_PERCENT) {
      opportunities.push({
        kind: "preco_subiu",
        itemId,
        itemName: sorted[0].itemName,
        description: `Preço subiu ${percentChange}% desde a primeira compra com preço conhecido.`,
        evidence: `Primeiro preço conhecido: ${first} (${sorted[0].orderDate}); último preço conhecido: ${last} (${sorted.at(-1)!.orderDate}).`,
      });
    }
  }
  return opportunities;
}
