import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryAuditEvents, inventoryConsolidationMembers, inventoryConsolidations, inventoryItems, inventoryMovements, serviceConsumptionRules } from "@/db/schema";
import { applyMovementDelta } from "@/lib/inventory/movement-math";
import { areBaseUnitsCompatible } from "@/lib/inventory/unit-conversion";
import type { InventoryCategory, InventoryUnit } from "@/lib/inventory/types";

/**
 * Assistente de Consolidação (Missão 23, seção 4) — ou grava tudo (transferência de saldo,
 * atualização do mestre, desativação dos incorporados, redirecionamento de receitas, auditoria),
 * ou não grava nada. Nunca exclui: cada cadastro incorporado fica `active=false` e aponta para o
 * mestre via `canonicalItemId`, para sempre rastreável. Nunca converte saldo entre unidades-base
 * diferentes — só combina itens que já compartilham a mesma unidade-base (a conversão de
 * embalagem de compra é assunto de `purchase-import-service.ts`, não desta função).
 */

export interface ConsolidationOverrides {
  name?: string;
  brand?: string;
  category?: InventoryCategory;
  supplier?: string | null;
  location?: string | null;
  minimumStock?: number | null;
  idealStock?: number | null;
}

export interface ConsolidationInput {
  masterItemId: string;
  mergedItemIds: string[];
  unitBase: InventoryUnit;
  reason: string | null;
  performedBy: string;
  overrides?: ConsolidationOverrides;
}

export interface ConsolidationResult {
  /** `null` só quando todos os itens pedidos já tinham sido incorporados a este mesmo mestre antes (idempotência total). */
  consolidationId: string | null;
  masterItemId: string;
  /** Só os itens realmente processados nesta chamada — os que já estavam consolidados neste mestre não entram aqui de novo. */
  processedItemIds: string[];
  newMasterBalance: number;
  newMasterUnitCost: number | null;
  alreadyExisted: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function consolidateItems(input: ConsolidationInput): Promise<ConsolidationResult> {
  if (!input.performedBy.trim()) throw new Error("Responsável é obrigatório.");
  const mergedIds = Array.from(new Set(input.mergedItemIds));
  if (mergedIds.length === 0) throw new Error("Selecione ao menos um cadastro para incorporar.");
  if (mergedIds.includes(input.masterItemId)) throw new Error("O produto mestre não pode aparecer também como incorporado.");

  const db = getDb();
  if (!db) throw new Error("Banco não configurado.");

  const today = new Date().toISOString().slice(0, 10);

  return db.transaction(async (tx) => {
    const [master] = await tx.select().from(inventoryItems).where(eq(inventoryItems.id, input.masterItemId)).for("update").limit(1);
    if (!master) throw new Error(`Produto mestre não encontrado: ${input.masterItemId}`);
    if (master.canonicalItemId !== null) throw new Error("Este produto já foi incorporado a outro — escolha um mestre que ainda não foi consolidado.");
    if (!areBaseUnitsCompatible(master.unit as InventoryUnit, input.unitBase)) {
      throw new Error(`Unidade-base escolhida (${input.unitBase}) não bate com a unidade do produto mestre (${master.unit}).`);
    }

    const mergedRows = await tx.select().from(inventoryItems).where(inArray(inventoryItems.id, mergedIds)).for("update");
    const mergedById = new Map(mergedRows.map((r) => [r.id, r]));

    const toProcess: (typeof mergedRows)[number][] = [];
    for (const id of mergedIds) {
      const row = mergedById.get(id);
      if (!row) throw new Error(`Produto não encontrado: ${id}`);
      if (row.canonicalItemId !== null) {
        if (row.canonicalItemId === input.masterItemId) continue; // já incorporado a este mesmo mestre — idempotente, não reprocessa
        throw new Error(`"${row.name}" já foi incorporado a outro produto mestre — não pode ser consolidado aqui também.`);
      }
      if (!areBaseUnitsCompatible(row.unit as InventoryUnit, input.unitBase)) {
        throw new Error(`"${row.name}" está em ${row.unit}, incompatível com a unidade-base escolhida (${input.unitBase}). Consolidação automática de unidades diferentes não é feita nesta missão.`);
      }
      toProcess.push(row);
    }

    if (toProcess.length === 0) {
      return {
        consolidationId: null,
        masterItemId: input.masterItemId,
        processedItemIds: [],
        newMasterBalance: Number(master.currentQuantity),
        newMasterUnitCost: master.unitCost !== null ? Number(master.unitCost) : null,
        alreadyExisted: true,
      };
    }

    const [consolidation] = await tx
      .insert(inventoryConsolidations)
      .values({ masterItemId: input.masterItemId, unitBase: input.unitBase, reason: input.reason, performedBy: input.performedBy.trim() })
      .returning();

    let runningMasterBalance = Number(master.currentQuantity);
    let totalCostValue = master.unitCost !== null ? runningMasterBalance * Number(master.unitCost) : 0;
    let totalCostWeight = master.unitCost !== null ? runningMasterBalance : 0;
    const processedItemIds: string[] = [];

    for (const merged of toProcess) {
      const previousBalance = Number(merged.currentQuantity);
      const previousUnitCost = merged.unitCost !== null ? Number(merged.unitCost) : null;

      const newMergedBalance = applyMovementDelta(previousBalance, "transferencia", previousBalance);
      const [transferMovement] = await tx
        .insert(inventoryMovements)
        .values({
          itemId: merged.id,
          type: "transferencia",
          quantity: String(previousBalance),
          unit: merged.unit,
          date: today,
          responsible: input.performedBy.trim(),
          reference: `CONSOLIDACAO-${consolidation.id}`,
          notes: `Consolidado em "${master.name}" (${input.masterItemId}).`,
          previousBalance: String(previousBalance),
          newBalance: String(newMergedBalance),
          source: "auditoria",
        })
        .returning();

      await tx
        .update(inventoryItems)
        .set({ currentQuantity: String(newMergedBalance), active: false, canonicalItemId: input.masterItemId, consolidatedAt: new Date(), updatedAt: new Date() })
        .where(eq(inventoryItems.id, merged.id));

      const newMasterBalanceAfterThis = applyMovementDelta(runningMasterBalance, "entrada", previousBalance);
      const [receivingMovement] = await tx
        .insert(inventoryMovements)
        .values({
          itemId: input.masterItemId,
          type: "entrada",
          quantity: String(previousBalance),
          unit: input.unitBase,
          date: today,
          responsible: input.performedBy.trim(),
          reference: `CONSOLIDACAO-${consolidation.id}`,
          notes: `Recebido de "${merged.name}" (${merged.id}) na consolidação.`,
          previousBalance: String(runningMasterBalance),
          newBalance: String(newMasterBalanceAfterThis),
          source: "auditoria",
        })
        .returning();

      runningMasterBalance = newMasterBalanceAfterThis;
      if (previousUnitCost !== null) {
        totalCostValue += previousBalance * previousUnitCost;
        totalCostWeight += previousBalance;
      }

      await tx.insert(inventoryConsolidationMembers).values({
        consolidationId: consolidation.id,
        mergedItemId: merged.id,
        previousBalance: String(previousBalance),
        previousUnitCost: previousUnitCost !== null ? String(previousUnitCost) : null,
        convertedQuantity: String(previousBalance),
        transferMovementId: transferMovement.id,
        receivingMovementId: receivingMovement.id,
      });

      await tx.insert(inventoryAuditEvents).values({
        entityType: "inventory_item",
        entityId: merged.id,
        action: "consolidacao_incorporada",
        beforeState: { active: true, canonicalItemId: null, currentQuantity: previousBalance, unitCost: previousUnitCost },
        afterState: { active: false, canonicalItemId: input.masterItemId, currentQuantity: 0 },
        reason: input.reason,
        actor: input.performedBy.trim(),
        source: "auditoria_consolidacao",
      });

      const affectedRecipes = await tx.select({ id: serviceConsumptionRules.id }).from(serviceConsumptionRules).where(eq(serviceConsumptionRules.itemId, merged.id));
      if (affectedRecipes.length > 0) {
        await tx.update(serviceConsumptionRules).set({ itemId: input.masterItemId, updatedAt: new Date() }).where(eq(serviceConsumptionRules.itemId, merged.id));
        await tx.insert(inventoryAuditEvents).values({
          entityType: "inventory_item",
          entityId: merged.id,
          action: "receitas_redirecionadas",
          beforeState: { recipeIds: affectedRecipes.map((r) => r.id), itemId: merged.id },
          afterState: { recipeIds: affectedRecipes.map((r) => r.id), itemId: input.masterItemId },
          reason: "Consolidação — receitas seguem o produto mestre.",
          actor: input.performedBy.trim(),
          source: "auditoria_consolidacao",
        });
      }

      processedItemIds.push(merged.id);
    }

    const newMasterUnitCost = totalCostWeight > 0 ? round2(totalCostValue / totalCostWeight) : null;
    const masterPatch: Partial<typeof inventoryItems.$inferInsert> = {
      currentQuantity: String(runningMasterBalance),
      unitCost: newMasterUnitCost !== null ? String(newMasterUnitCost) : null,
      updatedAt: new Date(),
    };
    if (input.overrides?.name !== undefined) masterPatch.name = input.overrides.name;
    if (input.overrides?.brand !== undefined) masterPatch.brand = input.overrides.brand;
    if (input.overrides?.category !== undefined) masterPatch.category = input.overrides.category;
    if (input.overrides?.supplier !== undefined) masterPatch.supplier = input.overrides.supplier;
    if (input.overrides?.location !== undefined) masterPatch.location = input.overrides.location;
    if (input.overrides?.minimumStock !== undefined) masterPatch.minimumStock = input.overrides.minimumStock !== null ? String(input.overrides.minimumStock) : null;
    if (input.overrides?.idealStock !== undefined) masterPatch.idealStock = input.overrides.idealStock !== null ? String(input.overrides.idealStock) : null;

    await tx.update(inventoryItems).set(masterPatch).where(eq(inventoryItems.id, input.masterItemId));

    await tx.insert(inventoryAuditEvents).values({
      entityType: "inventory_item",
      entityId: input.masterItemId,
      action: "consolidacao_recebida",
      beforeState: { currentQuantity: Number(master.currentQuantity), unitCost: master.unitCost !== null ? Number(master.unitCost) : null },
      afterState: { currentQuantity: runningMasterBalance, unitCost: newMasterUnitCost },
      reason: input.reason,
      actor: input.performedBy.trim(),
      source: "auditoria_consolidacao",
    });

    return {
      consolidationId: consolidation.id,
      masterItemId: input.masterItemId,
      processedItemIds,
      newMasterBalance: runningMasterBalance,
      newMasterUnitCost,
      alreadyExisted: false,
    };
  });
}
