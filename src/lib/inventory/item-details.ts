import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { inventoryCategories } from "@/lib/inventory/types";
import type { InventoryCategory, InventoryItem } from "@/lib/inventory/types";

export interface UpdateItemDetailsInput {
  itemId: string;
  supplier: string | null;
  location: string | null;
  minimumStock: number | null;
  idealStock: number | null;
  /**
   * Missão de Fechamento de Lacunas Operacionais — correção de cadastro (nunca invenção de
   * dado novo: o produto já existe, isto só corrige como ele é identificado). `undefined`
   * quando o formulário não enviou o campo — mantém o valor atual, nunca apaga.
   */
  name?: string;
  brand?: string;
  category?: InventoryCategory;
}

/**
 * Edição de metadados complementares do produto (Missão 22, estendida na Missão de Fechamento
 * de Lacunas Operacionais com nome/marca/categoria) — fornecedor, localização, estoque
 * mínimo/ideal, identificação. Nunca toca em quantidade/saldo/custo médio (esses só mudam via
 * movimentação real).
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
  if (input.name !== undefined && !input.name.trim()) {
    throw new Error("Nome não pode ficar em branco.");
  }
  if (input.brand !== undefined && !input.brand.trim()) {
    throw new Error("Marca não pode ficar em branco.");
  }
  if (input.category !== undefined && !inventoryCategories.includes(input.category)) {
    throw new Error("Categoria inválida.");
  }

  const repo = getInventoryRepository();
  return repo.updateItemDetails(input.itemId, {
    supplier: input.supplier?.trim() || null,
    location: input.location?.trim() || null,
    minimumStock: input.minimumStock,
    idealStock: input.idealStock,
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.brand !== undefined ? { brand: input.brand.trim() } : {}),
    ...(input.category !== undefined ? { category: input.category } : {}),
  });
}
