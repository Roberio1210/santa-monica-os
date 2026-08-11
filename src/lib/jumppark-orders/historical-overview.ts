import "server-only";
import { and, countDistinct, eq, gte, inArray, lte, sum } from "drizzle-orm";
import { getDb } from "@/db/client";
import { historicalTheoreticalConsumption, inventoryMovements, services } from "@/db/schema";
import { ENTRADA_TYPES } from "@/lib/inventory/stockAnalytics";
import { computeTheoreticalStockLevel, type TheoreticalStockLevel } from "@/lib/inventory/theoretical-stock";
import { deriveStocktakeSessions, type StocktakeSession } from "@/lib/inventory/stockAnalytics";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import type { PeriodRange } from "@/lib/utils/timezone";

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface ServiceRealizedCount {
  serviceName: string;
  count: number;
}

export interface ProductTheoreticalConsumption {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  cost: number | null;
  costIncomplete: boolean;
}

export interface ProductRealPurchase {
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
}

export interface HistoricalTheoreticalOverview {
  period: PeriodRange;
  servicesRealized: ServiceRealizedCount[];
  totalOrdersWithTheoreticalData: number;
  consumptionByProduct: ProductTheoreticalConsumption[];
  purchasesByProduct: ProductRealPurchase[];
  theoreticalStockByProduct: (TheoreticalStockLevel & { itemName: string })[];
  stocktakeSessionsInPeriod: StocktakeSession[];
}

/**
 * Visão consolidada do histórico teórico (Missão de Histórico Retroativo, seção 10) — tudo
 * calculado ao vivo a partir de `historical_theoretical_consumption` (nunca confundido com
 * consumo real) + movimentações reais de compra + contagens físicas já existentes.
 */
export async function fetchHistoricalTheoreticalOverview(period: PeriodRange): Promise<HistoricalTheoreticalOverview> {
  const db = getDb();
  if (!db) {
    return { period, servicesRealized: [], totalOrdersWithTheoreticalData: 0, consumptionByProduct: [], purchasesByProduct: [], theoreticalStockByProduct: [], stocktakeSessionsInPeriod: [] };
  }

  const [serviceCountRows, consumptionRows, purchaseRows, items, allMovements] = await Promise.all([
    db
      .select({ serviceName: services.name, count: countDistinct(historicalTheoreticalConsumption.jumpparkOrderExternalId) })
      .from(historicalTheoreticalConsumption)
      .innerJoin(services, eq(services.id, historicalTheoreticalConsumption.serviceId))
      .where(and(gte(historicalTheoreticalConsumption.orderDate, period.from), lte(historicalTheoreticalConsumption.orderDate, period.to)))
      .groupBy(services.name),
    db
      .select({ itemId: historicalTheoreticalConsumption.itemId, quantity: sum(historicalTheoreticalConsumption.theoreticalQuantity), cost: sum(historicalTheoreticalConsumption.theoreticalCost) })
      .from(historicalTheoreticalConsumption)
      .where(and(gte(historicalTheoreticalConsumption.orderDate, period.from), lte(historicalTheoreticalConsumption.orderDate, period.to)))
      .groupBy(historicalTheoreticalConsumption.itemId),
    db
      .select({ itemId: inventoryMovements.itemId, quantity: sum(inventoryMovements.quantity) })
      .from(inventoryMovements)
      .where(and(inArray(inventoryMovements.type, ENTRADA_TYPES), gte(inventoryMovements.date, period.from), lte(inventoryMovements.date, period.to)))
      .groupBy(inventoryMovements.itemId),
    getInventoryRepository().listItems(),
    getInventoryRepository().listMovements(),
  ]);

  const itemById = new Map(items.map((i) => [i.id, i]));

  const consumptionByProduct: ProductTheoreticalConsumption[] = consumptionRows.map((r) => {
    const item = itemById.get(r.itemId);
    return {
      itemId: r.itemId,
      itemName: item?.name ?? "Produto não encontrado",
      unit: item?.unit ?? "ml",
      quantity: round(Number(r.quantity ?? 0), 3),
      cost: r.cost !== null ? round(Number(r.cost), 2) : null,
      costIncomplete: r.cost === null,
    };
  });

  const purchasesByProduct: ProductRealPurchase[] = purchaseRows.map((r) => {
    const item = itemById.get(r.itemId as string);
    return { itemId: r.itemId as string, itemName: item?.name ?? "Produto não encontrado", unit: item?.unit ?? "ml", quantity: round(Number(r.quantity ?? 0), 3) };
  });

  const configuredItemIds = new Set(consumptionByProduct.map((c) => c.itemId));
  const theoreticalStockByProduct = await Promise.all(
    Array.from(configuredItemIds).map(async (itemId) => {
      const level = await computeTheoreticalStockLevel(itemId, period.to);
      return { ...level, itemName: itemById.get(itemId)?.name ?? "Produto não encontrado" };
    }),
  );

  const allSessions = deriveStocktakeSessions(allMovements, itemById);
  const stocktakeSessionsInPeriod = allSessions.filter((s) => s.date >= period.from && s.date <= period.to);

  const [{ total }] = await db
    .select({ total: countDistinct(historicalTheoreticalConsumption.jumpparkOrderExternalId) })
    .from(historicalTheoreticalConsumption)
    .where(and(gte(historicalTheoreticalConsumption.orderDate, period.from), lte(historicalTheoreticalConsumption.orderDate, period.to)));

  return {
    period,
    servicesRealized: serviceCountRows.map((r) => ({ serviceName: r.serviceName, count: Number(r.count) })).sort((a, b) => b.count - a.count),
    totalOrdersWithTheoreticalData: Number(total ?? 0),
    consumptionByProduct: consumptionByProduct.sort((a, b) => a.itemName.localeCompare(b.itemName, "pt-BR")),
    purchasesByProduct: purchasesByProduct.sort((a, b) => a.itemName.localeCompare(b.itemName, "pt-BR")),
    theoreticalStockByProduct: theoreticalStockByProduct.sort((a, b) => a.itemName.localeCompare(b.itemName, "pt-BR")),
    stocktakeSessionsInPeriod,
  };
}
