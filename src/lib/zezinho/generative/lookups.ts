import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { toItemView } from "@/lib/inventory/status";
import { searchCrm } from "@/lib/crm-intelligente/service";
import type { InventoryItemView } from "@/lib/inventory/types";
import type { CrmSearchMatch } from "@/lib/crm-intelligente/types";

/**
 * Missão Z2 — buscas pontuais por nome, necessárias para o modelo generativo responder perguntas
 * como "quanto temos de V-Floc" (produto específico) ou "quem é o Fulano" (cliente específico).
 * O pipeline determinístico (Z1/Z3/Z4) só tinha agregados; aqui reaproveita-se o mesmo
 * repositório/service reais, nunca uma nova fonte de dado.
 */

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Busca por nome (contém, sem acento/maiúscula) — nunca inventa item, `[]` quando nada bate. */
export async function lookupInventoryItems(query: string, limit = 5): Promise<InventoryItemView[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const needle = normalize(trimmed);
  const items = await getInventoryRepository().listItems();
  const matches = items.filter((item) => normalize(item.name).includes(needle) || (item.originalName && normalize(item.originalName).includes(needle)));
  return matches.slice(0, limit).map(toItemView);
}

/** Busca por nome/telefone/placa — reaproveita `searchCrm` (CRM Inteligente), nunca duplica a busca. */
export async function lookupCrmCustomers(query: string, limit = 5): Promise<CrmSearchMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const matches = await searchCrm(trimmed);
  return matches.slice(0, limit);
}
