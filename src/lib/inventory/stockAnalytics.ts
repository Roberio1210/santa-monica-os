import type { InventoryItem, InventoryItemView, MovementType, StockMovement } from "@/lib/inventory/types";

/**
 * Missão 34 (módulo gerencial de Estoque) — agregações puras (sem I/O). Reaproveita, sem duplicar,
 * `computeStatus`/`computeStockValue` (status.ts), `isStaleItem`/`computeTotalStockValue`
 * (dashboard-metrics.ts) e `computePurchaseSuggestion`/`fetchPurchaseSuggestions`
 * (purchase-suggestions.ts, já resolve reposição/consumo médio — não reimplementado aqui).
 *
 * Tipos de redução de estoque, separados por natureza (a mesma taxonomia ampla de
 * `purchase-suggestions.ts`'s CONSUMPTION_TYPES, mas dividida em duas visões distintas pedidas
 * pela missão: "Consumo" seção 13/14 vs "Perdas" seção 17):
 *  - CONSUMO_OPERACIONAL: uso produtivo real do produto.
 *  - PERDA_TYPES: saiu do estoque sem uso produtivo (perda/avaria/vencimento/descarte).
 *  - "outros" fica de fora das duas — motivo desconhecido, nunca classificado às cegas.
 */
export const CONSUMO_OPERACIONAL_TYPES: MovementType[] = ["saida", "consumo_interno", "consumo_teste_calibracao"];
export const PERDA_TYPES: MovementType[] = ["perda", "avaria", "vencimento", "descarte"];
export const ENTRADA_TYPES: MovementType[] = ["entrada", "compra"];
export const AJUSTE_TYPES: MovementType[] = ["ajuste_positivo", "ajuste_negativo", "ajuste_inventario", "correcao_inventario"];
/** Toda redução de saldo considerada para giro/reposição — mesma lista ampla de purchase-suggestions.ts. */
export const REDUCAO_TYPES: MovementType[] = [...CONSUMO_OPERACIONAL_TYPES, ...PERDA_TYPES, "outros"];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Status da "Posição Atual" (seção 2) — vocabulário pedido explicitamente pela missão
 * (NORMAL/BAIXO/CRÍTICO/ZERADO/SEM_MOVIMENTAÇÃO), calculado a partir dos MESMOS critérios já
 * documentados em `computeStatus` (status.ts: mínimo, 1.5×mínimo) — nunca um limiar novo
 * inventado. Prioridade: ZERADO > CRÍTICO > BAIXO > SEM_MOVIMENTAÇÃO > NORMAL. "Sem movimentação"
 * usa o mesmo limiar de 180 dias de `dashboard-metrics.ts` (STALE_MOVEMENT_THRESHOLD_DAYS).
 */
export type PositionStatus = "ZERADO" | "CRITICO" | "BAIXO" | "SEM_MOVIMENTACAO" | "NORMAL";

export function computePositionStatus(item: Pick<InventoryItem, "currentQuantity" | "minimumStock">, isStale: boolean): PositionStatus {
  if (item.currentQuantity === 0) return "ZERADO";
  if (item.minimumStock !== null) {
    if (item.currentQuantity <= item.minimumStock) return "CRITICO";
    if (item.currentQuantity <= item.minimumStock * 1.5) return "BAIXO";
  }
  if (isStale) return "SEM_MOVIMENTACAO";
  return "NORMAL";
}

export interface PositionRow {
  itemId: string;
  itemName: string;
  category: string;
  unit: string;
  currentQuantity: number;
  minimumStock: number | null;
  /** Custo médio ponderado cadastrado no item (weighted-average-cost.ts o mantém atualizado a cada entrada com preço). */
  averageCost: number | null;
  /** Preço unitário da ÚLTIMA compra/entrada com preço informado — distinto do custo médio (pode divergir). */
  lastCost: number | null;
  stockValue: number | null;
  lastEntryDate: string | null;
  lastExitDate: string | null;
  daysSinceLastMovement: number | null;
  lastPurchaseSupplier: string | null;
  status: PositionStatus;
}

export function buildPositionRow(item: InventoryItem, movements: StockMovement[], referenceDate: Date): PositionRow {
  const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date));
  const entries = sorted.filter((m) => ENTRADA_TYPES.includes(m.type));
  const exits = sorted.filter((m) => CONSUMO_OPERACIONAL_TYPES.includes(m.type) || PERDA_TYPES.includes(m.type));
  const pricedEntries = entries.filter((m) => m.unitPricePaid !== null && m.unitPricePaid !== undefined);
  const lastPricedEntry = pricedEntries.at(-1) ?? null;
  const lastEntryWithSupplier = [...entries].reverse().find((m) => m.supplier);

  const lastMovementDate = sorted.at(-1)?.date ?? null;
  const daysSinceLastMovement = lastMovementDate === null ? null : Math.floor((referenceDate.getTime() - Date.parse(lastMovementDate)) / 86_400_000);
  const isStale = lastMovementDate === null || (daysSinceLastMovement !== null && daysSinceLastMovement >= 180);

  return {
    itemId: item.id,
    itemName: item.name,
    category: item.category,
    unit: item.unit,
    currentQuantity: item.currentQuantity,
    minimumStock: item.minimumStock,
    averageCost: item.unitCost,
    lastCost: lastPricedEntry?.unitPricePaid ?? null,
    stockValue: item.unitCost !== null ? round2(item.currentQuantity * item.unitCost) : null,
    lastEntryDate: entries.at(-1)?.date ?? null,
    lastExitDate: exits.at(-1)?.date ?? null,
    daysSinceLastMovement,
    lastPurchaseSupplier: lastEntryWithSupplier?.supplier ?? null,
    status: computePositionStatus(item, isStale),
  };
}

/** Buckets de "produtos parados" (seção 10) — limiares pedidos explicitamente pela missão (30/60/90/180 dias). */
export type StaleBucket = "30_dias" | "60_dias" | "90_dias" | "180_dias" | null;

export function classifyStaleBucket(daysSinceLastMovement: number | null): StaleBucket {
  if (daysSinceLastMovement === null) return "180_dias";
  if (daysSinceLastMovement >= 180) return "180_dias";
  if (daysSinceLastMovement >= 90) return "90_dias";
  if (daysSinceLastMovement >= 60) return "60_dias";
  if (daysSinceLastMovement >= 30) return "30_dias";
  return null;
}

/**
 * Giro (seção 9) — ranking relativo por quantidade consumida/perdida no período (nunca um limiar
 * "alto/médio/baixo" arbitrário). "Maior giro"/"menor giro" são apenas as pontas do mesmo ranking;
 * "sem giro" é a lista à parte de quem teve ZERO redução no período, para nunca ser confundido com
 * "baixo giro" (que pelo menos teve alguma saída real).
 */
export interface TurnoverRow {
  itemId: string;
  itemName: string;
  category: string;
  unit: string;
  reductionCount: number;
  reductionQuantity: number;
  lastReductionDate: string | null;
}

export function computeTurnoverRanking(items: Pick<InventoryItem, "id" | "name" | "category" | "unit">[], movementsByItem: Map<string, StockMovement[]>): TurnoverRow[] {
  return items.map((item) => {
    const movements = (movementsByItem.get(item.id) ?? []).filter((m) => REDUCAO_TYPES.includes(m.type));
    const sorted = [...movements].sort((a, b) => a.date.localeCompare(b.date));
    return {
      itemId: item.id,
      itemName: item.name,
      category: item.category,
      unit: item.unit,
      reductionCount: movements.length,
      reductionQuantity: round2(movements.reduce((sum, m) => sum + m.quantity, 0)),
      lastReductionDate: sorted.at(-1)?.date ?? null,
    };
  });
}

/** Agregação de consumo/perda por produto e por categoria — usada tanto em "Consumo por período" quanto em "Perdas". */
export interface ReductionStats {
  itemId: string;
  itemName: string;
  category: string;
  unit: string;
  count: number;
  quantity: number;
  /** Custo estimado = quantidade × custo médio do item no momento da consulta. Null quando o item não tem custo cadastrado — nunca 0. */
  estimatedCost: number | null;
}

export interface CategoryReductionStats {
  category: string;
  count: number;
  quantity: number;
  estimatedCost: number;
  itemsWithoutCost: number;
  /** % do custo estimado total (só entre categorias com custo conhecido). */
  share: number;
}

export function aggregateReductionsByProduct(movements: StockMovement[], itemById: Map<string, Pick<InventoryItem, "id" | "name" | "category" | "unit" | "unitCost">>): ReductionStats[] {
  const groups = new Map<string, StockMovement[]>();
  for (const m of movements) {
    const list = groups.get(m.itemId) ?? [];
    list.push(m);
    groups.set(m.itemId, list);
  }

  const result: ReductionStats[] = [];
  for (const [itemId, list] of groups) {
    const item = itemById.get(itemId);
    if (!item) continue;
    const quantity = round2(list.reduce((sum, m) => sum + m.quantity, 0));
    result.push({
      itemId,
      itemName: item.name,
      category: item.category,
      unit: item.unit,
      count: list.length,
      quantity,
      estimatedCost: item.unitCost !== null ? round2(quantity * item.unitCost) : null,
    });
  }
  return result.sort((a, b) => (b.estimatedCost ?? -1) - (a.estimatedCost ?? -1));
}

export function aggregateReductionsByCategory(productStats: ReductionStats[]): CategoryReductionStats[] {
  const groups = new Map<string, ReductionStats[]>();
  for (const s of productStats) {
    const list = groups.get(s.category) ?? [];
    list.push(s);
    groups.set(s.category, list);
  }

  const grandTotal = productStats.reduce((sum, s) => sum + (s.estimatedCost ?? 0), 0);

  return Array.from(groups.entries())
    .map(([category, list]) => {
      const estimatedCost = round2(list.reduce((sum, s) => sum + (s.estimatedCost ?? 0), 0));
      return {
        category,
        count: list.reduce((sum, s) => sum + s.count, 0),
        quantity: round2(list.reduce((sum, s) => sum + s.quantity, 0)),
        estimatedCost,
        itemsWithoutCost: list.filter((s) => s.estimatedCost === null).length,
        share: grandTotal > 0 ? round2((estimatedCost / grandTotal) * 100) : 0,
      };
    })
    .sort((a, b) => b.estimatedCost - a.estimatedCost);
}

/**
 * Sessões de contagem física (seção 6) — derivadas de movimentações agrupadas por `reference`
 * (mesmo design de `stocktake.ts`: não existe uma tabela dedicada de "sessão de inventário", a
 * própria referência compartilhada já agrupa as linhas de uma mesma contagem). Para
 * `correcao_inventario` (recontagens via `/estoque/contagem`), `quantity` é o valor ABSOLUTO
 * recontado — a diferença real é `newBalance - previousBalance`, nunca `quantity` sozinho.
 */
export interface StocktakeSessionLine {
  itemId: string;
  itemName: string;
  previousBalance: number | null;
  countedQuantity: number;
  difference: number | null;
  notes: string | null;
}

export interface StocktakeSession {
  reference: string;
  type: MovementType;
  date: string;
  responsible: string | null;
  lines: StocktakeSessionLine[];
  totalPositiveDifference: number;
  totalNegativeDifference: number;
}

export function deriveStocktakeSessions(movements: StockMovement[], itemById: Map<string, Pick<InventoryItem, "name">>): StocktakeSession[] {
  const relevant = movements.filter((m) => (m.type === "correcao_inventario" || m.type === "contagem_fisica_inicial") && m.reference);
  const groups = new Map<string, StockMovement[]>();
  for (const m of relevant) {
    const key = m.reference as string;
    const list = groups.get(key) ?? [];
    list.push(m);
    groups.set(key, list);
  }

  const sessions: StocktakeSession[] = [];
  for (const [reference, list] of groups) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    const lines: StocktakeSessionLine[] = list.map((m) => {
      const difference = m.previousBalance !== null && m.newBalance !== null ? round2(m.newBalance - m.previousBalance) : null;
      return {
        itemId: m.itemId,
        itemName: itemById.get(m.itemId)?.name ?? "Produto não encontrado",
        previousBalance: m.previousBalance,
        countedQuantity: m.quantity,
        difference,
        notes: m.notes,
      };
    });
    sessions.push({
      reference,
      type: list[0].type,
      date: sorted[0].date,
      responsible: list.find((m) => m.responsible)?.responsible ?? null,
      lines,
      totalPositiveDifference: round2(lines.reduce((sum, l) => sum + (l.difference !== null && l.difference > 0 ? l.difference : 0), 0)),
      totalNegativeDifference: round2(lines.reduce((sum, l) => sum + (l.difference !== null && l.difference < 0 ? l.difference : 0), 0)),
    });
  }

  return sessions.sort((a, b) => b.date.localeCompare(a.date));
}

/** Ponto de evolução de saldo (seção 12) — construído diretamente de newBalance, sem recalcular nada (a movimentação já guarda o saldo real após cada evento). */
export interface BalanceEvolutionPoint {
  date: string;
  balance: number;
  type: MovementType;
}

export function buildBalanceEvolution(movements: StockMovement[]): BalanceEvolutionPoint[] {
  return [...movements]
    .filter((m) => m.newBalance !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((m) => ({ date: m.date, balance: m.newBalance as number, type: m.type }));
}

/** Histórico de preço (seção 12) — só as compras/entradas com preço realmente informado, nunca inventado. */
export interface PriceHistoryPoint {
  date: string;
  unitPrice: number;
  supplier: string | null;
}

export function buildPriceHistory(movements: StockMovement[]): PriceHistoryPoint[] {
  return [...movements]
    .filter((m) => ENTRADA_TYPES.includes(m.type) && m.unitPricePaid !== null && m.unitPricePaid !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ date: m.date, unitPrice: m.unitPricePaid as number, supplier: m.supplier ?? null }));
}

/** InventoryItemView re-exportado por conveniência dos consumidores deste módulo. */
export type { InventoryItemView };
