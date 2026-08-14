import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import type { StockMovement } from "@/lib/inventory/types";

/**
 * Referência única de uma sessão/posição de contagem. Movida para cá (Missão de Consolidação da
 * Contagem de Estoque V1) — antes vivia em `stocktake.ts`, que agora depende deste módulo para o
 * núcleo canônico (`registerPhysicalInventoryCount`); mantê-la lá criaria um import circular.
 * Reexportada por `stocktake.ts` para não quebrar quem já importa de lá (`page.tsx`).
 */
export function generateStocktakeReference(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `CONTAGEM-${today}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Missão de Consolidação da Contagem de Estoque V1 — esta é a ÚNICA função de domínio que
 * registra uma posição física confiável, usada tanto pela contagem rápida individual
 * (`QuickCountView`) quanto pela confirmação em lote (`confirmStocktake`/`StocktakeView`), que
 * antes chamava `repo.recordMovement` diretamente e nunca atualizava
 * `lastCountDate`/`quantityStatus` (gap relatado e agora fechado — ver relatório da missão).
 * Delega a `repo.recordPhysicalCount`, que registra o movimento `correcao_inventario` (tipo
 * ABSOLUTO — "substitui o saldo, não é delta") e atualiza `currentQuantity`/`lastCountDate`/
 * `quantityStatus='confirmed'` numa única transação (implementação real) — nunca duas escritas
 * separadas que poderiam divergir se uma falhasse entre as duas.
 */
export interface RegisterPhysicalInventoryCountInput {
  itemId: string;
  countedQuantity: number;
  /** ISO (YYYY-MM-DD). Nunca `new Date()` implícito — o chamador decide a data real da contagem. */
  countedAt: string;
  source: string;
  notes?: string | null;
  /**
   * Referência compartilhada de uma sessão de contagem em lote (mesma usada por
   * `deriveStocktakeSessions` para agrupar linhas). Null/omitido → gera uma referência própria
   * (caso de uso da contagem rápida individual, uma posição por vez).
   */
  reference?: string | null;
}

export interface RegisterPhysicalInventoryCountResult {
  itemId: string;
  previousBalance: number;
  countedQuantity: number;
  /** countedQuantity - previousBalance. Positivo = saldo subiu, negativo = saldo caiu. */
  difference: number;
  movement: StockMovement;
  lastCountDate: string;
  /** true quando esta foi a contagem que resolveu measurement_pending → confirmed pela primeira vez. */
  resolvedMeasurementPending: boolean;
}

/**
 * Registra UMA contagem física de UM produto — reconciliação de inventário, NUNCA consumo. A
 * diferença encontrada nunca vira "saída de consumo": é sempre um único movimento
 * `correcao_inventario` com a quantidade ABSOLUTA contada. Sempre registra a posição, mesmo
 * quando a contagem confirma o saldo já esperado (diferença 0) — uma contagem física continua
 * válida mesmo sem divergência (ela prova "em tal data, existiam X unidades", informação
 * necessária para `getLastTwoReliableCounts`/`analyzeConsumptionBetweenCounts` ancorarem uma
 * janela mesmo quando nada mudou desde a contagem anterior).
 */
export async function registerPhysicalInventoryCount(input: RegisterPhysicalInventoryCountInput): Promise<RegisterPhysicalInventoryCountResult> {
  const repo = getInventoryRepository();
  const item = await repo.getItem(input.itemId);
  if (!item) throw new Error(`Item de estoque não encontrado: ${input.itemId}`);

  const previousBalance = item.currentQuantity;
  const resolvedMeasurementPending = item.quantityStatus === "measurement_pending";

  const movement = await repo.recordPhysicalCount({
    itemId: input.itemId,
    countedQuantity: input.countedQuantity,
    date: input.countedAt,
    responsible: input.source,
    reference: input.reference ?? generateStocktakeReference(),
    notes: input.notes ?? null,
  });

  return {
    itemId: input.itemId,
    previousBalance,
    countedQuantity: input.countedQuantity,
    difference: Math.round((input.countedQuantity - previousBalance) * 1000) / 1000,
    movement,
    lastCountDate: input.countedAt,
    resolvedMeasurementPending,
  };
}

/** Uma posição física confiável — origem de `contagem_fisica_inicial` (a primeira, sempre) ou `correcao_inventario` (recontagens periódicas). */
export interface ReliableCountPosition {
  date: string;
  quantity: number;
  type: "contagem_fisica_inicial" | "correcao_inventario";
  reference: string | null;
}

const COUNT_TYPES = new Set(["contagem_fisica_inicial", "correcao_inventario"]);

/**
 * Núcleo puro (sem I/O, testável com fixtures) — recebe as movimentações já buscadas
 * (`repo.listMovements(itemId)`) e extrai as 2 posições físicas confiáveis mais recentes.
 * `previous` é `null` quando existe 0 ou 1 posição — nunca inventa uma segunda. Empate de data
 * resolvido pela ordem em que `listMovements` já devolve (nenhum critério adicional inventado —
 * `StockMovement` não expõe timestamp de criação na camada de repositório).
 */
export function pickLastTwoReliableCounts(movements: StockMovement[]): { latest: ReliableCountPosition | null; previous: ReliableCountPosition | null } {
  const positions = movements
    .filter((m): m is StockMovement & { type: "contagem_fisica_inicial" | "correcao_inventario" } => COUNT_TYPES.has(m.type))
    .map((m) => ({ date: m.date, quantity: m.newBalance ?? 0, type: m.type, reference: m.reference }))
    .sort((a, b) => b.date.localeCompare(a.date));

  return { latest: positions[0] ?? null, previous: positions[1] ?? null };
}

/**
 * Missão de UI Operacional de Contagem de Estoque V1, seção 7 — status visual derivado do
 * número de posições confiáveis (0/1/2+), nunca inventa periodicidade automática.
 */
export type ReliableCountStatus = "sem_contagem" | "uma_contagem" | "pronto_para_analise";

export function classifyReliableCountStatus(positions: { latest: ReliableCountPosition | null; previous: ReliableCountPosition | null }): ReliableCountStatus {
  if (!positions.latest) return "sem_contagem";
  if (!positions.previous) return "uma_contagem";
  return "pronto_para_analise";
}

/**
 * Núcleo puro — agrupa TODAS as movimentações (já buscadas de uma vez, ex.
 * `repo.listMovements()` sem itemId) por item e aplica `pickLastTwoReliableCounts` em cada
 * grupo. Evita N consultas separadas (uma por item) quando o chamador precisa do status de
 * vários/todos os produtos de uma vez (ex. a tela de contagem inteira).
 */
export function groupReliableCountsByItem(movements: StockMovement[]): Map<string, { latest: ReliableCountPosition | null; previous: ReliableCountPosition | null }> {
  const byItem = new Map<string, StockMovement[]>();
  for (const m of movements) {
    const list = byItem.get(m.itemId) ?? [];
    list.push(m);
    byItem.set(m.itemId, list);
  }
  const result = new Map<string, { latest: ReliableCountPosition | null; previous: ReliableCountPosition | null }>();
  for (const [itemId, itemMovements] of byItem) {
    result.set(itemId, pickLastTwoReliableCounts(itemMovements));
  }
  return result;
}

/** Casca de I/O — busca as movimentações reais do item e delega ao núcleo puro. Nunca uma segunda fonte de dado de estoque. */
export async function getLastTwoReliableCounts(itemId: string): Promise<{ latest: ReliableCountPosition | null; previous: ReliableCountPosition | null }> {
  const repo = getInventoryRepository();
  const movements = await repo.listMovements(itemId);
  return pickLastTwoReliableCounts(movements);
}
