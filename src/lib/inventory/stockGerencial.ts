import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { getStorageMode } from "@/lib/storage/mode";
import { toItemView } from "@/lib/inventory/status";
import { computeTotalStockValue, isStaleItem, STALE_MOVEMENT_THRESHOLD_DAYS } from "@/lib/inventory/dashboard-metrics";
import { fetchAuditSummary, type AuditSummary } from "@/lib/inventory/audit-service";
import { fetchPurchaseSuggestions, type PurchaseSuggestion } from "@/lib/inventory/purchase-suggestions";
import { listConsumptionConfirmations } from "@/lib/jumppark-orders/consumption-history";
import {
  aggregateReductionsByCategory,
  aggregateReductionsByProduct,
  buildBalanceEvolution,
  buildPositionRow,
  buildPriceHistory,
  classifyStaleBucket,
  computeTurnoverRanking,
  CONSUMO_OPERACIONAL_TYPES,
  deriveStocktakeSessions,
  ENTRADA_TYPES,
  PERDA_TYPES,
  type BalanceEvolutionPoint,
  type CategoryReductionStats,
  type PositionRow,
  type PriceHistoryPoint,
  type ReductionStats,
  type StaleBucket,
  type StocktakeSession,
  type TurnoverRow,
} from "@/lib/inventory/stockAnalytics";
import type { InventoryItem, InventoryItemView, StockMovement } from "@/lib/inventory/types";
import { comparePeriodValues, previousPeriodOf, saoPauloDateISO, type PeriodComparison, type PeriodRange } from "@/lib/utils/timezone";

/**
 * Missão 34 (módulo gerencial de Estoque) — único ponto de I/O. Reaproveita, sem duplicar:
 * `getInventoryRepository()` (mesmo estoque de sempre), `fetchAuditSummary()` (qualidade de
 * dados + duplicidades + índice de saúde, Missão 23), `fetchPurchaseSuggestions()` (reposição,
 * Fase C/Missão 25 — não reimplementado aqui), `listConsumptionConfirmations()` (consumo real por
 * serviço, JumpPark).
 *
 * Fonte de verdade única: `inventory_movements` — cada KPI documenta exatamente quais tipos de
 * movimentação entram nele, para nunca contar a mesma redução de saldo em duas categorias.
 */

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function filterByPeriod(movements: StockMovement[], from: string, to: string): StockMovement[] {
  return movements.filter((m) => m.date >= from && m.date <= to);
}

export interface StockOverview {
  productCount: number;
  productsWithBalance: number;
  productsZeroed: number;
  productsBelowMinimum: number;
  totalStockValue: { knownValue: number; itemsWithoutCost: number };
  entriesCount: number;
  entriesQuantity: number;
  exitsCount: number;
  exitsQuantity: number;
  lossesCount: number;
  lossesQuantity: number;
  adjustmentsCount: number;
  productsWithoutAnyMovement: number;
}

export interface StockOverviewComparison {
  entriesCount: PeriodComparison;
  exitsCount: PeriodComparison;
  lossesCount: PeriodComparison;
  movedValue: PeriodComparison;
}

export interface StaleGroup {
  bucket: Exclude<StaleBucket, null>;
  items: PositionRow[];
}

export interface StockGerencialResult {
  storageMode: "postgres" | "memory";
  period: PeriodRange;
  previousPeriod: { from: string; to: string };
  overview: StockOverview;
  comparison: StockOverviewComparison;
  position: PositionRow[];
  movements: (StockMovement & { itemName: string; itemCategory: string })[];
  turnoverTop: TurnoverRow[];
  turnoverBottom: TurnoverRow[];
  noTurnover: TurnoverRow[];
  staleGroups: StaleGroup[];
  consumptionByProduct: ReductionStats[];
  consumptionByCategory: CategoryReductionStats[];
  lossesByProduct: ReductionStats[];
  lossesByCategory: CategoryReductionStats[];
  purchaseSuggestions: PurchaseSuggestion[];
  stocktakeSessions: StocktakeSession[];
  dataQuality: AuditSummary;
  hasAnyMovement: boolean;
}

export async function fetchStockGerencial(period: PeriodRange): Promise<StockGerencialResult> {
  const storageMode = getStorageMode();
  const today = saoPauloDateISO();
  const previous = previousPeriodOf(period);
  const referenceDate = new Date(`${today}T00:00:00Z`);

  const [rawItems, allMovements, dataQuality] = await Promise.all([
    getInventoryRepository().listItems(),
    getInventoryRepository().listMovements(),
    fetchAuditSummary(),
  ]);

  const items = rawItems.map(toItemView);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const movementsByItem = new Map<string, StockMovement[]>();
  for (const m of allMovements) {
    const list = movementsByItem.get(m.itemId) ?? [];
    list.push(m);
    movementsByItem.set(m.itemId, list);
  }

  const currentMovements = filterByPeriod(allMovements, period.from, period.to);
  const previousMovements = filterByPeriod(allMovements, previous.from, previous.to);

  const entriesCurrent = currentMovements.filter((m) => ENTRADA_TYPES.includes(m.type));
  const exitsCurrent = currentMovements.filter((m) => CONSUMO_OPERACIONAL_TYPES.includes(m.type));
  const lossesCurrent = currentMovements.filter((m) => PERDA_TYPES.includes(m.type));
  const adjustmentsCurrent = currentMovements.filter((m) => m.type === "ajuste_positivo" || m.type === "ajuste_negativo" || m.type === "ajuste_inventario" || m.type === "correcao_inventario");

  const entriesPrevious = previousMovements.filter((m) => ENTRADA_TYPES.includes(m.type));
  const exitsPrevious = previousMovements.filter((m) => CONSUMO_OPERACIONAL_TYPES.includes(m.type));
  const lossesPrevious = previousMovements.filter((m) => PERDA_TYPES.includes(m.type));

  function movedValue(list: StockMovement[]): number {
    return round2(
      list.reduce((sum, m) => {
        const cost = itemById.get(m.itemId)?.unitCost;
        return sum + (cost !== null && cost !== undefined ? m.quantity * cost : 0);
      }, 0),
    );
  }

  const totalStockValue = computeTotalStockValue(items);

  const overview: StockOverview = {
    productCount: items.length,
    productsWithBalance: items.filter((i) => i.currentQuantity > 0).length,
    productsZeroed: items.filter((i) => i.currentQuantity === 0).length,
    productsBelowMinimum: items.filter((i) => i.status === "comprar").length,
    totalStockValue,
    entriesCount: entriesCurrent.length,
    entriesQuantity: round2(entriesCurrent.reduce((s, m) => s + m.quantity, 0)),
    exitsCount: exitsCurrent.length,
    exitsQuantity: round2(exitsCurrent.reduce((s, m) => s + m.quantity, 0)),
    lossesCount: lossesCurrent.length,
    lossesQuantity: round2(lossesCurrent.reduce((s, m) => s + m.quantity, 0)),
    adjustmentsCount: adjustmentsCurrent.length,
    productsWithoutAnyMovement: items.filter((i) => (movementsByItem.get(i.id) ?? []).length === 0).length,
  };

  const comparison: StockOverviewComparison = {
    entriesCount: comparePeriodValues(entriesCurrent.length, entriesPrevious.length),
    exitsCount: comparePeriodValues(exitsCurrent.length, exitsPrevious.length),
    lossesCount: comparePeriodValues(lossesCurrent.length, lossesPrevious.length),
    movedValue: comparePeriodValues(movedValue([...entriesCurrent, ...exitsCurrent, ...lossesCurrent]), movedValue([...entriesPrevious, ...exitsPrevious, ...lossesPrevious])),
  };

  const position = items.map((item) => buildPositionRow(item, movementsByItem.get(item.id) ?? [], referenceDate));

  const movements = [...allMovements]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .map((m) => ({ ...m, itemName: itemById.get(m.itemId)?.name ?? "Produto não encontrado", itemCategory: itemById.get(m.itemId)?.category ?? "" }));

  const turnover = computeTurnoverRanking(items, movementsByItem).sort((a, b) => b.reductionQuantity - a.reductionQuantity);
  const withTurnover = turnover.filter((t) => t.reductionCount > 0);
  const noTurnover = turnover.filter((t) => t.reductionCount === 0);

  const staleByBucket = new Map<Exclude<StaleBucket, null>, PositionRow[]>([
    ["30_dias", []],
    ["60_dias", []],
    ["90_dias", []],
    ["180_dias", []],
  ]);
  for (const row of position) {
    const bucket = classifyStaleBucket(row.daysSinceLastMovement);
    if (bucket) staleByBucket.get(bucket)?.push(row);
  }
  const staleGroups: StaleGroup[] = Array.from(staleByBucket.entries()).map(([bucket, groupItems]) => ({ bucket, items: groupItems }));

  const consumptionMovements = currentMovements.filter((m) => CONSUMO_OPERACIONAL_TYPES.includes(m.type));
  const lossMovements = currentMovements.filter((m) => PERDA_TYPES.includes(m.type));
  const consumptionByProduct = aggregateReductionsByProduct(consumptionMovements, itemById);
  const lossesByProduct = aggregateReductionsByProduct(lossMovements, itemById);

  const purchaseSuggestions = await fetchPurchaseSuggestions();

  const stocktakeSessions = deriveStocktakeSessions(allMovements, itemById);

  return {
    storageMode,
    period,
    previousPeriod: previous,
    overview,
    comparison,
    position,
    movements,
    turnoverTop: withTurnover.slice(0, 10),
    turnoverBottom: withTurnover.slice(-10).reverse(),
    noTurnover,
    staleGroups,
    consumptionByProduct,
    consumptionByCategory: aggregateReductionsByCategory(consumptionByProduct),
    lossesByProduct,
    lossesByCategory: aggregateReductionsByCategory(lossesByProduct),
    purchaseSuggestions,
    stocktakeSessions,
    dataQuality,
    hasAnyMovement: allMovements.length > 0,
  };
}

export interface ProductStockDetailResult {
  found: true;
  item: InventoryItemView;
  movements: StockMovement[];
  priceHistory: PriceHistoryPoint[];
  balanceEvolution: BalanceEvolutionPoint[];
  consumptionByPeriod: ReductionStats | null;
  lossesByPeriod: ReductionStats | null;
  turnover: TurnoverRow;
  staleBucket: StaleBucket;
  purchaseSuggestion: PurchaseSuggestion | null;
  stocktakeSessions: StocktakeSession[];
}

export async function fetchProductStockDetail(itemId: string, period: PeriodRange): Promise<ProductStockDetailResult | { found: false }> {
  const repo = getInventoryRepository();
  const rawItem = await repo.getItem(itemId);
  if (!rawItem) return { found: false };

  const item = toItemView(rawItem);
  const allMovements = (await repo.listMovements(itemId)).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const today = saoPauloDateISO();
  const referenceDate = new Date(`${today}T00:00:00Z`);

  const positionRow = buildPositionRow(rawItem as InventoryItem, allMovements, referenceDate);
  const currentPeriodMovements = filterByPeriod(allMovements, period.from, period.to);

  const itemForAggregation = new Map([[item.id, { id: item.id, name: item.name, category: item.category, unit: item.unit, unitCost: item.unitCost }]]);
  const consumptionMovements = currentPeriodMovements.filter((m) => CONSUMO_OPERACIONAL_TYPES.includes(m.type));
  const lossMovements = currentPeriodMovements.filter((m) => PERDA_TYPES.includes(m.type));

  const suggestions = await fetchPurchaseSuggestions();
  const purchaseSuggestion = suggestions.find((s) => s.item.id === itemId) ?? null;

  return {
    found: true,
    item,
    movements: [...allMovements].reverse(),
    priceHistory: buildPriceHistory(allMovements),
    balanceEvolution: buildBalanceEvolution(allMovements),
    consumptionByPeriod: aggregateReductionsByProduct(consumptionMovements, itemForAggregation)[0] ?? null,
    lossesByPeriod: aggregateReductionsByProduct(lossMovements, itemForAggregation)[0] ?? null,
    turnover: computeTurnoverRanking([item], new Map([[item.id, allMovements]]))[0],
    staleBucket: classifyStaleBucket(positionRow.daysSinceLastMovement),
    purchaseSuggestion,
    stocktakeSessions: deriveStocktakeSessions(allMovements, new Map([[item.id, item]])),
  };
}

export interface ConsumoServicosStatus {
  hasReliableData: boolean;
  confirmationCount: number;
  lineCount: number;
  extraLineCount: number;
  explanation: string;
}

/**
 * Seção 15 — audita honestamente se existe informação confiável de consumo real por serviço.
 * Nunca infere consumo por serviço a partir de receita/proximidade — só conta confirmações REAIS
 * já gravadas (`inventory_consumption_confirmations`/`lines`, JumpPark). Limiar de "confiável"
 * (`MIN_CONFIRMATIONS_FOR_ANALYTICS`) documentado: menos que isso, qualquer ranking/participação
 * calculado em cima seria estatisticamente enganoso — a tela deve dizer isso explicitamente em vez
 * de mostrar um gráfico vazio como se fosse "zero consumo".
 */
const MIN_CONFIRMATIONS_FOR_ANALYTICS = 5;

export async function fetchConsumoServicosStatus(): Promise<ConsumoServicosStatus> {
  const confirmations = await listConsumptionConfirmations();
  const activeConfirmations = confirmations.filter((c) => c.status !== "estornada");
  const lineCount = activeConfirmations.reduce((sum, c) => sum + c.lines.length, 0);
  const extraLineCount = activeConfirmations.reduce((sum, c) => sum + c.lines.filter((l) => l.isExtra).length, 0);

  if (activeConfirmations.length === 0) {
    return {
      hasReliableData: false,
      confirmationCount: 0,
      lineCount: 0,
      extraLineCount: 0,
      explanation:
        "Nenhuma confirmação de consumo por serviço foi registrada ainda (o mecanismo existe e é usado a partir de /estoque/ordens, mas nenhuma ordem da JumpPark foi confirmada até agora). Sem isso, não é possível calcular quanto produto cada serviço realmente consome — nenhum valor foi estimado a partir da receita configurada, para nunca confundir 'consumo teórico planejado' com 'consumo real medido'.",
    };
  }

  if (activeConfirmations.length < MIN_CONFIRMATIONS_FOR_ANALYTICS) {
    return {
      hasReliableData: false,
      confirmationCount: activeConfirmations.length,
      lineCount,
      extraLineCount,
      explanation: `Existem ${activeConfirmations.length} confirmação(ões) de consumo real, abaixo do mínimo de ${MIN_CONFIRMATIONS_FOR_ANALYTICS} adotado para considerar um ranking/participação percentual estatisticamente confiável. Os registros existem e podem ser conferidos em /estoque/consumos, mas nenhuma análise agregada é mostrada aqui para não sugerir um padrão que ainda não está comprovado.`,
    };
  }

  return {
    hasReliableData: true,
    confirmationCount: activeConfirmations.length,
    lineCount,
    extraLineCount,
    explanation: `${activeConfirmations.length} confirmação(ões) de consumo real por serviço, ${lineCount} linha(s) de produto consumido (${extraLineCount} fora de qualquer receita configurada).`,
  };
}

export { STALE_MOVEMENT_THRESHOLD_DAYS, isStaleItem };
