import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { toItemView } from "@/lib/inventory/status";
import type { InventoryItemView } from "@/lib/inventory/types";

export interface PurchaseSuggestion {
  item: InventoryItemView;
  reasonUnavailable: string | null;
  suggestedQuantity: number | null;
}

/**
 * Compras sugeridas (Fase C, seção 10) — só calcula com dados reais: estoque mínimo, consumo
 * aprovado (receita aprovada) e lead time. Nenhum desses três existe hoje para nenhum produto
 * (minimumStock nunca foi cadastrado na Fase A, e não há campo de lead time no schema ainda),
 * então toda linha retorna motivo de indisponibilidade em vez de uma sugestão inventada.
 */
export async function fetchPurchaseSuggestions(): Promise<PurchaseSuggestion[]> {
  const rawItems = await getInventoryRepository().listItems();
  const items = rawItems.map(toItemView);

  return items.map((item) => {
    if (item.minimumStock === null) {
      return { item, reasonUnavailable: "Dados insuficientes para sugerir compra — estoque mínimo ainda não configurado.", suggestedQuantity: null };
    }
    // Lead time nunca foi cadastrado no schema (nenhum produto tem essa informação) — sempre indisponível por ora.
    return { item, reasonUnavailable: "Dados insuficientes para sugerir compra — lead time do fornecedor ainda não configurado.", suggestedQuantity: null };
  });
}
