import { randomUUID } from "node:crypto";
import { EmergencyConcurrentUpdateError, EmergencyNotFoundError, sameUpdatedAt, type EmergencyRepository } from "@/lib/emergency/repository";
import { SEED_CONTACTS, SEED_PROTOCOLS } from "@/lib/emergency/seed-data";
import {
  compareByDisplayOrder,
  type EmergencyContact,
  type EmergencyContactInput,
  type EmergencyProtocol,
  type EmergencyProtocolInput,
  type EmergencyProtocolStep,
  type EmergencyProtocolWithSteps,
} from "@/lib/emergency/types";

export interface MemoryAuditEntry {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string;
  beforeState: unknown;
  afterState: unknown;
}

/** Sempre posterior ao valor anterior — duas escritas no mesmo milissegundo nunca ficam com o mesmo `updatedAt` (o CAS dependeria disso). */
function nextUpdatedAt(previous: Date): Date {
  const now = Date.now();
  return new Date(Math.max(now, previous.getTime() + 1));
}

/**
 * Armazenamento em memória (sem banco / testes), já carregado com o conteúdo de `seed-data.ts` —
 * mesma Central que o Postgres terá depois do `db:seed:emergency`.
 */
export class MemoryEmergencyRepository implements EmergencyRepository {
  private contacts: EmergencyContact[] = [];
  private protocols: EmergencyProtocol[] = [];
  private steps: EmergencyProtocolStep[] = [];
  readonly auditEntries: MemoryAuditEntry[] = [];

  constructor() {
    const createdAt = new Date();
    const contactIdByKey = new Map<string, string>();
    for (const seed of SEED_CONTACTS) {
      const id = randomUUID();
      contactIdByKey.set(seed.key, id);
      this.contacts.push({
        id,
        key: seed.key,
        name: seed.name,
        category: seed.category,
        phone: seed.phone,
        phoneAlt: null,
        whatsapp: null,
        email: null,
        website: null,
        priority: seed.priority,
        displayOrder: seed.displayOrder,
        active: true,
        notes: seed.notes,
        updatedAt: createdAt,
      });
    }
    for (const seed of SEED_PROTOCOLS) {
      const id = randomUUID();
      this.protocols.push({
        id,
        slug: seed.slug,
        title: seed.title,
        category: seed.category,
        description: seed.description,
        priority: seed.priority,
        displayOrder: seed.displayOrder,
        warning: seed.warning,
        potentialCoverageKeys: [...seed.potentialCoverageKeys],
        priorityContactId: seed.priorityContactKey ? (contactIdByKey.get(seed.priorityContactKey) ?? null) : null,
        active: true,
        notes: seed.notes,
        updatedAt: createdAt,
      });
      seed.steps.forEach((step, index) => {
        this.steps.push({ id: randomUUID(), protocolId: id, position: index + 1, text: step.text, isCritical: step.isCritical ?? false });
      });
    }
  }

  async listContacts({ includeInactive }: { includeInactive: boolean }): Promise<EmergencyContact[]> {
    return this.contacts
      .filter((c) => includeInactive || c.active)
      .sort(compareByDisplayOrder((c) => c.name))
      .map((c) => ({ ...c }));
  }

  async listProtocols({ includeInactive }: { includeInactive: boolean }): Promise<EmergencyProtocol[]> {
    return this.protocols
      .filter((p) => includeInactive || p.active)
      .sort(compareByDisplayOrder((p) => p.title))
      .map((p) => ({ ...p, potentialCoverageKeys: [...p.potentialCoverageKeys] }));
  }

  async listStepsForProtocols(protocolIds: string[]): Promise<EmergencyProtocolStep[]> {
    const ids = new Set(protocolIds);
    return this.steps
      .filter((s) => ids.has(s.protocolId))
      .sort((a, b) => a.protocolId.localeCompare(b.protocolId) || a.position - b.position)
      .map((s) => ({ ...s }));
  }

  async getProtocolBySlug(slug: string): Promise<EmergencyProtocolWithSteps | null> {
    const protocol = this.protocols.find((p) => p.slug === slug);
    if (!protocol) return null;
    const steps = await this.listStepsForProtocols([protocol.id]);
    return { ...protocol, potentialCoverageKeys: [...protocol.potentialCoverageKeys], steps };
  }

  async createContact(input: EmergencyContactInput, actorUserId: string): Promise<EmergencyContact> {
    const contact: EmergencyContact = { id: randomUUID(), key: null, ...input, active: true, updatedAt: new Date() };
    this.contacts.push(contact);
    this.audit(actorUserId, "emergency_contact_created", "emergency_contacts", contact.id, null, contact);
    return { ...contact };
  }

  async updateContact(id: string, input: EmergencyContactInput, expectedUpdatedAt: string, actorUserId: string): Promise<EmergencyContact> {
    const current = this.findContact(id, expectedUpdatedAt);
    const before = { ...current };
    Object.assign(current, input, { updatedAt: nextUpdatedAt(current.updatedAt) });
    this.audit(actorUserId, "emergency_contact_updated", "emergency_contacts", id, before, current);
    return { ...current };
  }

  async setContactActive(id: string, active: boolean, expectedUpdatedAt: string, actorUserId: string): Promise<EmergencyContact> {
    const current = this.findContact(id, expectedUpdatedAt);
    const before = { active: current.active };
    current.active = active;
    current.updatedAt = nextUpdatedAt(current.updatedAt);
    this.audit(actorUserId, active ? "emergency_contact_activated" : "emergency_contact_deactivated", "emergency_contacts", id, before, { active });
    return { ...current };
  }

  async updateProtocol(id: string, input: EmergencyProtocolInput, expectedUpdatedAt: string, actorUserId: string): Promise<EmergencyProtocolWithSteps> {
    const current = this.findProtocol(id, expectedUpdatedAt);
    const beforeSteps = this.steps.filter((s) => s.protocolId === id).sort((a, b) => a.position - b.position);
    const before = { ...current, steps: beforeSteps.map((s) => ({ text: s.text, isCritical: s.isCritical })) };

    const { steps, ...fields } = input;
    Object.assign(current, fields, { potentialCoverageKeys: [...fields.potentialCoverageKeys], updatedAt: nextUpdatedAt(current.updatedAt) });
    this.steps = this.steps.filter((s) => s.protocolId !== id);
    steps.forEach((step, index) => {
      this.steps.push({ id: randomUUID(), protocolId: id, position: index + 1, text: step.text, isCritical: step.isCritical });
    });

    this.audit(actorUserId, "emergency_protocol_updated", "emergency_protocols", id, before, { ...current, steps });
    return (await this.getProtocolBySlug(current.slug))!;
  }

  async setProtocolActive(id: string, active: boolean, expectedUpdatedAt: string, actorUserId: string): Promise<EmergencyProtocol> {
    const current = this.findProtocol(id, expectedUpdatedAt);
    const before = { active: current.active };
    current.active = active;
    current.updatedAt = nextUpdatedAt(current.updatedAt);
    this.audit(actorUserId, active ? "emergency_protocol_activated" : "emergency_protocol_deactivated", "emergency_protocols", id, before, { active });
    return { ...current, potentialCoverageKeys: [...current.potentialCoverageKeys] };
  }

  private findContact(id: string, expectedUpdatedAt: string): EmergencyContact {
    const current = this.contacts.find((c) => c.id === id);
    if (!current) throw new EmergencyNotFoundError("contato");
    if (!sameUpdatedAt(current.updatedAt, expectedUpdatedAt)) throw new EmergencyConcurrentUpdateError();
    return current;
  }

  private findProtocol(id: string, expectedUpdatedAt: string): EmergencyProtocol {
    const current = this.protocols.find((p) => p.id === id);
    if (!current) throw new EmergencyNotFoundError("protocolo");
    if (!sameUpdatedAt(current.updatedAt, expectedUpdatedAt)) throw new EmergencyConcurrentUpdateError();
    return current;
  }

  private audit(actorUserId: string, action: string, entityType: string, entityId: string, beforeState: unknown, afterState: unknown): void {
    this.auditEntries.push({ actorUserId, action, entityType, entityId, beforeState: structuredClone(beforeState), afterState: structuredClone(afterState) });
  }
}
