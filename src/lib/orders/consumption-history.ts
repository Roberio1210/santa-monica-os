import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryConsumptionConfirmations, inventoryConsumptionLines, inventoryItems } from "@/db/schema";
import type { ConsumptionConfirmationStatus, OrderVehicleCategory } from "@/lib/orders/types";
import type { ProcessStep } from "@/lib/recipes/types";
import type { InventoryUnit } from "@/lib/inventory/types";

export interface ConsumptionLineView {
  id: string;
  itemId: string;
  itemName: string;
  recipeId: string | null;
  processStep: ProcessStep | null;
  expectedQuantity: number | null;
  confirmedQuantity: number;
  difference: number | null;
  unit: InventoryUnit;
  previousBalance: number;
  newBalance: number;
  isExtra: boolean;
  lineJustification: string | null;
  knownCost: number | null;
}

export interface ConsumptionConfirmationView {
  id: string;
  jumpparkOrderExternalId: string;
  version: number;
  vehicleCategory: OrderVehicleCategory;
  status: ConsumptionConfirmationStatus;
  responsibleName: string;
  justification: string | null;
  confirmedAt: string;
  reversedAt: string | null;
  reversedBy: string | null;
  reversalReason: string | null;
  lines: ConsumptionLineView[];
}

async function attachLines(db: NonNullable<ReturnType<typeof getDb>>, confirmations: (typeof inventoryConsumptionConfirmations.$inferSelect)[]): Promise<ConsumptionConfirmationView[]> {
  const items = await db.select().from(inventoryItems);
  const itemMap = new Map(items.map((i) => [i.id, { name: i.name, unitCost: i.unitCost !== null ? Number(i.unitCost) : null }]));

  const result: ConsumptionConfirmationView[] = [];
  for (const c of confirmations) {
    const lineRows = await db.select().from(inventoryConsumptionLines).where(eq(inventoryConsumptionLines.confirmationId, c.id));
    const lines: ConsumptionLineView[] = lineRows.map((l) => {
      const expected = l.expectedQuantity !== null ? Number(l.expectedQuantity) : null;
      const confirmed = Number(l.confirmedQuantity);
      const item = itemMap.get(l.itemId);
      return {
        id: l.id,
        itemId: l.itemId,
        itemName: item?.name ?? "Produto não encontrado",
        recipeId: l.recipeId,
        processStep: l.processStep as ProcessStep | null,
        expectedQuantity: expected,
        confirmedQuantity: confirmed,
        difference: expected !== null ? Math.round((confirmed - expected) * 1000) / 1000 : null,
        unit: l.unit as InventoryUnit,
        previousBalance: Number(l.previousBalance),
        newBalance: Number(l.newBalance),
        isExtra: l.isExtra,
        lineJustification: l.lineJustification,
        knownCost: item?.unitCost !== null && item?.unitCost !== undefined ? Math.round(item.unitCost * confirmed * 100) / 100 : null,
      };
    });

    result.push({
      id: c.id,
      jumpparkOrderExternalId: c.jumpparkOrderExternalId,
      version: c.version,
      vehicleCategory: c.vehicleCategory as OrderVehicleCategory,
      status: c.status as ConsumptionConfirmationStatus,
      responsibleName: c.responsibleName,
      justification: c.justification,
      confirmedAt: c.confirmedAt.toISOString(),
      reversedAt: c.reversedAt ? c.reversedAt.toISOString() : null,
      reversedBy: c.reversedBy,
      reversalReason: c.reversalReason,
      lines,
    });
  }
  return result;
}

/** Honesto: sem Postgres configurado, retorna vazio — nunca inventa histórico. */
export async function listConsumptionConfirmations(): Promise<ConsumptionConfirmationView[]> {
  const db = getDb();
  if (!db) return [];
  const confirmations = await db.select().from(inventoryConsumptionConfirmations).where(eq(inventoryConsumptionConfirmations.active, true)).orderBy(desc(inventoryConsumptionConfirmations.confirmedAt));
  return attachLines(db, confirmations);
}

export async function fetchConsumptionConfirmationsForOrder(externalId: string): Promise<ConsumptionConfirmationView[]> {
  const db = getDb();
  if (!db) return [];
  const confirmations = await db
    .select()
    .from(inventoryConsumptionConfirmations)
    .where(eq(inventoryConsumptionConfirmations.jumpparkOrderExternalId, externalId))
    .orderBy(desc(inventoryConsumptionConfirmations.version));
  return attachLines(db, confirmations);
}
