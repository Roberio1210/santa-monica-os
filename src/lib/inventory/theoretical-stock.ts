import "server-only";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { getDb } from "@/db/client";
import { historicalTheoreticalConsumption, inventoryItems, inventoryMovements } from "@/db/schema";
import { ENTRADA_TYPES } from "@/lib/inventory/stockAnalytics";
import type { InventoryUnit } from "@/lib/inventory/types";

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface TheoreticalStockLevel {
  itemId: string;
  unit: InventoryUnit;
  /** false quando não há uma contagem física inicial confiável para ancorar o cálculo — ver seção 12 da missão: nunca afirmar saldo teórico sem uma base real. */
  reliable: boolean;
  reason: string;
  baselineDate: string | null;
  baselineQuantity: number | null;
  realPurchasesInPeriod: number;
  theoreticalConsumptionInPeriod: number;
  /** null quando `reliable` é false. */
  theoreticalStock: number | null;
}

/**
 * ESTOQUE TEÓRICO = saldo da contagem física inicial (o "marco de contagem/estoque base" real —
 * `contagem_fisica_inicial`, que já existe no livro-razão de cada produto) + compras reais no
 * período − consumo teórico histórico no período. NUNCA sobrescreve nem é confundido com
 * `inventory_items.current_quantity` (o saldo físico real, sempre autoritativo). Missão de
 * Histórico Retroativo, seções 6/7/12.
 */
export async function computeTheoreticalStockLevel(itemId: string, asOfDate: string): Promise<TheoreticalStockLevel> {
  const db = getDb();
  const [item] = db ? await db.select({ unit: inventoryItems.unit }).from(inventoryItems).where(eq(inventoryItems.id, itemId)).limit(1) : [];
  const unit = (item?.unit as InventoryUnit) ?? "ml";

  if (!db) {
    return { itemId, unit, reliable: false, reason: "Banco não configurado.", baselineDate: null, baselineQuantity: null, realPurchasesInPeriod: 0, theoreticalConsumptionInPeriod: 0, theoreticalStock: null };
  }

  const [baseline] = await db
    .select({ date: inventoryMovements.date, newBalance: inventoryMovements.newBalance })
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.itemId, itemId), eq(inventoryMovements.type, "contagem_fisica_inicial")))
    .orderBy(inventoryMovements.date)
    .limit(1);

  if (!baseline || baseline.newBalance === null) {
    return {
      itemId,
      unit,
      reliable: false,
      reason: "Estoque teórico baseado em compras registradas e consumo estimado — sem uma contagem física inicial confiável para ancorar um saldo real.",
      baselineDate: null,
      baselineQuantity: null,
      realPurchasesInPeriod: 0,
      theoreticalConsumptionInPeriod: 0,
      theoreticalStock: null,
    };
  }

  const baselineDate = baseline.date;
  if (asOfDate < baselineDate) {
    return {
      itemId,
      unit,
      reliable: false,
      reason: `Data solicitada (${asOfDate}) é anterior à contagem física inicial (${baselineDate}) — nada a calcular antes do marco.`,
      baselineDate,
      baselineQuantity: Number(baseline.newBalance),
      realPurchasesInPeriod: 0,
      theoreticalConsumptionInPeriod: 0,
      theoreticalStock: null,
    };
  }

  const purchaseRows = await db
    .select({ quantity: inventoryMovements.quantity })
    .from(inventoryMovements)
    .where(and(eq(inventoryMovements.itemId, itemId), inArray(inventoryMovements.type, ENTRADA_TYPES), gte(inventoryMovements.date, baselineDate), lte(inventoryMovements.date, asOfDate)));
  const realPurchasesInPeriod = round(purchaseRows.reduce((sum, r) => sum + Number(r.quantity), 0), 3);

  const consumptionRows = await db
    .select({ quantity: historicalTheoreticalConsumption.theoreticalQuantity })
    .from(historicalTheoreticalConsumption)
    .where(and(eq(historicalTheoreticalConsumption.itemId, itemId), gte(historicalTheoreticalConsumption.orderDate, baselineDate), lte(historicalTheoreticalConsumption.orderDate, asOfDate)));
  const theoreticalConsumptionInPeriod = round(consumptionRows.reduce((sum, r) => sum + Number(r.quantity), 0), 3);

  const baselineQuantity = Number(baseline.newBalance);
  const theoreticalStock = round(baselineQuantity + realPurchasesInPeriod - theoreticalConsumptionInPeriod, 3);

  return {
    itemId,
    unit,
    reliable: true,
    reason: `Contagem física inicial de ${baselineDate} usada como marco.`,
    baselineDate,
    baselineQuantity,
    realPurchasesInPeriod,
    theoreticalConsumptionInPeriod,
    theoreticalStock,
  };
}

export interface TheoreticalVsPhysicalStockComparison {
  itemId: string;
  stocktakeDate: string;
  theoretical: TheoreticalStockLevel;
  physicalCount: number;
  differenceAbsolute: number | null;
  differencePercent: number | null;
  differenceCost: number | null;
}

/**
 * Compara o ESTOQUE TEÓRICO (na data de uma contagem física real já confirmada) com o valor
 * efetivamente contado — nunca ajusta nada sozinho, só mostra a diferença (seção 8/9 da missão).
 */
export async function compareTheoreticalStockToPhysicalCount(itemId: string, stocktakeDate: string, physicalCount: number, unitCost: number | null): Promise<TheoreticalVsPhysicalStockComparison> {
  const theoretical = await computeTheoreticalStockLevel(itemId, stocktakeDate);
  if (!theoretical.reliable || theoretical.theoreticalStock === null) {
    return { itemId, stocktakeDate, theoretical, physicalCount, differenceAbsolute: null, differencePercent: null, differenceCost: null };
  }

  const differenceAbsolute = round(physicalCount - theoretical.theoreticalStock, 3);
  const differencePercent = theoretical.theoreticalStock !== 0 ? round((differenceAbsolute / theoretical.theoreticalStock) * 100, 1) : null;
  const differenceCost = unitCost !== null ? round(differenceAbsolute * unitCost, 2) : null;

  return { itemId, stocktakeDate, theoretical, physicalCount, differenceAbsolute, differencePercent, differenceCost };
}
