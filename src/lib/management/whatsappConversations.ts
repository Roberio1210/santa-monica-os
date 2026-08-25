import "server-only";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { inboundMessages, whatsappOutboundReplies } from "@/db/schema";
import { DatabaseUnavailableError } from "@/lib/management/outboundMessages";
import type { GenerativeMessage } from "@/lib/zezinho/generative/orchestrator";

/**
 * Missão Z6.6 — memória de conversa do canal WhatsApp administrativo. A sessão HTTP/Web mantém
 * histórico só no CLIENTE (Z2, `sanitizeHistory` em `route.ts`) — não existe "cliente" no
 * WhatsApp (cada POST da Meta é independente), então esta é "a menor solução arquitetural
 * correta" (pedida explicitamente pela missão) para dar continuidade real: histórico reconstruído
 * sob demanda, por telefone, nunca um mecanismo novo de sessão paralelo ao já existente — o
 * FORMATO continua sendo exatamente `GenerativeMessage[]`, o mesmo tipo que `answerGenerative` já
 * aceita da sessão Web.
 *
 * Fonte dos turnos: `inbound_messages` (usuário) + `whatsapp_outbound_replies` (assistente),
 * mesclados por `createdAt`. Isolamento entre conversas de remetentes diferentes é estrutural —
 * toda consulta é sempre filtrada por `phoneE164`, nunca existe uma consulta "global".
 */

const DEFAULT_HISTORY_LIMIT = 10;

/**
 * Missão Z6.6 (testes obrigatórios 12/13) — extraída como função pura (nunca I/O) para ser
 * diretamente testável: dados os turnos de usuário e assistente já buscados (SEMPRE já filtrados
 * por telefone por quem chama — nunca uma lista "global"), mescla por `createdAt` e devolve só os
 * últimos `limit`. Isolamento entre conversas de remetentes diferentes é estrutural, não algo que
 * esta função decida — ela nunca vê dado de mais de um telefone ao mesmo tempo.
 */
export function mergeConversationHistory(
  inboundRows: Array<{ content: string | null; createdAt: Date }>,
  outboundRows: Array<{ content: string; createdAt: Date }>,
  limit: number = DEFAULT_HISTORY_LIMIT,
): GenerativeMessage[] {
  const merged: Array<GenerativeMessage & { createdAt: Date }> = [
    ...inboundRows.filter((r): r is { content: string; createdAt: Date } => r.content !== null).map((r) => ({ role: "user" as const, content: r.content, createdAt: r.createdAt })),
    ...outboundRows.map((r) => ({ role: "assistant" as const, content: r.content, createdAt: r.createdAt })),
  ];

  merged.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return merged.slice(-limit).map(({ role, content }) => ({ role, content }));
}

export async function getConversationHistory(phoneE164: string, limit: number = DEFAULT_HISTORY_LIMIT): Promise<GenerativeMessage[]> {
  const db = getDb();
  if (!db) return [];

  const [inboundRows, outboundRows] = await Promise.all([
    db
      .select({ content: inboundMessages.textBody, createdAt: inboundMessages.createdAt })
      .from(inboundMessages)
      .where(and(eq(inboundMessages.phoneE164, phoneE164), eq(inboundMessages.active, true), isNotNull(inboundMessages.textBody))),
    db
      .select({ content: whatsappOutboundReplies.content, createdAt: whatsappOutboundReplies.createdAt })
      .from(whatsappOutboundReplies)
      .where(and(eq(whatsappOutboundReplies.phoneE164, phoneE164), eq(whatsappOutboundReplies.active, true))),
  ]);

  return mergeConversationHistory(inboundRows, outboundRows, limit);
}

export interface OutboundReplyRecord {
  id: string;
  phoneE164: string;
  content: string;
  triggeredByExternalMessageId: string;
  externalMessageId: string | null;
  status: "pendente" | "enviada" | "falha_envio" | "envio_desabilitado";
  sendResult: string | null;
}

function toRecord(row: typeof whatsappOutboundReplies.$inferSelect): OutboundReplyRecord {
  return {
    id: row.id,
    phoneE164: row.phoneE164,
    content: row.content,
    triggeredByExternalMessageId: row.triggeredByExternalMessageId,
    externalMessageId: row.externalMessageId,
    status: row.status,
    sendResult: row.sendResult,
  };
}

/** Idempotência de SAÍDA: o mesmo `triggeredByExternalMessageId` (reentrega real do webhook) nunca gera uma segunda resposta. */
export async function findExistingReplyForInbound(triggeredByExternalMessageId: string): Promise<OutboundReplyRecord | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db.select().from(whatsappOutboundReplies).where(eq(whatsappOutboundReplies.triggeredByExternalMessageId, triggeredByExternalMessageId)).limit(1);
  return row ? toRecord(row) : null;
}

/** Mesmo padrão idempotente de `queueMessageForApproval`/`recordInboundMessage`: `onConflictDoNothing` + fallback select. */
export async function recordOutboundReply(input: { phoneE164: string; content: string; triggeredByExternalMessageId: string }): Promise<OutboundReplyRecord> {
  const db = getDb();
  if (!db) throw new DatabaseUnavailableError();

  const inserted = await db
    .insert(whatsappOutboundReplies)
    .values({
      phoneE164: input.phoneE164,
      content: input.content,
      triggeredByExternalMessageId: input.triggeredByExternalMessageId,
      source: "zezinho_whatsapp_conversacional",
    })
    .onConflictDoNothing({ target: whatsappOutboundReplies.triggeredByExternalMessageId })
    .returning();

  if (inserted[0]) return toRecord(inserted[0]);

  const [existing] = await db.select().from(whatsappOutboundReplies).where(eq(whatsappOutboundReplies.triggeredByExternalMessageId, input.triggeredByExternalMessageId)).limit(1);
  if (!existing) throw new Error(`Falha ao criar ou recuperar resposta para triggeredByExternalMessageId "${input.triggeredByExternalMessageId}".`);
  return toRecord(existing);
}

export async function updateOutboundReplyStatus(id: string, update: { status: OutboundReplyRecord["status"]; externalMessageId?: string | null; sendResult: string }): Promise<void> {
  const db = getDb();
  if (!db) throw new DatabaseUnavailableError();
  await db
    .update(whatsappOutboundReplies)
    .set({ status: update.status, externalMessageId: update.externalMessageId ?? null, sendResult: update.sendResult, updatedAt: new Date() })
    .where(eq(whatsappOutboundReplies.id, id));
}
