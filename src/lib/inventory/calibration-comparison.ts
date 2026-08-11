import "server-only";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryConsumptionLines, inventoryMovements } from "@/db/schema";

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface PeriodComparison {
  itemId: string;
  periodFrom: string;
  periodTo: string;
  /** Soma de `expectedQuantity` das linhas de consumo confirmadas no período — null quando nenhuma linha do período tem receita aplicada (nada a comparar). */
  theoreticalConsumption: number | null;
  /** Soma de `confirmedQuantity` (real, já registrado) + divergência de contagem não capturada por nenhuma linha (quando negativa — estoque sumiu além do que foi registrado como consumo). */
  observedConsumption: number;
  differenceAbsolute: number | null;
  differencePercent: number | null;
}

/**
 * Núcleo puro da comparação (Missão de Automação JumpPark → Consumo, seção 10) — recebe os
 * totais já somados e só calcula a diferença. Nunca decide sozinho o que fazer com o desvio;
 * isso é sempre uma ação humana explícita (ver seção 10: "somente mediante confirmação humana").
 */
export function computePeriodComparison(itemId: string, periodFrom: string, periodTo: string, theoreticalConsumption: number | null, observedConsumption: number): PeriodComparison {
  if (theoreticalConsumption === null || theoreticalConsumption <= 0) {
    return { itemId, periodFrom, periodTo, theoreticalConsumption, observedConsumption: round(observedConsumption, 3), differenceAbsolute: null, differencePercent: null };
  }
  const differenceAbsolute = round(observedConsumption - theoreticalConsumption, 3);
  const differencePercent = round((differenceAbsolute / theoreticalConsumption) * 100, 1);
  return { itemId, periodFrom, periodTo, theoreticalConsumption: round(theoreticalConsumption, 3), observedConsumption: round(observedConsumption, 3), differenceAbsolute, differencePercent };
}

/**
 * LIMITAÇÃO DOCUMENTADA: usa uma janela fixa de dias antes da contagem (não "desde a contagem
 * anterior", que exigiria rastrear a contagem anterior por produto — deixado para uma iteração
 * futura). `theoreticalConsumption` soma só linhas com receita aplicada (`expectedQuantity` não
 * nulo); `observedConsumption` soma o que foi de fato baixado (`confirmedQuantity`) mais, quando
 * a própria contagem revelou uma divergência negativa para este produto na data informada, a
 * parte dessa divergência que nenhuma linha de consumo já capturou — nunca inventado, sempre
 * derivado de `inventory_movements`/`inventory_consumption_lines` reais.
 */
export async function fetchPeriodComparison(itemId: string, stocktakeDate: string, windowDays: number = 30): Promise<PeriodComparison | null> {
  const db = getDb();
  if (!db) return null;

  const from = new Date(stocktakeDate);
  from.setDate(from.getDate() - windowDays);
  const periodFrom = from.toISOString().slice(0, 10);

  const rows = await db
    .select({
      expectedQuantity: inventoryConsumptionLines.expectedQuantity,
      confirmedQuantity: inventoryConsumptionLines.confirmedQuantity,
      date: inventoryMovements.date,
    })
    .from(inventoryConsumptionLines)
    .innerJoin(inventoryMovements, eq(inventoryConsumptionLines.movementId, inventoryMovements.id))
    .where(and(eq(inventoryConsumptionLines.itemId, itemId), gte(inventoryMovements.date, periodFrom), lte(inventoryMovements.date, stocktakeDate)));

  let theoreticalSum = 0;
  let hasTheoretical = false;
  let recordedSum = 0;
  for (const row of rows) {
    recordedSum += Number(row.confirmedQuantity);
    if (row.expectedQuantity !== null) {
      theoreticalSum += Number(row.expectedQuantity);
      hasTheoretical = true;
    }
  }

  const [correction] = await db
    .select({ previousBalance: inventoryMovements.previousBalance, newBalance: inventoryMovements.newBalance })
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.itemId, itemId), eq(inventoryMovements.type, "correcao_inventario"), eq(inventoryMovements.date, stocktakeDate)))
    .orderBy(desc(inventoryMovements.createdAt))
    .limit(1);

  let unrecordedShortfall = 0;
  if (correction && correction.previousBalance !== null && correction.newBalance !== null) {
    const diff = Number(correction.newBalance) - Number(correction.previousBalance);
    if (diff < 0) unrecordedShortfall = Math.abs(diff);
  }

  return computePeriodComparison(itemId, periodFrom, stocktakeDate, hasTheoretical ? theoreticalSum : null, recordedSum + unrecordedShortfall);
}

/** Limiar de desvio (seção 11) — abaixo disso, variação é considerada normal/ruído de medição, nunca alertada. */
export const WASTE_ALERT_THRESHOLD_PERCENT = 20;
/** Mínimo de períodos consecutivos com desvio antes de classificar como tendência (seção 11 — "nunca acusar desperdício com uma única ocorrência"). */
export const WASTE_ALERT_MIN_PERIODS = 2;

/**
 * Alerta de desperdício só dispara com desvio persistente em pelo menos `WASTE_ALERT_MIN_PERIODS`
 * comparações consecutivas mais recentes — nunca numa única contagem isolada. `comparisons` deve
 * vir em ordem cronológica (mais antiga primeiro); esta função sempre olha para o final da lista.
 */
export function detectPersistentDeviation(comparisons: PeriodComparison[], thresholdPercent: number = WASTE_ALERT_THRESHOLD_PERCENT, minPeriods: number = WASTE_ALERT_MIN_PERIODS): boolean {
  if (comparisons.length < minPeriods) return false;
  const recent = comparisons.slice(-minPeriods);
  return recent.every((c) => c.differencePercent !== null && c.differencePercent > thresholdPercent);
}
