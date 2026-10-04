import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { emergencyContacts, emergencyProtocols, emergencyProtocolSteps } from "@/db/schema/emergency";
import { auditLogs } from "@/db/schema/system";
import { PostgresEmergencyRepository } from "@/lib/emergency/postgres-repository";
import { EmergencyConcurrentUpdateError } from "@/lib/emergency/repository";
import type { EmergencyContactInput } from "@/lib/emergency/types";

/**
 * Módulo Emergência (Fase 1) — repositório contra um Postgres real: ordenação, filtro de ativos,
 * CAS com truncagem em milissegundos (o primeiro edit de uma linha criada por `defaultNow()` é
 * exatamente o caso que só aparece no Postgres — ver `planning/updateAppointmentDetails.postgres.test.ts`),
 * substituição atômica dos passos e `audit_logs` na mesma transação.
 *
 * Requer `TEST_DATABASE_URL` (nunca a de produção — `db/client.ts` é fail-closed em teste) com a
 * migration 0064 aplicada. Sem a variável, o arquivo inteiro fica `skip`. Remove tudo o que cria.
 */

const hasRealDb = !!process.env.TEST_DATABASE_URL;
const ACTOR = null as unknown as string; // audit_logs.actor_user_id é FK para users — null evita depender de um usuário de teste.
const RUN = `t${Date.now()}`;

const createdContactIds: string[] = [];
const createdProtocolIds: string[] = [];

function contactInput(overrides: Partial<EmergencyContactInput> = {}): EmergencyContactInput {
  return { name: `Contato ${RUN}`, category: "outro", phone: null, phoneAlt: null, whatsapp: null, email: null, website: null, priority: "normal", displayOrder: 900_000, notes: null, ...overrides };
}

describe.skipIf(!hasRealDb)("PostgresEmergencyRepository (Postgres real)", () => {
  const repository = new PostgresEmergencyRepository();
  let protocolId: string;
  let protocolSlug: string;

  beforeAll(async () => {
    const db = getDb()!;
    protocolSlug = `teste-${RUN}`;
    const [row] = await db
      .insert(emergencyProtocols)
      .values({ slug: protocolSlug, title: `Protocolo ${RUN}`, category: "outro", description: "Teste", displayOrder: 900_000, potentialCoverageKeys: ["incendio"], source: "test" })
      .returning();
    protocolId = row.id;
    createdProtocolIds.push(protocolId);
    await db.insert(emergencyProtocolSteps).values([
      { protocolId, position: 2, text: "Segundo" },
      { protocolId, position: 1, text: "Primeiro", isCritical: true },
    ]);
  });

  afterAll(async () => {
    const db = getDb();
    if (!db) return;
    const entityIds = [...createdContactIds, ...createdProtocolIds];
    if (entityIds.length > 0) await db.delete(auditLogs).where(inArray(auditLogs.entityId, entityIds));
    if (createdProtocolIds.length > 0) {
      await db.delete(emergencyProtocolSteps).where(inArray(emergencyProtocolSteps.protocolId, createdProtocolIds));
      await db.delete(emergencyProtocols).where(inArray(emergencyProtocols.id, createdProtocolIds));
    }
    if (createdContactIds.length > 0) await db.delete(emergencyContacts).where(inArray(emergencyContacts.id, createdContactIds));
  });

  it("protocolo por slug com passos ordenados por posição e array de coberturas preservado", async () => {
    const protocol = await repository.getProtocolBySlug(protocolSlug);
    expect(protocol?.steps.map((s) => [s.position, s.text, s.isCritical])).toEqual([
      [1, "Primeiro", true],
      [2, "Segundo", false],
    ]);
    expect(protocol?.potentialCoverageKeys).toEqual(["incendio"]);
  });

  it("cria, edita (primeiro edit após defaultNow) e detecta versão desatualizada", async () => {
    const created = await repository.createContact(contactInput(), ACTOR);
    createdContactIds.push(created.id);

    const updated = await repository.updateContact(created.id, contactInput({ phone: "(48) 3333-0000" }), created.updatedAt.toISOString(), ACTOR);
    expect(updated.phone).toBe("(48) 3333-0000");

    await expect(repository.updateContact(created.id, contactInput({ phone: "193" }), created.updatedAt.toISOString(), ACTOR)).rejects.toBeInstanceOf(EmergencyConcurrentUpdateError);

    const logs = await getDb()!.select().from(auditLogs).where(inArray(auditLogs.entityId, [created.id]));
    expect(logs.map((l) => l.action).sort()).toEqual(["emergency_contact_created", "emergency_contact_updated"]);
  });

  it("desativar remove da listagem de ativos, mas não da administrativa", async () => {
    const created = await repository.createContact(contactInput({ name: `Inativo ${RUN}` }), ACTOR);
    createdContactIds.push(created.id);
    await repository.setContactActive(created.id, false, created.updatedAt.toISOString(), ACTOR);

    expect((await repository.listContacts({ includeInactive: false })).some((c) => c.id === created.id)).toBe(false);
    expect((await repository.listContacts({ includeInactive: true })).some((c) => c.id === created.id)).toBe(true);
  });

  it("edição de protocolo substitui os passos atomicamente e registra antes/depois", async () => {
    const before = (await repository.getProtocolBySlug(protocolSlug))!;
    await repository.updateProtocol(
      protocolId,
      {
        title: before.title,
        category: "outro",
        description: before.description,
        priority: "alta",
        displayOrder: before.displayOrder,
        warning: null,
        potentialCoverageKeys: [],
        priorityContactId: null,
        notes: null,
        steps: [
          { text: "Novo A", isCritical: false },
          { text: "Novo B", isCritical: false },
          { text: "Novo C", isCritical: true },
        ],
      },
      before.updatedAt.toISOString(),
      ACTOR,
    );

    const after = (await repository.getProtocolBySlug(protocolSlug))!;
    expect(after.priority).toBe("alta");
    expect(after.steps.map((s) => [s.position, s.text])).toEqual([
      [1, "Novo A"],
      [2, "Novo B"],
      [3, "Novo C"],
    ]);
    const [log] = await getDb()!.select().from(auditLogs).where(inArray(auditLogs.entityId, [protocolId]));
    expect(log.action).toBe("emergency_protocol_updated");
    expect((log.beforeState as { steps: unknown[] }).steps).toHaveLength(2);
    expect((log.afterState as { steps: unknown[] }).steps).toHaveLength(3);
  });

  it("passos de vários protocolos numa única consulta", async () => {
    const steps = await repository.listStepsForProtocols([protocolId]);
    expect(steps.map((s) => s.position)).toEqual([1, 2, 3]);
    expect(await repository.listStepsForProtocols([])).toEqual([]);
  });
});
