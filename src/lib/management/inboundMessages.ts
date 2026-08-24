import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customers, inboundMessages, whatsappAdminNumbers, users } from "@/db/schema";
import { normalizeBrazilianPhoneToE164 } from "@/lib/integrations/whatsapp/phone";
import { DatabaseUnavailableError, type Actor } from "@/lib/management/outboundMessages";
import type { UserRole } from "@/lib/auth/roles";

/**
 * Missão Z6.2 — o lado de RECEBIMENTO do canal WhatsApp. Preparado, mas não conectado a nenhuma
 * ação administrativa real ainda: `resolveAdminActorFromPhone` existe e é testável, mas nenhum
 * caminho de código do Zézinho (`orchestrator.ts`/`tools.ts`) o chama nesta missão — uma mensagem
 * recebida hoje NUNCA aciona nada sozinha, exatamente como pedido ("NÃO permitir ainda que uma
 * mensagem recebida execute automaticamente ações administrativas").
 */

export interface InboundMessageInput {
  phoneE164: string;
  externalMessageId: string;
  messageType: string;
  textBody: string | null;
  receivedAt: Date;
}

export interface InboundMessageRecord {
  id: string;
  phoneE164: string;
  externalMessageId: string;
  customerId: string | null;
  messageType: string;
  textBody: string | null;
  receivedAt: string;
}

function toRecord(row: typeof inboundMessages.$inferSelect): InboundMessageRecord {
  return {
    id: row.id,
    phoneE164: row.phoneE164,
    externalMessageId: row.externalMessageId,
    customerId: row.customerId,
    messageType: row.messageType,
    textBody: row.textBody,
    receivedAt: row.receivedAt.toISOString(),
  };
}

/**
 * Best-effort, nunca bloqueante: casa o telefone normalizado contra `customers.phone` (que nem
 * sempre está em E.164 — pode vir mascarado da JumpPark, ver `crm.ts`). `null` é um resultado
 * válido e comum, não um erro.
 */
async function findCustomerIdByPhone(phoneE164: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select({ id: customers.id, phone: customers.phone }).from(customers).where(isNotNull(customers.phone));
  const match = rows.find((r) => normalizeBrazilianPhoneToE164(r.phone) === phoneE164);
  return match?.id ?? null;
}

/**
 * Idempotente por `externalMessageId` (o `wamid` da Meta) — o mesmo padrão de
 * `queueMessageForApproval`: reentrega de webhook nunca cria um segundo registro, sempre devolve
 * o já existente.
 */
export async function recordInboundMessage(input: InboundMessageInput): Promise<InboundMessageRecord> {
  const db = getDb();
  if (!db) throw new DatabaseUnavailableError();

  const customerId = await findCustomerIdByPhone(input.phoneE164);

  const inserted = await db
    .insert(inboundMessages)
    .values({
      phoneE164: input.phoneE164,
      externalMessageId: input.externalMessageId,
      customerId,
      messageType: input.messageType,
      textBody: input.textBody,
      receivedAt: input.receivedAt,
      source: "whatsapp_webhook",
    })
    .onConflictDoNothing({ target: inboundMessages.externalMessageId })
    .returning();

  if (inserted[0]) return toRecord(inserted[0]);

  const [existing] = await db.select().from(inboundMessages).where(eq(inboundMessages.externalMessageId, input.externalMessageId)).limit(1);
  if (!existing) throw new Error(`Falha ao criar ou recuperar mensagem recebida para externalMessageId "${input.externalMessageId}".`);
  return toRecord(existing);
}

/** Usado por `resolveMessageWindow` (`templates.ts`) para decidir se ainda estamos dentro da janela de 24h de uma conversa. */
export async function getLastInboundMessageAt(customerId: string | null): Promise<Date | null> {
  if (!customerId) return null;
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ receivedAt: inboundMessages.receivedAt })
    .from(inboundMessages)
    .where(and(eq(inboundMessages.customerId, customerId), eq(inboundMessages.active, true)))
    .orderBy(desc(inboundMessages.receivedAt))
    .limit(1);
  return row?.receivedAt ?? null;
}

/**
 * PREPARADO, NÃO CONECTADO nesta missão. Resolve um `actor` administrativo real a partir de um
 * telefone JÁ VERIFICADO (assinatura do webhook validada antes de chegar aqui) — nunca a partir do
 * texto da mensagem. Cliente nunca vira admin: só telefones cadastrados manualmente em
 * `whatsapp_admin_numbers` (tabela vazia por padrão, nunca populada nesta missão) resolvem um
 * `actor`; qualquer outro número devolve `null`.
 */
export async function resolveAdminActorFromPhone(phoneE164: string): Promise<(Actor & { role: UserRole }) | null> {
  const db = getDb();
  if (!db) return null;

  const [row] = await db
    .select({ id: users.id, name: users.name, role: users.role })
    .from(whatsappAdminNumbers)
    .innerJoin(users, eq(whatsappAdminNumbers.userId, users.id))
    .where(and(eq(whatsappAdminNumbers.phoneE164, phoneE164), eq(whatsappAdminNumbers.active, true)))
    .limit(1);

  if (!row) return null;
  return { id: row.id, name: row.name, role: row.role };
}
