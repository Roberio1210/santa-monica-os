import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryItems, inventoryMovements, inventorySnapshots } from "@/db/schema";
import type { InventoryRepository } from "@/lib/inventory/repository";
import type {
  InventoryCategory,
  InventoryCondition,
  InventoryItem,
  InventoryPositionOrigin,
  InventorySnapshot,
  InventorySnapshotPayload,
  InventoryUnit,
  ItemClassification,
  MovementType,
  PersistInventorySnapshotInput,
  QuantityStatus,
  StockMovement,
} from "@/lib/inventory/types";
import { applyMovementDelta } from "@/lib/inventory/movement-math";

function toItem(row: typeof inventoryItems.$inferSelect): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    originalName: row.originalName,
    brand: row.brand,
    category: row.category as InventoryCategory,
    currentQuantity: Number(row.currentQuantity),
    unit: row.unit as InventoryUnit,
    packageCapacity: row.packageCapacity !== null ? Number(row.packageCapacity) : null,
    packageCount: row.packageCount,
    condition: row.condition as InventoryCondition,
    minimumStock: row.minimumStock !== null ? Number(row.minimumStock) : null,
    idealStock: row.idealStock !== null ? Number(row.idealStock) : null,
    supplier: row.supplier,
    location: row.location,
    classification: row.classification as ItemClassification | null,
    canonicalItemId: row.canonicalItemId,
    consolidatedAt: row.consolidatedAt !== null ? row.consolidatedAt.toISOString() : null,
    notes: row.notes,
    lastCountDate: row.lastCountDate,
    unitCost: row.unitCost !== null ? Number(row.unitCost) : null,
    quantityStatus: row.quantityStatus as QuantityStatus,
    active: row.active,
    technicalFunction: row.technicalFunction as InventoryItem["technicalFunction"],
    usageType: row.usageType as InventoryItem["usageType"],
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
    reference: row.reference,
    supplier: row.supplier,
    unitPricePaid: row.unitPricePaid !== null ? Number(row.unitPricePaid) : null,
    externalId: row.externalId,
    previousBalance: row.previousBalance !== null ? Number(row.previousBalance) : null,
    newBalance: row.newBalance !== null ? Number(row.newBalance) : null,
    createdAt: row.createdAt.toISOString(),
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

  async listInactiveItems(): Promise<InventoryItem[]> {
    const rows = await this.db().select().from(inventoryItems).where(eq(inventoryItems.active, false));
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

  async recordMovement(movement: Omit<StockMovement, "id" | "previousBalance" | "newBalance">): Promise<StockMovement> {
    const db = this.db();
    return db.transaction(async (tx) => {
      if (movement.externalId) {
        const [existing] = await tx.select().from(inventoryMovements).where(eq(inventoryMovements.externalId, movement.externalId)).limit(1);
        if (existing) return toMovement(existing);
      }

      const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, movement.itemId)).limit(1);
      if (!item) throw new Error(`Item de estoque não encontrado: ${movement.itemId}`);

      const previousBalance = Number(item.currentQuantity);
      const newBalance = applyMovementDelta(previousBalance, movement.type, movement.quantity);

      await tx
        .update(inventoryItems)
        .set({ currentQuantity: String(newBalance), updatedAt: new Date() })
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
          reference: movement.reference,
          supplier: movement.supplier ?? null,
          unitPricePaid: movement.unitPricePaid !== undefined && movement.unitPricePaid !== null ? String(movement.unitPricePaid) : null,
          externalId: movement.externalId ?? null,
          previousBalance: String(previousBalance),
          newBalance: String(newBalance),
        })
        .returning();

      return toMovement(inserted);
    });
  }

  /**
   * Missão de Consolidação da Contagem de Estoque V1 — registra uma posição física confiável
   * (movimento `correcao_inventario` absoluto + `currentQuantity`/`lastCountDate`/
   * `quantityStatus` do item) numa ÚNICA transação. Existe porque `recordMovement` +
   * `updateItemDetails`, chamados em sequência como duas operações separadas, deixavam uma janela
   * real (ainda que estreita) em que o movimento poderia ser persistido e a atualização do item
   * falhar depois — risco relatado explicitamente na missão anterior. Reaproveita o mesmo padrão
   * `db.transaction` já usado em `recordMovement`, nunca um framework novo.
   */
  async recordPhysicalCount(input: { itemId: string; countedQuantity: number; date: string; responsible: string; reference: string | null; notes: string | null }): Promise<StockMovement> {
    const db = this.db();
    return db.transaction(async (tx) => {
      const [item] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, input.itemId)).limit(1);
      if (!item) throw new Error(`Item de estoque não encontrado: ${input.itemId}`);

      const previousBalance = Number(item.currentQuantity);
      const newBalance = applyMovementDelta(previousBalance, "correcao_inventario", input.countedQuantity);

      await tx
        .update(inventoryItems)
        .set({ currentQuantity: String(newBalance), lastCountDate: input.date, quantityStatus: "confirmed", updatedAt: new Date() })
        .where(eq(inventoryItems.id, input.itemId));

      const [inserted] = await tx
        .insert(inventoryMovements)
        .values({
          itemId: input.itemId,
          type: "correcao_inventario",
          quantity: String(input.countedQuantity),
          unit: item.unit as InventoryUnit,
          date: input.date,
          notes: input.notes,
          responsible: input.responsible,
          reference: input.reference,
          previousBalance: String(previousBalance),
          newBalance: String(newBalance),
        })
        .returning();

      return toMovement(inserted);
    });
  }

  async updateItemDetails(
    id: string,
    patch: Partial<
      Pick<
        InventoryItem,
        | "supplier"
        | "location"
        | "minimumStock"
        | "idealStock"
        | "unitCost"
        | "classification"
        | "canonicalItemId"
        | "consolidatedAt"
        | "name"
        | "brand"
        | "category"
        | "lastCountDate"
        | "quantityStatus"
        | "packageCapacity"
        | "packageCount"
      >
    >,
  ): Promise<InventoryItem> {
    const values: Partial<typeof inventoryItems.$inferInsert> = { updatedAt: new Date() };
    if ("supplier" in patch) values.supplier = patch.supplier ?? null;
    if ("location" in patch) values.location = patch.location ?? null;
    if ("minimumStock" in patch) values.minimumStock = patch.minimumStock !== null && patch.minimumStock !== undefined ? String(patch.minimumStock) : null;
    if ("idealStock" in patch) values.idealStock = patch.idealStock !== null && patch.idealStock !== undefined ? String(patch.idealStock) : null;
    if ("unitCost" in patch) values.unitCost = patch.unitCost !== null && patch.unitCost !== undefined ? String(patch.unitCost) : null;
    if ("classification" in patch) values.classification = patch.classification ?? null;
    if ("canonicalItemId" in patch) values.canonicalItemId = patch.canonicalItemId ?? null;
    if ("consolidatedAt" in patch) values.consolidatedAt = patch.consolidatedAt !== null && patch.consolidatedAt !== undefined ? new Date(patch.consolidatedAt) : null;
    if ("name" in patch && patch.name !== undefined) values.name = patch.name;
    if ("brand" in patch && patch.brand !== undefined) values.brand = patch.brand;
    if ("category" in patch && patch.category !== undefined) values.category = patch.category;
    if ("lastCountDate" in patch && patch.lastCountDate !== undefined) values.lastCountDate = patch.lastCountDate;
    if ("quantityStatus" in patch && patch.quantityStatus !== undefined) values.quantityStatus = patch.quantityStatus;
    if ("packageCapacity" in patch) values.packageCapacity = patch.packageCapacity !== null && patch.packageCapacity !== undefined ? String(patch.packageCapacity) : null;
    if ("packageCount" in patch) values.packageCount = patch.packageCount ?? null;

    const [row] = await this.db().update(inventoryItems).set(values).where(eq(inventoryItems.id, id)).returning();
    if (!row) throw new Error(`Item de estoque não encontrado: ${id}`);
    return toItem(row);
  }

  async setItemActive(id: string, active: boolean): Promise<void> {
    const [row] = await this.db().update(inventoryItems).set({ active, updatedAt: new Date() }).where(eq(inventoryItems.id, id)).returning();
    if (!row) throw new Error(`Item de estoque não encontrado: ${id}`);
  }

  private toSnapshot(row: typeof inventorySnapshots.$inferSelect): InventorySnapshot {
    return {
      id: row.id,
      competenceMonth: row.competenceMonth,
      version: row.version,
      isOfficial: row.isOfficial,
      cutoffAt: row.cutoffAt,
      lastPhysicalCountAt: row.lastPhysicalCountAt,
      methodology: row.methodology as InventoryPositionOrigin,
      caveat: row.caveat,
      payload: row.payload as InventorySnapshotPayload,
      payloadHash: row.payloadHash,
      hashAlgorithm: row.hashAlgorithm,
      totalProducts: row.totalProducts,
      productsWithCost: row.productsWithCost,
      isPartialValue: row.isPartialValue,
      supersededAt: row.supersededAt ? row.supersededAt.toISOString() : null,
      supersededByVersionId: row.supersededByVersionId,
      createdBy: row.createdBy,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async listInventorySnapshots(competenceMonth: string): Promise<InventorySnapshot[]> {
    const rows = await this.db().select().from(inventorySnapshots).where(eq(inventorySnapshots.competenceMonth, competenceMonth)).orderBy(desc(inventorySnapshots.version));
    return rows.map((r) => this.toSnapshot(r));
  }

  async getOfficialInventorySnapshot(competenceMonth: string): Promise<InventorySnapshot | null> {
    const rows = await this.db()
      .select()
      .from(inventorySnapshots)
      .where(and(eq(inventorySnapshots.competenceMonth, competenceMonth), eq(inventorySnapshots.isOfficial, true)))
      .limit(1);
    return rows[0] ? this.toSnapshot(rows[0]) : null;
  }

  /**
   * Fechamento atômico: desmarca a versão oficial anterior (se houver) ANTES de inserir a nova —
   * evita colidir com o índice único parcial (`inventory_snapshots_official_per_competence_idx`,
   * que permite no máximo uma linha `is_official=true` por competência) — mesma ordem/raciocínio
   * já usado em `persistDreSnapshotAndClosePeriod` (Missão Financeiro V7/Fase C7), sem importar
   * nada daquele módulo.
   */
  async persistInventorySnapshot(input: PersistInventorySnapshotInput): Promise<InventorySnapshot> {
    const db = this.db();
    return db.transaction(async (tx) => {
      // Desmarca a versão oficial anterior ANTES de inserir a nova — o índice único parcial
      // (`is_official=true` por competência) rejeitaria a inserção se as duas coexistissem, mesmo
      // que só por um instante dentro da mesma transação. `supersededByVersionId` ainda não é
      // conhecido aqui (a nova linha não existe ainda) — é preenchido no UPDATE final, depois do
      // INSERT (Missão Estoque E6.2: antes esse FK nunca era preenchido).
      if (input.previousOfficialSnapshotId) {
        await tx
          .update(inventorySnapshots)
          .set({ isOfficial: false, supersededAt: new Date(), updatedAt: new Date() })
          .where(eq(inventorySnapshots.id, input.previousOfficialSnapshotId));
      }

      const [row] = await tx
        .insert(inventorySnapshots)
        .values({
          competenceMonth: input.competenceMonth,
          version: input.version,
          isOfficial: true,
          cutoffAt: input.cutoffAt,
          lastPhysicalCountAt: input.lastPhysicalCountAt,
          methodology: input.methodology,
          caveat: input.caveat,
          payload: input.payload,
          payloadHash: input.payloadHash,
          hashAlgorithm: input.hashAlgorithm,
          totalProducts: input.totalProducts,
          productsWithCost: input.productsWithCost,
          isPartialValue: input.isPartialValue,
          createdBy: input.createdBy,
          notes: input.notes ?? null,
        })
        .returning();

      if (input.previousOfficialSnapshotId) {
        await tx.update(inventorySnapshots).set({ supersededByVersionId: row.id, updatedAt: new Date() }).where(eq(inventorySnapshots.id, input.previousOfficialSnapshotId));
      }

      return this.toSnapshot(row);
    });
  }
}
