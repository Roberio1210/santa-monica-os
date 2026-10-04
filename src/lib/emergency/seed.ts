import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { emergencyContacts, emergencyProtocols, emergencyProtocolSteps } from "@/db/schema/emergency";
import { SEED_CONTACTS, SEED_PROTOCOLS } from "@/lib/emergency/seed-data";

export interface EmergencySeedResult {
  contactsInserted: number;
  protocolsInserted: number;
  stepsInserted: number;
}

/**
 * Módulo Emergência — carga inicial da Central a partir de `seed-data.ts` (fonte única). Usada pelo
 * script `npm run db:seed:emergency` e pelo teste de idempotência contra Postgres real.
 *
 * Idempotente e não destrutivo: contatos por `key` e protocolos por `slug` com
 * `ON CONFLICT DO NOTHING` — um registro já existente (inclusive editado pelo administrador em
 * /configuracoes/emergencia) nunca é sobrescrito nem duplicado. Passos só são inseridos para
 * protocolos criados nesta execução (protocolo recém-criado nunca tem passos). Tudo numa
 * transação: ou a carga inteira entra, ou nada muda. Nunca executa UPDATE nem DELETE.
 *
 * Consequência aceita: alterar o texto de um protocolo em `seed-data.ts` NÃO atualiza um banco
 * já carregado — a partir do seed, a fonte de verdade é o banco (edição pela tela administrativa).
 */
export async function applyEmergencySeed<TSchema extends Record<string, unknown>>(db: PgDatabase<PgQueryResultHKT, TSchema>): Promise<EmergencySeedResult> {
  return db.transaction(async (tx) => {
    let contactsInserted = 0;
    for (const contact of SEED_CONTACTS) {
      const inserted = await tx
        .insert(emergencyContacts)
        .values({ key: contact.key, name: contact.name, category: contact.category, phone: contact.phone, priority: contact.priority, displayOrder: contact.displayOrder, notes: contact.notes, source: "seed" })
        .onConflictDoNothing({ target: emergencyContacts.key })
        .returning({ id: emergencyContacts.id });
      if (inserted.length > 0) contactsInserted += 1;
    }

    const contactRows = await tx.select({ id: emergencyContacts.id, key: emergencyContacts.key }).from(emergencyContacts);
    const contactIdByKey = new Map(contactRows.filter((r) => r.key !== null).map((r) => [r.key as string, r.id]));

    let protocolsInserted = 0;
    let stepsInserted = 0;
    for (const protocol of SEED_PROTOCOLS) {
      const priorityContactId = protocol.priorityContactKey ? (contactIdByKey.get(protocol.priorityContactKey) ?? null) : null;
      if (protocol.priorityContactKey && !priorityContactId) {
        throw new Error(`Contato "${protocol.priorityContactKey}" do protocolo "${protocol.slug}" não encontrado.`);
      }

      const inserted = await tx
        .insert(emergencyProtocols)
        .values({
          slug: protocol.slug,
          title: protocol.title,
          category: protocol.category,
          description: protocol.description,
          priority: protocol.priority,
          displayOrder: protocol.displayOrder,
          warning: protocol.warning,
          potentialCoverageKeys: protocol.potentialCoverageKeys,
          priorityContactId,
          notes: protocol.notes,
          source: "seed",
        })
        .onConflictDoNothing({ target: emergencyProtocols.slug })
        .returning({ id: emergencyProtocols.id });

      if (inserted.length === 0) continue;
      protocolsInserted += 1;

      const protocolId = inserted[0].id;
      await tx.insert(emergencyProtocolSteps).values(protocol.steps.map((step, index) => ({ protocolId, position: index + 1, text: step.text, isCritical: step.isCritical ?? false })));
      stepsInserted += protocol.steps.length;
    }

    return { contactsInserted, protocolsInserted, stepsInserted };
  });
}
