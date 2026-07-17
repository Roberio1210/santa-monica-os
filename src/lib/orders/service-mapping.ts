import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { jumpparkServiceMappings, services } from "@/db/schema";
import { slugifyServiceName } from "@/lib/orders/plate";
import type { ServiceMapping } from "@/lib/orders/types";

/** Honesto: sem Postgres configurado, retorna vazio — nunca inventa mapeamentos. */
export async function listServiceMappings(): Promise<ServiceMapping[]> {
  const db = getDb();
  if (!db) return [];

  const rows = await db
    .select({
      id: jumpparkServiceMappings.id,
      jumpparkServiceName: jumpparkServiceMappings.jumpparkServiceName,
      canonicalServiceId: jumpparkServiceMappings.canonicalServiceId,
      canonicalServiceName: services.name,
      status: jumpparkServiceMappings.status,
      lastValidatedAt: jumpparkServiceMappings.lastValidatedAt,
      notes: jumpparkServiceMappings.notes,
    })
    .from(jumpparkServiceMappings)
    .leftJoin(services, eq(jumpparkServiceMappings.canonicalServiceId, services.id))
    .where(eq(jumpparkServiceMappings.active, true));

  return rows.sort((a, b) => a.jumpparkServiceName.localeCompare(b.jumpparkServiceName, "pt-BR"));
}

/**
 * Garante que todo texto de serviço já visto numa ordem real tenha uma linha própria — nunca
 * mapeia por aproximação; um texto nunca antes visto vira uma linha nova com status
 * "nao_mapeado", preservando o texto original. Idempotente via external_id (slug do texto).
 */
export async function registerSeenServiceNames(names: string[]): Promise<void> {
  const db = getDb();
  if (!db) return;

  const distinct = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  for (const name of distinct) {
    const externalId = slugifyServiceName(name);
    if (!externalId) continue;
    await db
      .insert(jumpparkServiceMappings)
      .values({ jumpparkServiceName: name, status: "nao_mapeado", source: "jumppark", externalId })
      .onConflictDoNothing({ target: jumpparkServiceMappings.externalId });
  }
}

export async function confirmServiceMapping(id: string, canonicalServiceId: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Banco não configurado.");
  await db
    .update(jumpparkServiceMappings)
    .set({ canonicalServiceId, status: "mapeado", lastValidatedAt: new Date().toISOString().slice(0, 10), updatedAt: new Date() })
    .where(eq(jumpparkServiceMappings.id, id));
}

/** Volta o mapeamento para "nao_mapeado" — nunca apaga a linha, preserva o texto original e o histórico. */
export async function unmapService(id: string): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Banco não configurado.");
  await db.update(jumpparkServiceMappings).set({ canonicalServiceId: null, status: "nao_mapeado", updatedAt: new Date() }).where(eq(jumpparkServiceMappings.id, id));
}
