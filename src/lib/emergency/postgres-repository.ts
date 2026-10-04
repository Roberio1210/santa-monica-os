import "server-only";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type Database, type DbOrTx } from "@/db/client";
import { emergencyContacts, emergencyProtocols, emergencyProtocolSteps } from "@/db/schema/emergency";
import { auditLogs } from "@/db/schema/system";
import { EmergencyConcurrentUpdateError, EmergencyNotFoundError, type EmergencyRepository } from "@/lib/emergency/repository";
import type {
  EmergencyContact,
  EmergencyContactInput,
  EmergencyProtocol,
  EmergencyProtocolInput,
  EmergencyProtocolStep,
  EmergencyProtocolWithSteps,
} from "@/lib/emergency/types";

type ContactRow = typeof emergencyContacts.$inferSelect;
type ProtocolRow = typeof emergencyProtocols.$inferSelect;
type StepRow = typeof emergencyProtocolSteps.$inferSelect;

function toContact(row: ContactRow): EmergencyContact {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    category: row.category,
    phone: row.phone,
    phoneAlt: row.phoneAlt,
    whatsapp: row.whatsapp,
    email: row.email,
    website: row.website,
    priority: row.priority,
    displayOrder: row.displayOrder,
    active: row.active,
    notes: row.notes,
    updatedAt: row.updatedAt,
  };
}

function toProtocol(row: ProtocolRow): EmergencyProtocol {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    category: row.category,
    description: row.description,
    priority: row.priority,
    displayOrder: row.displayOrder,
    warning: row.warning,
    potentialCoverageKeys: row.potentialCoverageKeys,
    priorityContactId: row.priorityContactId,
    active: row.active,
    notes: row.notes,
    updatedAt: row.updatedAt,
  };
}

function toStep(row: StepRow): EmergencyProtocolStep {
  return { id: row.id, protocolId: row.protocolId, position: row.position, text: row.text, isCritical: row.isCritical };
}

/** CAS com a mesma truncagem em milissegundos de `planning/postgres-repository.ts` (o JS nunca vê os microssegundos do `now()`). */
function matchesUpdatedAt(column: typeof emergencyContacts.updatedAt | typeof emergencyProtocols.updatedAt, expectedUpdatedAt: string) {
  return sql`date_trunc('milliseconds', ${column}) = ${expectedUpdatedAt}::timestamptz`;
}

/**
 * Leituras: no máximo uma consulta por tabela, sem N+1 (passos de vários protocolos vêm num único
 * `inArray`). Escritas: sempre numa transação com `tx` (nunca `this.db()` dentro dela — ver
 * `DbOrTx` em `db/client.ts`) e com a linha de `audit_logs` correspondente.
 */
export class PostgresEmergencyRepository implements EmergencyRepository {
  private db(): Database {
    const db = getDb();
    if (!db) throw new Error("PostgresEmergencyRepository exige DATABASE_URL configurada.");
    return db;
  }

  async listContacts({ includeInactive }: { includeInactive: boolean }): Promise<EmergencyContact[]> {
    const rows = await this.db()
      .select()
      .from(emergencyContacts)
      .where(includeInactive ? undefined : eq(emergencyContacts.active, true))
      .orderBy(asc(emergencyContacts.displayOrder), asc(emergencyContacts.name));
    return rows.map(toContact);
  }

  async listProtocols({ includeInactive }: { includeInactive: boolean }): Promise<EmergencyProtocol[]> {
    const rows = await this.db()
      .select()
      .from(emergencyProtocols)
      .where(includeInactive ? undefined : eq(emergencyProtocols.active, true))
      .orderBy(asc(emergencyProtocols.displayOrder), asc(emergencyProtocols.title));
    return rows.map(toProtocol);
  }

  async listStepsForProtocols(protocolIds: string[]): Promise<EmergencyProtocolStep[]> {
    if (protocolIds.length === 0) return [];
    const rows = await this.db()
      .select()
      .from(emergencyProtocolSteps)
      .where(inArray(emergencyProtocolSteps.protocolId, protocolIds))
      .orderBy(asc(emergencyProtocolSteps.protocolId), asc(emergencyProtocolSteps.position));
    return rows.map(toStep);
  }

  async getProtocolBySlug(slug: string): Promise<EmergencyProtocolWithSteps | null> {
    return this.loadProtocolWithSteps(this.db(), eq(emergencyProtocols.slug, slug));
  }

  async createContact(input: EmergencyContactInput, actorUserId: string): Promise<EmergencyContact> {
    return this.db().transaction(async (tx) => {
      const [row] = await tx.insert(emergencyContacts).values({ ...input, source: "manual" }).returning();
      const contact = toContact(row);
      await this.audit(tx, actorUserId, "emergency_contact_created", "emergency_contacts", contact.id, null, contact);
      return contact;
    });
  }

  async updateContact(id: string, input: EmergencyContactInput, expectedUpdatedAt: string, actorUserId: string): Promise<EmergencyContact> {
    return this.db().transaction(async (tx) => {
      const before = await this.requireContact(tx, id);
      const [row] = await tx
        .update(emergencyContacts)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(emergencyContacts.id, id), matchesUpdatedAt(emergencyContacts.updatedAt, expectedUpdatedAt)))
        .returning();
      if (!row) throw new EmergencyConcurrentUpdateError();
      const contact = toContact(row);
      await this.audit(tx, actorUserId, "emergency_contact_updated", "emergency_contacts", id, before, contact);
      return contact;
    });
  }

  async setContactActive(id: string, active: boolean, expectedUpdatedAt: string, actorUserId: string): Promise<EmergencyContact> {
    return this.db().transaction(async (tx) => {
      const before = await this.requireContact(tx, id);
      const [row] = await tx
        .update(emergencyContacts)
        .set({ active, updatedAt: new Date() })
        .where(and(eq(emergencyContacts.id, id), matchesUpdatedAt(emergencyContacts.updatedAt, expectedUpdatedAt)))
        .returning();
      if (!row) throw new EmergencyConcurrentUpdateError();
      await this.audit(tx, actorUserId, active ? "emergency_contact_activated" : "emergency_contact_deactivated", "emergency_contacts", id, { active: before.active }, { active });
      return toContact(row);
    });
  }

  async updateProtocol(id: string, input: EmergencyProtocolInput, expectedUpdatedAt: string, actorUserId: string): Promise<EmergencyProtocolWithSteps> {
    return this.db().transaction(async (tx) => {
      const before = await this.loadProtocolWithSteps(tx, eq(emergencyProtocols.id, id));
      if (!before) throw new EmergencyNotFoundError("protocolo");

      const { steps, ...fields } = input;
      const [row] = await tx
        .update(emergencyProtocols)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(emergencyProtocols.id, id), matchesUpdatedAt(emergencyProtocols.updatedAt, expectedUpdatedAt)))
        .returning();
      if (!row) throw new EmergencyConcurrentUpdateError();

      // Os passos são substituídos como um bloco (a lista inteira é o que o administrador editou);
      // o estado anterior completo fica preservado em `audit_logs.before_state`.
      await tx.delete(emergencyProtocolSteps).where(eq(emergencyProtocolSteps.protocolId, id));
      if (steps.length > 0) {
        await tx.insert(emergencyProtocolSteps).values(steps.map((step, index) => ({ protocolId: id, position: index + 1, text: step.text, isCritical: step.isCritical })));
      }

      const after = await this.loadProtocolWithSteps(tx, eq(emergencyProtocols.id, id));
      await this.audit(tx, actorUserId, "emergency_protocol_updated", "emergency_protocols", id, before, after);
      return after!;
    });
  }

  async setProtocolActive(id: string, active: boolean, expectedUpdatedAt: string, actorUserId: string): Promise<EmergencyProtocol> {
    return this.db().transaction(async (tx) => {
      const [current] = await tx.select().from(emergencyProtocols).where(eq(emergencyProtocols.id, id)).limit(1);
      if (!current) throw new EmergencyNotFoundError("protocolo");
      const [row] = await tx
        .update(emergencyProtocols)
        .set({ active, updatedAt: new Date() })
        .where(and(eq(emergencyProtocols.id, id), matchesUpdatedAt(emergencyProtocols.updatedAt, expectedUpdatedAt)))
        .returning();
      if (!row) throw new EmergencyConcurrentUpdateError();
      await this.audit(tx, actorUserId, active ? "emergency_protocol_activated" : "emergency_protocol_deactivated", "emergency_protocols", id, { active: current.active }, { active });
      return toProtocol(row);
    });
  }

  private async requireContact(runner: DbOrTx, id: string): Promise<EmergencyContact> {
    const [row] = await runner.select().from(emergencyContacts).where(eq(emergencyContacts.id, id)).limit(1);
    if (!row) throw new EmergencyNotFoundError("contato");
    return toContact(row);
  }

  private async loadProtocolWithSteps(runner: DbOrTx, where: ReturnType<typeof eq>): Promise<EmergencyProtocolWithSteps | null> {
    const [row] = await runner.select().from(emergencyProtocols).where(where).limit(1);
    if (!row) return null;
    const steps = await runner.select().from(emergencyProtocolSteps).where(eq(emergencyProtocolSteps.protocolId, row.id)).orderBy(asc(emergencyProtocolSteps.position));
    return { ...toProtocol(row), steps: steps.map(toStep) };
  }

  private async audit(runner: DbOrTx, actorUserId: string, action: string, entityType: string, entityId: string, beforeState: unknown, afterState: unknown): Promise<void> {
    await runner.insert(auditLogs).values({ actorUserId, action, entityType, entityId, beforeState, afterState, source: "manual", notes: null });
  }
}
