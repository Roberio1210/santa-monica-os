import { integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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

/**
 * Missão Z6.6 — resposta CONVERSACIONAL do Zézinho para um administrador autorizado, enviada
 * diretamente pelo WhatsApp SEM o gate de aprovação de `outbound_messages` (Missão "Regra Absoluta
 * de Envio") — essa é uma trilha de governança DIFERENTE e deliberadamente separada: aprovação
 * manual continua obrigatória para mensagens comerciais/pós-venda/reativação a clientes (ver
 * `outbound_messages`/`assertMessageApproved`, intocados), mas uma resposta de CONVERSA para quem
 * já está verificado como admin (telefone, nunca texto) não precisa desse fluxo.
 *
 * `triggeredByExternalMessageId` é a idempotência de SAÍDA: UNIQUE, então o mesmo evento de
 * webhook (reentrega real da Meta) nunca gera uma segunda resposta nem uma segunda chamada de
 * envio, mesmo que o processamento seja repetido.
 *
 * Junto com `inbound_messages` (turnos do usuário), esta tabela é a fonte de verdade do histórico
 * de conversa por telefone (turnos do assistente) — reconstruído sob demanda, nunca um blob JSON
 * solto, mesmo estilo linha-por-evento do resto do schema.
 *
 * Missão Z6.7 (achado real: "enviada" não prova entrega) — `status` (`accepted`/`pendente`/
 * `falha_envio`/`envio_desabilitado`) descreve só se a NOSSA chamada POST à Graph API teve
 * sucesso — nunca o destino final da mensagem. O valor antigo "enviada" foi renomeado para
 * "accepted" (via `ALTER TYPE ... RENAME VALUE`, migração 100% segura — nenhuma linha existente é
 * reescrita, só o rótulo do enum muda) porque "enviada" sugeria entrega, e nunca provou isso.
 *
 * `deliveryStatus` é um campo SEPARADO: o que a Meta de fato confirmou depois, de forma
 * assíncrona, via `value.statuses[]` no mesmo webhook (correlacionado por `externalMessageId`,
 * nunca por `triggeredByExternalMessageId` — que é o wamid do INBOUND, um objeto diferente).
 * Puramente "last write wins" — cada evento novo substitui o status anterior; não impede
 * atualizações fora de ordem (limitação conhecida, aceitável nesta fase).
 */
export const whatsappOutboundReplyStatusEnum = pgEnum("whatsapp_outbound_reply_status", ["pendente", "accepted", "falha_envio", "envio_desabilitado"]);

/** Estados que a própria Meta reporta de volta via `value.statuses[].status` — vocabulário dela, nunca traduzido. */
export const whatsappDeliveryStatusEnum = pgEnum("whatsapp_delivery_status", ["desconhecido", "sent", "delivered", "read", "failed"]);

export const whatsappOutboundReplies = pgTable("whatsapp_outbound_replies", {
  id: id(),
  phoneE164: text("phone_e164").notNull(),
  content: text("content").notNull(),
  /** wamid do INBOUND que originou esta resposta — a idempotência de saída de verdade. */
  triggeredByExternalMessageId: text("triggered_by_external_message_id").notNull().unique(),
  /** wamid devolvido pela Meta quando o envio real é bem-sucedido — null enquanto pendente/desabilitado/falho. */
  externalMessageId: text("external_message_id"),
  /** Só descreve o resultado da NOSSA chamada POST — nunca a entrega final (ver `deliveryStatus`). */
  status: whatsappOutboundReplyStatusEnum("status").notNull().default("pendente"),
  /** Resultado seguro do canal (nunca token/segredo) — ex.: "WhatsApp Cloud API desabilitado neste ambiente.". */
  sendResult: text("send_result"),
  /** Missão Z6.7 — última confirmação assíncrona da Meta sobre o destino real da mensagem. */
  deliveryStatus: whatsappDeliveryStatusEnum("delivery_status").notNull().default("desconhecido"),
  deliveryStatusUpdatedAt: timestamp("delivery_status_updated_at", { withTimezone: true }),
  /** Preenchidos só quando `deliveryStatus = "failed"` e a Meta reportou `errors[]` no evento de status — nunca credencial. */
  deliveryErrorCode: integer("delivery_error_code"),
  deliveryErrorTitle: text("delivery_error_title"),
  deliveryErrorMessage: text("delivery_error_message"),
  deliveryErrorHref: text("delivery_error_href"),
  /** `error_data` do primeiro erro (ex.: `{details: "..."}`) — objeto bruto, formato definido pela Meta. */
  deliveryErrorData: jsonb("delivery_error_data"),
  /** Array `errors[]` completo, bruto — rede de segurança: mesmo que a extração estruturada acima não cubra um campo novo da Meta, nada se perde. */
  deliveryRawErrors: jsonb("delivery_raw_errors"),
  active: active(),
  source: source(),
  notes: notes(),
  ...timestamps,
});

export type InboundMessageRow = typeof inboundMessages.$inferSelect;
export type WhatsappAdminNumberRow = typeof whatsappAdminNumbers.$inferSelect;
export type WhatsappOutboundReplyRow = typeof whatsappOutboundReplies.$inferSelect;
