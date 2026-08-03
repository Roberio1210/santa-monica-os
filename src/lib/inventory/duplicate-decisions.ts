import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inventoryAuditEvents } from "@/db/schema";

/**
 * Decisão humana sobre um par suspeito de duplicidade (Missão 23, seção 3) — "Não são
 * duplicados" ou "Revisar depois" nunca alteram nenhum cadastro, só registram que o par já foi
 * olhado. Reaproveita `inventory_audit_events` (não cria tabela nova): `entityId` é sempre o
 * menor dos dois ids (ordem lexicográfica), para a chave do par ser sempre a mesma independente
 * da ordem em que os itens aparecem na lista de suspeitos.
 */

export type DuplicatePairDecision = "nao_sao_duplicados" | "revisar_depois";

function pairKey(itemAId: string, itemBId: string): [string, string] {
  return itemAId < itemBId ? [itemAId, itemBId] : [itemBId, itemAId];
}

export async function recordDuplicateDecision(itemAId: string, itemBId: string, decision: DuplicatePairDecision, actor: string): Promise<void> {
  if (!actor.trim()) throw new Error("Responsável é obrigatório.");
  if (itemAId === itemBId) throw new Error("Um par de duplicidade precisa de dois produtos diferentes.");

  const db = getDb();
  if (!db) throw new Error("Banco não configurado.");

  const [first, second] = pairKey(itemAId, itemBId);
  await db.insert(inventoryAuditEvents).values({
    entityType: "duplicate_suspect_pair",
    entityId: first,
    action: decision,
    beforeState: null,
    afterState: { itemAId: first, itemBId: second },
    reason: null,
    actor: actor.trim(),
    source: "auditoria_duplicidade",
  });
}

/** Chaves `${menorId}:${maiorId}` de todo par que já recebeu uma decisão explícita — usado para nunca mostrar de novo um par já revisado, e para o Índice de Saúde nunca penalizar pares já tratados. */
export async function listResolvedDuplicatePairs(): Promise<Set<string>> {
  const db = getDb();
  if (!db) return new Set();

  const rows = await db.select({ afterState: inventoryAuditEvents.afterState }).from(inventoryAuditEvents).where(eq(inventoryAuditEvents.entityType, "duplicate_suspect_pair"));

  const keys = new Set<string>();
  for (const row of rows) {
    const state = row.afterState as { itemAId?: string; itemBId?: string } | null;
    if (state?.itemAId && state?.itemBId) keys.add(`${state.itemAId}:${state.itemBId}`);
  }
  return keys;
}
