import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryItems, processStepProductSuggestions } from "@/db/schema";
import type { ProcessStep } from "@/lib/recipes/types";

export interface ProductStepSuggestion {
  id: string;
  processStep: ProcessStep;
  itemId: string;
  itemName: string;
  itemBrand: string;
  confirmed: boolean;
  active: boolean;
  notes: string | null;
}

/**
 * Sugestões de mapeamento etapa → produto (Fase B, seção 7) — nunca geram consumo automático.
 * "Rejeitar" é modelado como active=false (soft-delete já existente em toda tabela do projeto),
 * não um status novo — reaproveita a coluna já criada em vez de migrar de novo.
 */
export async function listSuggestions(): Promise<ProductStepSuggestion[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: processStepProductSuggestions.id,
      processStep: processStepProductSuggestions.processStep,
      itemId: processStepProductSuggestions.itemId,
      itemName: inventoryItems.name,
      itemBrand: inventoryItems.brand,
      confirmed: processStepProductSuggestions.confirmed,
      active: processStepProductSuggestions.active,
      notes: processStepProductSuggestions.notes,
    })
    .from(processStepProductSuggestions)
    .innerJoin(inventoryItems, eq(processStepProductSuggestions.itemId, inventoryItems.id));

  return rows.sort((a, b) => a.processStep.localeCompare(b.processStep) || a.itemName.localeCompare(b.itemName, "pt-BR"));
}

export async function confirmSuggestion(id: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Banco não configurado.");
  await db.update(processStepProductSuggestions).set({ confirmed: true, updatedAt: new Date() }).where(eq(processStepProductSuggestions.id, id));
}

/** "Rejeitar" nunca apaga a sugestão — só a desativa, preservando o histórico de quem já foi avaliado. */
export async function rejectSuggestion(id: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Banco não configurado.");
  await db.update(processStepProductSuggestions).set({ confirmed: false, active: false, updatedAt: new Date() }).where(eq(processStepProductSuggestions.id, id));
}

export async function markSuggestionPending(id: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Banco não configurado.");
  await db.update(processStepProductSuggestions).set({ confirmed: false, active: true, updatedAt: new Date() }).where(eq(processStepProductSuggestions.id, id));
}

export async function replaceSuggestionItem(id: string, newItemId: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Banco não configurado.");
  await db.update(processStepProductSuggestions).set({ itemId: newItemId, confirmed: false, updatedAt: new Date() }).where(eq(processStepProductSuggestions.id, id));
}
