import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { computeWeightedAverageCost } from "@/lib/inventory/weighted-average-cost";
import type { InventoryItem, InventoryUnit, StockMovement } from "@/lib/inventory/types";

export interface ManualEntryInput {
  itemId: string;
  quantity: number;
  unit: InventoryUnit;
  date: string;
  responsible: string;
  supplier: string | null;
  unitPricePaid: number | null;
  invoiceNumber: string | null;
  notes: string | null;
  /** Chave de idempotência opcional (Missão 34) — reprocessar a mesma compra com o mesmo `externalId` nunca duplica a entrada. */
  externalId?: string | null;
}

/**
 * "Entradas" (Missão 22) — a única forma prevista de registrar uma compra/recebimento manual
 * (o formulário genérico de `manual-movement.ts` exclui `compra` de propósito — ver o aviso em
 * `movements-view.tsx`). Sempre grava como `compra`. Quando um preço pago é informado, recalcula
 * automaticamente o custo médio ponderado do item (nunca sobrescreve o custo sem base real);
 * quando um fornecedor é informado, atualiza o fornecedor mais recente conhecido do item. Nunca
 * sobrescreve saldo diretamente — passa por `recordMovement`, que sempre recalcula a partir do
 * saldo real no momento (mesma regra de `manual-movement.ts`).
 */
export async function recordManualEntry(input: ManualEntryInput): Promise<StockMovement> {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new Error("Quantidade deve ser maior que zero.");
  }
  if (!input.responsible.trim()) {
    throw new Error("Responsável é obrigatório.");
  }
  if (input.unitPricePaid !== null && (!Number.isFinite(input.unitPricePaid) || input.unitPricePaid < 0)) {
    throw new Error("Valor pago inválido.");
  }

  const repo = getInventoryRepository();
  const item = await repo.getItem(input.itemId);
  if (!item) throw new Error("Produto não encontrado.");

  const externalId = input.externalId?.trim() || null;
  if (externalId) {
    const existing = (await repo.listMovements(input.itemId)).find((m) => m.externalId === externalId);
    if (existing) return existing;
  }

  const supplier = input.supplier?.trim() || null;

  const movement = await repo.recordMovement({
    itemId: input.itemId,
    type: "compra",
    quantity: input.quantity,
    unit: input.unit,
    date: input.date,
    responsible: input.responsible.trim(),
    reference: input.invoiceNumber?.trim() || null,
    supplier,
    unitPricePaid: input.unitPricePaid,
    notes: input.notes?.trim() || null,
    externalId,
  });

  const patch: Partial<Pick<InventoryItem, "unitCost" | "supplier">> = {};
  if (input.unitPricePaid !== null && input.unitPricePaid > 0) {
    patch.unitCost = computeWeightedAverageCost({
      currentQuantity: item.currentQuantity,
      currentUnitCost: item.unitCost,
      enteredQuantity: input.quantity,
      unitPricePaid: input.unitPricePaid,
    });
  }
  if (supplier) {
    patch.supplier = supplier;
  }
  if (Object.keys(patch).length > 0) {
    await repo.updateItemDetails(input.itemId, patch);
  }

  return movement;
}
