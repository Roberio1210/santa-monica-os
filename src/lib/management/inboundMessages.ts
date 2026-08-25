import "server-only";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customers, inboundMessages, whatsappAdminNumbers, users } from "@/db/schema";
import { normalizeBrazilianPhoneToE164 } from "@/lib/integrations/whatsapp/phone";
import { DatabaseUnavailableError, type Actor } from "@/lib/management/outboundMessages";
import type { UserRole } from "@/lib/auth/roles";

/**
 * Missão Z6.2 — o lado de RECEBIMENTO do canal WhatsApp.
 *
 * Missão Z6.5 — `resolveAdminActorFromPhone` agora está conectada ao orquestrador
 * (`orchestrator.ts#resolveWhatsAppAdminActor`), mas só para RESOLVER IDENTIDADE — nenhuma
 * mensagem recebida aciona `answerGenerative`, nenhuma ferramenta, nenhuma resposta automática.
 * O reconhecimento de admin é logado (observabilidade) e nada mais, até uma missão futura
 * explicitamente conectar isso a um fluxo de conversa real. Reconhecimento é SEMPRE pelo telefone
 * verificado (assinatura do webhook já validada antes de chegar aqui) — nunca pelo texto da
 * mensagem; um número fora da allowlist nunca vira admin, não importa o que a mensagem diga.
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
  /** Missão Z6.4 — `true` só quando este `recordInboundMessage` de fato criou a linha; `false` quando devolveu um registro já existente (reentrega/duplicidade). Usado só para observabilidade — nunca muda o comportamento de persistência. */
  wasNewInsert: boolean;
}

function toRecord(row: typeof inboundMessages.$inferSelect, wasNewInsert: boolean): InboundMessageRecord {
  return {
    id: row.id,
    phoneE164: row.phoneE164,
    externalMessageId: row.externalMessageId,
    customerId: row.customerId,
    messageType: row.messageType,
    textBody: row.textBody,
    receivedAt: row.receivedAt.toISOString(),
    wasNewInsert,
  };
}

/**
 * Missão Z6.4 — extraída como função pura (nunca I/O) para ser diretamente testável: dado um
 * telefone já normalizado e uma lista de candidatos (`id`, `phone` bruto), devolve o `id` do
 * primeiro cujo telefone normaliza para o mesmo valor, ou `null` (resultado válido e comum, não
 * um erro). `customers.phone` nem sempre está em E.164 — pode vir mascarado da JumpPark para
 * ordens antigas, ver `crm.ts` — por isso a normalização acontece nos dois lados antes de comparar.
 */
export function matchCustomerIdByPhone(candidates: Array<{ id: string; phone: string | null }>, phoneE164: string): string | null {
  const match = candidates.find((c) => normalizeBrazilianPhoneToE164(c.phone) === phoneE164);
  return match?.id ?? null;
}

/** Best-effort, nunca bloqueante: busca os candidatos reais e delega a comparação a `matchCustomerIdByPhone`. */
async function findCustomerIdByPhone(phoneE164: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const rows = await db.select({ id: customers.id, phone: customers.phone }).from(customers).where(isNotNull(customers.phone));
  return matchCustomerIdByPhone(rows, phoneE164);
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

  if (inserted[0]) return toRecord(inserted[0], true);

  const [existing] = await db.select().from(inboundMessages).where(eq(inboundMessages.externalMessageId, input.externalMessageId)).limit(1);
  if (!existing) throw new Error(`Falha ao criar ou recuperar mensagem recebida para externalMessageId "${input.externalMessageId}".`);
  return toRecord(existing, false);
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
 * Missão Z6.5 — extraída como função pura (nunca I/O), mesmo padrão de `matchCustomerIdByPhone`:
 * dado o telefone JÁ VERIFICADO (assinatura do webhook validada antes de chegar aqui — nunca o
 * texto da mensagem) e a lista de entradas ativas da allowlist, devolve o actor administrativo
 * correspondente por igualdade EXATA de E.164 (a allowlist só guarda telefones já normalizados
 * no momento da inserção — nunca precisa normalizar de novo aqui), ou `null` quando o telefone não
 * está cadastrado. Cliente nunca vira admin só por mandar mensagem: SEM entrada na allowlist,
 * SEMPRE `null`, não importa o que o texto da mensagem diga.
 */
export function matchAdminActorByPhone(
  candidates: Array<{ phoneE164: string; id: string; name: string; role: UserRole }>,
  phoneE164: string,
): (Actor & { role: UserRole }) | null {
  const match = candidates.find((c) => c.phoneE164 === phoneE164);
  if (!match) return null;
  return { id: match.id, name: match.name, role: match.role };
}

/**
 * Resolve um `actor` administrativo real a partir de um telefone já verificado. Conectada ao
 * orquestrador do Zézinho (`orchestrator.ts#resolveWhatsAppAdminActor`) desde a Missão Z6.5, mas
 * SÓ para identidade — nenhuma ação/resposta é disparada automaticamente a partir disso; ver
 * `route.ts` (webhook), que só loga o reconhecimento, nunca aciona `answerGenerative`.
 */
export async function resolveAdminActorFromPhone(phoneE164: string): Promise<(Actor & { role: UserRole }) | null> {
  const db = getDb();
  if (!db) return null;

  const rows = await db
    .select({ phoneE164: whatsappAdminNumbers.phoneE164, id: users.id, name: users.name, role: users.role })
    .from(whatsappAdminNumbers)
    .innerJoin(users, eq(whatsappAdminNumbers.userId, users.id))
    .where(eq(whatsappAdminNumbers.active, true));

  return matchAdminActorByPhone(rows, phoneE164);
}
