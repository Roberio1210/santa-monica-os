import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryItems, inventoryMovements } from "@/db/schema";
import type { InventoryRepository } from "@/lib/inventory/repository";
import type {
  InventoryCategory,
  InventoryCondition,
  InventoryItem,
  InventoryUnit,
  MovementType,
  StockMovement,
} from "@/lib/inventory/types";
import { applyMovementDelta } from "@/lib/inventory/movement-math";

function toItem(row: typeof inventoryItems.$inferSelect): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    category: row.category as InventoryCategory,
    currentQuantity: Number(row.currentQuantity),
    unit: row.unit as InventoryUnit,
    packageCapacity: row.packageCapacity !== null ? Number(row.packageCapacity) : null,
    packageCount: row.packageCount,
    condition: row.condition as InventoryCondition,
    minimumStock: row.minimumStock !== null ? Number(row.minimumStock) : null,
    notes: row.notes,
    lastCountDate: row.lastCountDate,
    unitCost: row.unitCost !== null ? Number(row.unitCost) : null,
  };
}

function toMovement(row: typeof inventoryMovements.$inferSelect): StockMovement {
  return {
    id: row.id,
    itemId: row.itemId,
    type: row.type as MovementType,
    quantity: Number(row.quantity),
    unit: row.unit as InventoryUnit,
    date: row.date,
    notes: row.notes,
    responsible: row.responsible,
  };
}

/**
 * Implementação real, ativada automaticamente quando DATABASE_URL está configurada
 * (ver src/lib/inventory/repository-factory.ts). Não é exercitada em runtime nesta execução
 * porque não há banco configurado — mas compila e é validada por typecheck/build.
 */
export class PostgresInventoryRepository implements InventoryRepository {
  private db() {
    const db = getDb();
    if (!db) {
      throw new Error(
        "PostgresInventoryRepository foi instanciado sem DATABASE_URL configurada. Isso indica um bug na seleção automática de repositório (repository-factory.ts).",
      );
    }
    return db;
  }

  async listItems(): Promise<InventoryItem[]> {
    const rows = await this.db().select().from(inventoryItems).where(eq(inventoryItems.active, true));
    return rows.map(toItem);
  }

  async getItem(id: string): Promise<InventoryItem | null> {
    const rows = await this.db().select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1);
    return rows[0] ? toItem(rows[0]) : null;
  }

  async listMovements(itemId?: string): Promise<StockMovement[]> {
    const query = this.db().select().from(inventoryMovements);
    const rows = itemId ? await query.where(eq(inventoryMovements.itemId, itemId)) : await query;
    return rows.map(toMovement);
  }

  async recordMovement(movement: Omit<StockMovement, "id">): Promise<StockMovement> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, movement.itemId)).limit(1);
      if (!item) throw new Error(`Item de estoque não encontrado: ${movement.itemId}`);

      const newQuantity = applyMovementDelta(Number(item.currentQuantity), movement.type, movement.quantity);

      await tx
        .update(inventoryItems)
        .set({ currentQuantity: String(newQuantity), updatedAt: new Date() })
        .where(eq(inventoryItems.id, movement.itemId));

      const [inserted] = await tx
        .insert(inventoryMovements)
        .values({
          itemId: movement.itemId,
          type: movement.type,
          quantity: String(movement.quantity),
          unit: movement.unit,
          date: movement.date,
          notes: movement.notes,
          responsible: movement.responsible,
        })
        .returning();

      return toMovement(inserted);
    });
  }
}
