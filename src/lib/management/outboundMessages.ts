import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { autonomySettings, outboundMessages } from "@/db/schema";
import type { UserRole } from "@/lib/auth/roles";

/**
 * Missão "Regra Absoluta de Envio" — o único caminho de código que pode marcar uma mensagem como
 * enviada é `sendApprovedOutboundMessage` abaixo, e ela SEMPRE recusa qualquer registro cujo
 * status não seja "aprovada". Não existe nenhuma outra função de escrita neste arquivo que altere
 * `status` para "enviada" — um futuro cron/webhook/retry que queira enviar uma mensagem
 * PRECISA passar por esta mesma função, então precisa da mesma aprovação real e específica.
 *
 * Identidade de quem aprova/descarta vem SEMPRE de `actor` (resolvido pelo chamador a partir da
 * sessão autenticada real — nunca do texto da conversa) — mesmo princípio de soberania já usado
 * pelo RBAC desde a Missão Z1 ("autorização nunca vem do que a pessoa diz na conversa").
 */

export type OutboundMessageKind = "pos_venda" | "reativacao" | "manual" | "outro";
export type OutboundMessageStatus = "rascunho" | "aprovada" | "descartada" | "enviada" | "falha_envio";
export type AutonomyLevel = "MANUAL_APPROVAL" | "LIMITED_AUTONOMY" | "FULL_AUTONOMY";

export interface Actor {
  id: string;
  name: string;
}

export interface OutboundMessageRecord {
  id: string;
  kind: OutboundMessageKind;
  channel: string;
  /** Referência canônica para resolver o telefone completo só no momento do envio (Missão Z6.2) — nunca o telefone em si. */
  customerId: string | null;
  customerName: string | null;
  vehicleModel: string | null;
  phoneMasked: string | null;
  reason: string;
  draftText: string;
  finalText: string | null;
  status: OutboundMessageStatus;
  approvedByName: string | null;
  approvedAt: string | null;
  discardedByName: string | null;
  discardedAt: string | null;
  sentAt: string | null;
  sendResult: string | null;
  provider: string | null;
  externalMessageId: string | null;
  createdAt: string;
}

function toRecord(row: typeof outboundMessages.$inferSelect): OutboundMessageRecord {
  return {
    id: row.id,
    kind: row.kind,
    channel: row.channel,
    customerId: row.customerId,
    customerName: row.customerName,
    vehicleModel: row.vehicleModel,
    phoneMasked: row.phoneMasked,
    reason: row.reason,
    draftText: row.draftText,
    finalText: row.finalText,
    status: row.status,
    approvedByName: row.approvedByName,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    discardedByName: row.discardedByName,
    discardedAt: row.discardedAt ? row.discardedAt.toISOString() : null,
    sentAt: row.sentAt ? row.sentAt.toISOString() : null,
    sendResult: row.sendResult,
    provider: row.provider,
    externalMessageId: row.externalMessageId,
    createdAt: row.createdAt.toISOString(),
  };
}

export class DatabaseUnavailableError extends Error {
  constructor() {
    super("Banco de dados não configurado neste ambiente.");
  }
}

/**
 * Cria (ou recupera, se já existir) um rascunho de mensagem pendente de aprovação — nunca a
 * envia. `dedupeKey` garante que a mesma consulta de candidatos, chamada de novo no mesmo dia,
 * nunca duplica o rascunho do mesmo cliente/motivo.
 */
export async function queueMessageForApproval(input: {
  kind: OutboundMessageKind;
  /** Missão Z6.2 — referência real do CRM quando disponível (ex.: `inactive_customers`). Nunca inventado; `null` quando o candidato não tem essa referência (ex.: `post_sale_candidates`, ver `postSale.ts`). */
  customerId?: string | null;
  customerName: string | null;
  vehicleModel: string | null;
  phoneMasked: string | null;
  reason: string;
  draftText: string;
  dedupeKey: string;
}): Promise<OutboundMessageRecord> {
  const db = getDb();
  if (!db) throw new DatabaseUnavailableError();

  const inserted = await db
    .insert(outboundMessages)
    .values({
      kind: input.kind,
      customerId: input.customerId ?? null,
      customerName: input.customerName,
      vehicleModel: input.vehicleModel,
      phoneMasked: input.phoneMasked,
      reason: input.reason,
      draftText: input.draftText,
      dedupeKey: input.dedupeKey,
      source: "zezinho",
    })
    .onConflictDoNothing({ target: outboundMessages.dedupeKey })
    .returning();

  if (inserted[0]) return toRecord(inserted[0]);

  const [existing] = await db.select().from(outboundMessages).where(eq(outboundMessages.dedupeKey, input.dedupeKey)).limit(1);
  if (!existing) throw new Error(`Falha ao criar ou recuperar rascunho para dedupeKey "${input.dedupeKey}".`);
  return toRecord(existing);
}

/** Mensagens que ainda precisam de uma decisão do gestor (pré-visualização obrigatória antes de aprovar). */
export async function listPendingApprovals(): Promise<OutboundMessageRecord[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await db.select().from(outboundMessages).where(and(eq(outboundMessages.status, "rascunho"), eq(outboundMessages.active, true)));
  return rows.map(toRecord);
}

export interface DecisionResult {
  succeeded: OutboundMessageRecord[];
  /** Ids pedidos que não existem — nunca finge sucesso. */
  notFound: string[];
  /** Ids que já tinham uma decisão registrada (não estavam em "rascunho") — nunca sobrescreve uma decisão anterior. */
  alreadyDecided: string[];
}

interface MinimalStatusRow {
  id: string;
  status: OutboundMessageStatus;
}

/**
 * Pura — separa os ids pedidos em "existem e estão em rascunho" (podem ser decididos agora),
 * "não encontrados" e "já tinham uma decisão" (nunca sobrescreve uma decisão anterior, seja ela
 * aprovação, descarte ou envio). Mesma lógica usada tanto por aprovação quanto por descarte —
 * nunca duas implementações divergentes do mesmo critério.
 */
export function partitionIdsByStatus<T extends MinimalStatusRow>(ids: string[], rows: T[]): { toDecide: T[]; notFound: string[]; alreadyDecided: string[] } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const toDecide: T[] = [];
  const notFound: string[] = [];
  const alreadyDecided: string[] = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) { notFound.push(id); continue; }
    if (row.status !== "rascunho") { alreadyDecided.push(id); continue; }
    toDecide.push(row);
  }
  return { toDecide, notFound, alreadyDecided };
}

/** Pura — texto final de envio: o editado (quando não vazio) ou o rascunho original. O rascunho em si nunca é alterado por esta função nem por quem a chama. */
export function resolveFinalText(draftText: string, editedText: string | undefined): string {
  const trimmed = editedText?.trim();
  return trimmed ? trimmed : draftText;
}

/**
 * Aprova mensagens específicas (nunca "todas as pendentes" implicitamente — o chamador sempre
 * lista os ids exatos). `edits[id]` é o texto final quando o gestor editou antes de aprovar;
 * `draftText` NUNCA é sobrescrito — só `finalText` passa a valer para o envio.
 */
export async function approveMessages(ids: string[], actor: Actor, edits: Record<string, string> = {}): Promise<DecisionResult> {
  const db = getDb();
  if (!db) throw new DatabaseUnavailableError();
  if (ids.length === 0) return { succeeded: [], notFound: [], alreadyDecided: [] };

  const rows = await db.select().from(outboundMessages).where(inArray(outboundMessages.id, ids));
  const { toDecide, notFound, alreadyDecided } = partitionIdsByStatus(ids, rows);

  const succeeded: OutboundMessageRecord[] = [];
  for (const row of toDecide) {
    const finalText = resolveFinalText(row.draftText, edits[row.id]);
    const [updated] = await db
      .update(outboundMessages)
      .set({ status: "aprovada", finalText, approvedByUserId: actor.id, approvedByName: actor.name, approvedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(outboundMessages.id, row.id), eq(outboundMessages.status, "rascunho")))
      .returning();
    if (updated) succeeded.push(toRecord(updated));
    else alreadyDecided.push(row.id); // corrida rara: outra aprovação venceu entre o select e o update
  }

  return { succeeded, notFound, alreadyDecided };
}

/** Descarta mensagens específicas — nunca envia, nunca aprova. Só a partir de "rascunho" (uma mensagem já aprovada exige descartar a aprovação primeiro, não implementado nesta missão). */
export async function discardMessages(ids: string[], actor: Actor): Promise<DecisionResult> {
  const db = getDb();
  if (!db) throw new DatabaseUnavailableError();
  if (ids.length === 0) return { succeeded: [], notFound: [], alreadyDecided: [] };

  const rows = await db.select().from(outboundMessages).where(inArray(outboundMessages.id, ids));
  const { toDecide, notFound, alreadyDecided } = partitionIdsByStatus(ids, rows);

  const succeeded: OutboundMessageRecord[] = [];
  for (const row of toDecide) {
    const [updated] = await db
      .update(outboundMessages)
      .set({ status: "descartada", discardedByUserId: actor.id, discardedByName: actor.name, discardedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(outboundMessages.id, row.id), eq(outboundMessages.status, "rascunho")))
      .returning();
    if (updated) succeeded.push(toRecord(updated));
    else alreadyDecided.push(row.id);
  }

  return { succeeded, notFound, alreadyDecided };
}

export class OutboundMessageNotApprovedError extends Error {
  constructor(id: string, actualStatus: OutboundMessageStatus) {
    super(`Mensagem ${id} não pode ser enviada — status atual é "${actualStatus}", não "aprovada". Nenhum envio ocorre sem aprovação explícita e específica do gestor.`);
  }
}

/**
 * Pura — O GATE em forma testável sem banco: dado o status real de uma mensagem, decide se o
 * envio pode prosseguir. `sendApprovedOutboundMessage` usa exatamente esta função — qualquer
 * chamador (chat, um futuro cron, webhook, retry) que tente enviar passa por aqui e recebe a
 * mesma recusa para qualquer status que não seja "aprovada".
 */
export function assertMessageApproved(id: string, status: OutboundMessageStatus): void {
  if (status !== "aprovada") throw new OutboundMessageNotApprovedError(id, status);
}

/** Canal de envio real — pluginável para quando WhatsApp (ou outro canal) for implementado numa missão futura. Nunca fabrica sucesso. */
export interface MessageChannel {
  /** Identifica qual canal foi de fato usado (ex.: "whatsapp_cloud_api") — gravado em `outbound_messages.provider`, nunca a credencial. */
  provider: string;
  send(message: OutboundMessageRecord): Promise<{ success: boolean; result: string; externalMessageId?: string }>;
}

/** Canal padrão desta fase — nenhum canal real está configurado, então nunca finge ter enviado. */
export const unconfiguredChannel: MessageChannel = {
  provider: "nenhum",
  async send() {
    return { success: false, result: "Canal de envio (WhatsApp) ainda não configurado neste ambiente." };
  },
};

/**
 * O GATE — único ponto que pode transformar "aprovada" em "enviada". Recusa QUALQUER outro
 * status, não importa quem/o que chame esta função (chat do Zézinho, um futuro cron, um futuro
 * webhook, uma retentativa) — não há como contornar sem reescrever esta função inteira.
 */
export async function sendApprovedOutboundMessage(id: string, channel: MessageChannel = unconfiguredChannel): Promise<OutboundMessageRecord> {
  const db = getDb();
  if (!db) throw new DatabaseUnavailableError();

  const [row] = await db.select().from(outboundMessages).where(eq(outboundMessages.id, id)).limit(1);
  if (!row) throw new Error(`Mensagem ${id} não encontrada.`);
  assertMessageApproved(id, row.status);

  const outcome = await channel.send(toRecord(row));
  const [updated] = await db
    .update(outboundMessages)
    .set({
      status: outcome.success ? "enviada" : "falha_envio",
      sentAt: outcome.success ? new Date() : row.sentAt,
      sendResult: outcome.result,
      provider: channel.provider,
      externalMessageId: outcome.externalMessageId ?? row.externalMessageId,
      updatedAt: new Date(),
    })
    .where(and(eq(outboundMessages.id, id), eq(outboundMessages.status, "aprovada")))
    .returning();

  if (!updated) throw new OutboundMessageNotApprovedError(id, "rascunho"); // corrida rara: status mudou entre o select e o update
  return toRecord(updated);
}

/** Nunca lança — sem configuração real, o padrão seguro é sempre MANUAL_APPROVAL (nunca uma autonomia maior por omissão). */
export async function getAutonomyLevel(): Promise<AutonomyLevel> {
  const db = getDb();
  if (!db) return "MANUAL_APPROVAL";
  const [row] = await db.select().from(autonomySettings).where(eq(autonomySettings.active, true)).limit(1);
  return row?.level ?? "MANUAL_APPROVAL";
}

export class AutonomyChangeForbiddenError extends Error {}

/**
 * Preparado para o futuro, mas travado nesta fase: só ADMIN pode chamar, e mesmo um ADMIN só
 * pode confirmar MANUAL_APPROVAL — qualquer outro nível é recusado explicitamente ("Nenhuma
 * configuração de produção pode iniciar em LIMITED_AUTONOMY ou FULL_AUTONOMY", regra da missão).
 * Uma missão futura, explícita, remove essa trava — nunca implicitamente.
 */
export async function setAutonomyLevel(level: AutonomyLevel, actor: Actor & { role: UserRole }): Promise<AutonomyLevel> {
  if (actor.role !== "admin") throw new AutonomyChangeForbiddenError("Somente ADMIN pode alterar o nível de autonomia de envio.");
  if (level !== "MANUAL_APPROVAL") {
    throw new AutonomyChangeForbiddenError(`Nível "${level}" ainda não está disponível nesta fase do projeto — a arquitetura está preparada, mas só MANUAL_APPROVAL pode ser ativado até uma missão futura liberar isso explicitamente.`);
  }

  const db = getDb();
  if (!db) throw new DatabaseUnavailableError();
  const [existing] = await db.select({ id: autonomySettings.id }).from(autonomySettings).where(eq(autonomySettings.active, true)).limit(1);
  if (existing) {
    await db.update(autonomySettings).set({ level, changedByUserId: actor.id, changedByName: actor.name, updatedAt: new Date() }).where(eq(autonomySettings.id, existing.id));
  } else {
    await db.insert(autonomySettings).values({ level, changedByUserId: actor.id, changedByName: actor.name, source: "manual" });
  }
  return level;
}
