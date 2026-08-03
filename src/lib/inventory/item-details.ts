import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import type { InventoryItem } from "@/lib/inventory/types";

export interface UpdateItemDetailsInput {
  itemId: string;
  supplier: string | null;
  location: string | null;
  minimumStock: number | null;
  idealStock: number | null;
}

/**
 * Edição de metadados complementares do produto (Missão 22) — fornecedor, localização, estoque
 * mínimo/ideal. Nunca toca em quantidade/saldo/custo médio (esses só mudam via movimentação).
 */
export async function updateItemDetails(input: UpdateItemDetailsInput): Promise<InventoryItem> {
  if (input.minimumStock !== null && (!Number.isFinite(input.minimumStock) || input.minimumStock < 0)) {
    throw new Error("Estoque mínimo inválido.");
  }
  if (input.idealStock !== null && (!Number.isFinite(input.idealStock) || input.idealStock < 0)) {
    throw new Error("Estoque ideal inválido.");
  }
  if (input.idealStock !== null && input.minimumStock !== null && input.idealStock < input.minimumStock) {
    throw new Error("Estoque ideal não pode ser menor que o estoque mínimo.");
  }

  const repo = getInventoryRepository();
  return repo.updateItemDetails(input.itemId, {
    supplier: input.supplier?.trim() || null,
    location: input.location?.trim() || null,
    minimumStock: input.minimumStock,
    idealStock: input.idealStock,
  });
}
