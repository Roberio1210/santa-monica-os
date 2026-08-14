import "server-only";
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryMovements } from "@/db/schema";
import { ENTRADA_TYPES } from "@/lib/inventory/stockAnalytics";
import { addDaysIso } from "@/lib/utils/timezone";
import type { MovementType } from "@/lib/inventory/types";

/**
 * Missão de Wiring do Consumo Gerencial V1 — "estoque inicial/final confiável" via reconstrução
 * de ledger: toda `inventory_movements` já grava `new_balance` (saldo IMEDIATAMENTE após aquela
 * movimentação, "sempre calculado pelo repositório" — nunca informado pelo chamador, ver
 * `src/db/schema/inventory.ts`). Por isso o saldo confiável numa data qualquer é simplesmente o
 * `new_balance` da movimentação mais recente com `date <= asOfDate` — nunca soma por tipo (o que
 * exigiria decidir sinal de ajuste_positivo/ajuste_negativo/transferência/devolução, reabrindo
 * exatamente a ambiguidade que a missão pediu para nunca resolver sozinha). `null` quando não
 * existe nenhuma movimentação até aquela data — nunca inventa um saldo.
 */
function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export async function reconstructBalanceAsOf(itemId: string, asOfDate: string): Promise<number | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .select({ newBalance: inventoryMovements.newBalance, date: inventoryMovements.date })
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.itemId, itemId), lte(inventoryMovements.date, asOfDate)))
    .orderBy(desc(inventoryMovements.date), desc(inventoryMovements.createdAt))
    .limit(1);

  return row && row.newBalance !== null ? Number(row.newBalance) : null;
}

interface MinimalMovement {
  type: MovementType;
  quantity: number;
}

/**
 * Núcleo puro (sem I/O) — soma só ENTRADA_TYPES ("entrada"/"compra"). Nunca interpreta
 * ajuste/correção/transferência/devolução/saída como entrada (não estão em ENTRADA_TYPES,
 * seguindo a mesma lista já usada em `stockAnalytics.ts`, nunca uma segunda lista paralela).
 */
export function sumEntradasFromMovements(movements: MinimalMovement[]): number {
  return round(
    movements.filter((m) => ENTRADA_TYPES.includes(m.type)).reduce((sum, m) => sum + m.quantity, 0),
    3,
  );
}

/** Busca as movimentações reais do item no período [periodStart, periodEnd] (inclusive) e soma via `sumEntradasFromMovements`. */
async function fetchEntradasInPeriod(itemId: string, periodStart: string, periodEnd: string): Promise<number> {
  const db = getDb();
  if (!db) return 0;

  const rows = await db
    .select({ type: inventoryMovements.type, quantity: inventoryMovements.quantity })
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.itemId, itemId), inArray(inventoryMovements.type, ENTRADA_TYPES), gte(inventoryMovements.date, periodStart), lte(inventoryMovements.date, periodEnd)));

  return sumEntradasFromMovements(rows.map((r) => ({ type: r.type as MovementType, quantity: Number(r.quantity) })));
}

/**
 * Período efetivo = max(periodStart pedido, primeira evidência confiável do produto) — nunca
 * finge conhecer estoque antes da primeira evidência real (Missão, seção 9). Pura.
 */
export function computeEffectivePeriodStart(periodStart: string, effectiveDataStart: string | null): string {
  if (effectiveDataStart === null) return periodStart;
  return effectiveDataStart > periodStart ? effectiveDataStart : periodStart;
}

export interface ManagerialStockWindowResult {
  itemId: string;
  requestedPeriodStart: string;
  effectivePeriodStart: string;
  periodEnd: string;
  /** true quando o período efetivo teve que ser adiado em relação ao pedido (produto sem evidência real tão cedo). */
  periodAdjusted: boolean;
  openingQuantity: number | null;
  entradas: number;
  currentQuantity: number | null;
  /** Motivos legíveis de qualquer limitação encontrada — nunca omitido quando openingQuantity/currentQuantity é null. */
  reasons: string[];
}

/**
 * Casca de I/O — combina reconstrução de saldo (abertura e fechamento) + soma de entradas no
 * período efetivo. `effectiveDataStart` vem de `fetchProductConsumptionStartDates` (chamador
 * busca uma vez para todos os itens, nunca uma query por item aqui dentro).
 */
export async function getManagerialStockWindow(itemId: string, periodStart: string, periodEnd: string, effectiveDataStart: string | null): Promise<ManagerialStockWindowResult> {
  const effectivePeriodStart = computeEffectivePeriodStart(periodStart, effectiveDataStart);
  const periodAdjusted = effectivePeriodStart !== periodStart;
  const reasons: string[] = [];

  if (effectiveDataStart === null) {
    reasons.push("Produto sem qualquer evidência real de movimentação — nenhum estoque inicial confiável existe.");
  } else if (periodAdjusted) {
    reasons.push(`Período solicitado começava em ${periodStart}, mas a primeira evidência confiável do produto é ${effectiveDataStart} — período efetivo ajustado.`);
  }

  const dayBeforeStart = addDaysIso(effectivePeriodStart, -1);
  const [openingQuantity, currentQuantity, entradas] = await Promise.all([
    reconstructBalanceAsOf(itemId, dayBeforeStart),
    reconstructBalanceAsOf(itemId, periodEnd),
    fetchEntradasInPeriod(itemId, effectivePeriodStart, periodEnd),
  ]);

  if (openingQuantity === null) reasons.push(`Nenhuma movimentação real encontrada até ${dayBeforeStart} — estoque inicial não é reconstruível.`);
  if (currentQuantity === null) reasons.push(`Nenhuma movimentação real encontrada até ${periodEnd} — estoque final não é reconstruível.`);

  return { itemId, requestedPeriodStart: periodStart, effectivePeriodStart, periodEnd, periodAdjusted, openingQuantity, entradas, currentQuantity, reasons };
}
