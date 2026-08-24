import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { active, id, notes, source, timestamps } from "./common";
import { users } from "./auth";
import { customers } from "./crm";

/**
 * Missão Z6.2 (preparação do canal WhatsApp Cloud API — Meta) — estruturas de RECEBIMENTO e de
 * identidade administrativa. Nenhuma delas é alcançável hoje: não existe rota de webhook ativa
 * chamando `recordInboundMessage`/`resolveAdminActorFromPhone` de verdade em produção (a rota
 * existe, mas `WHATSAPP_ENABLED` nunca é `true` nesta fase — ver
 * `src/lib/integrations/whatsapp/config.ts`). Uma mensagem recebida NUNCA pode, sozinha, executar
 * uma ação administrativa — isso continua exigindo `whatsappAdminNumbers` + um `actor` real
 * resolvido a partir do telefone verificado, nunca do texto da mensagem (mesmo princípio de
 * soberania de RBAC desde a Missão Z1).
 */

/** Mensagem recebida via WhatsApp (Meta) — dedupe por `externalMessageId` (o `wamid` da Meta), nunca pelo conteúdo. */
export const inboundMessages = pgTable("inbound_messages", {
  id: id(),
  /** Telefone normalizado (E.164, ex.: "+5511999998888") de quem enviou — nunca o valor bruto do payload. */
  phoneE164: text("phone_e164").notNull(),
  /** `wamid` da Meta — único por mensagem real; um webhook duplicado (reentrega) nunca cria um segundo registro. */
  externalMessageId: text("external_message_id").notNull().unique(),
  /** Resolvido por telefone quando existe um cliente conhecido — null é um resultado válido e comum. */
  customerId: uuid("customer_id").references(() => customers.id),
  /** Tipo bruto reportado pela Meta (ex.: "text", "image", "unknown") — texto livre, nunca um enum fechado que rejeitaria um tipo novo da Meta. */
  messageType: text("message_type").notNull().default("desconhecido"),
  /** Só preenchido quando `messageType` for texto — nunca vazado em log fora desta tabela. */
  textBody: text("text_body"),
  /** Timestamp reportado pela própria Meta no evento, não `createdAt` (quando persistimos). */
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  active: active(),
  source: source(),
  notes: notes(),
  ...timestamps,
});

/**
 * Allowlist de números administrativos — vazia por padrão (nenhuma linha inserida nesta missão,
 * "não preencher número inventado"). Cada entrada vincula um telefone normalizado a um `users.id`
 * REAL já existente — nunca um nome solto — para que "gestor pelo WhatsApp" (missão futura) possa
 * resolver um `actor` verdadeiro a partir do número verificado do remetente, nunca do conteúdo da
 * mensagem. Desenho de tabela (não variável de ambiente `ADMIN_WHATSAPP_NUMBERS`) por consistência
 * com o padrão já estabelecido do projeto para configuração sensível auditável (mesmo padrão de
 * `autonomy_settings`/`commercial_policy`) — uma lista solta em env var não teria como registrar
 * quem adicionou cada número nem vincular a um usuário real.
 */
export const whatsappAdminNumbers = pgTable("whatsapp_admin_numbers", {
  id: id(),
  phoneE164: text("phone_e164").notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id),
  addedByUserId: uuid("added_by_user_id").references(() => users.id),
  addedByName: text("added_by_name"),
  active: active(),
  source: source(),
  notes: notes(),
  ...timestamps,
});

export type InboundMessageRow = typeof inboundMessages.$inferSelect;
export type WhatsappAdminNumberRow = typeof whatsappAdminNumbers.$inferSelect;
