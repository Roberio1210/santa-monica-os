import "server-only";
import type { InventoryItemView } from "@/lib/inventory/types";
import type { ConsumptionConfirmationView } from "@/lib/jumppark-orders/consumption-history";

/**
 * Missão de Usuários Individuais (V5.3) — remove campos financeiros sensíveis (custo, valor em
 * estoque) ANTES de qualquer item chegar a um componente client, para o papel `operacional`.
 * Nunca basta esconder a coluna no React: um Client Component recebe o objeto inteiro como prop
 * e ele fica visível no payload RSC/JSON enviado ao navegador, mesmo sem ser renderizado — por
 * isso a blindagem é sempre feita aqui, na camada de dados, nunca só na camada visual.
 */
export function stripFinancialFieldsFromItems(items: InventoryItemView[]): InventoryItemView[] {
  return items.map((item) => ({ ...item, unitCost: null, stockValue: null }));
}

export function stripFinancialFieldsFromConfirmations(confirmations: ConsumptionConfirmationView[]): ConsumptionConfirmationView[] {
  return confirmations.map((c) => ({ ...c, lines: c.lines.map((l) => ({ ...l, knownCost: null })) }));
}
