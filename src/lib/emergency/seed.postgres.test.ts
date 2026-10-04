import { describe, expect, it } from "vitest";
import { count, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { emergencyContacts, emergencyProtocols, emergencyProtocolSteps } from "@/db/schema/emergency";
import { applyEmergencySeed } from "@/lib/emergency/seed";
import { SEED_CONTACTS, SEED_PROTOCOLS } from "@/lib/emergency/seed-data";

/**
 * Módulo Emergência (Missão 2.1) — idempotência do seed contra Postgres real: rodar duas vezes
 * seguidas nunca duplica contato, protocolo ou passo, e a segunda execução não insere nada.
 * Requer `TEST_DATABASE_URL` com a migration 0064 aplicada; sem a variável, fica `skip`. Os
 * registros do seed permanecem no banco de teste (é o estado esperado de um banco carregado).
 */

const hasRealDb = !!process.env.TEST_DATABASE_URL;

describe.skipIf(!hasRealDb)("applyEmergencySeed (Postgres real)", () => {
  it("duas execuções seguidas: a segunda não insere nada e nenhuma chave/slug fica duplicada", async () => {
    const db = getDb()!;
    await applyEmergencySeed(db);
    const stepsBefore = await db.select({ n: count() }).from(emergencyProtocolSteps);

    const second = await applyEmergencySeed(db);
    expect(second).toEqual({ contactsInserted: 0, protocolsInserted: 0, stepsInserted: 0 });

    const contactRows = await db.select({ key: emergencyContacts.key }).from(emergencyContacts).where(inArray(emergencyContacts.key, SEED_CONTACTS.map((c) => c.key)));
    expect(contactRows.map((r) => r.key).sort()).toEqual(SEED_CONTACTS.map((c) => c.key).sort());

    const protocolRows = await db.select({ slug: emergencyProtocols.slug }).from(emergencyProtocols).where(inArray(emergencyProtocols.slug, SEED_PROTOCOLS.map((p) => p.slug)));
    expect(protocolRows.map((r) => r.slug).sort()).toEqual(SEED_PROTOCOLS.map((p) => p.slug).sort());

    const stepsAfter = await db.select({ n: count() }).from(emergencyProtocolSteps);
    expect(stepsAfter[0].n).toBe(stepsBefore[0].n);
  }, 120_000); // ~60 inserts sequenciais via rede até o Neon de teste — acima do teto padrão de 15s.
});
