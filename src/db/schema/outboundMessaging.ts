import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { active, id, notes, source, timestamps } from "./common";
import { users } from "./auth";
import { customers } from "./crm";

/**
 * Missão "Regra Absoluta de Envio" — o Zézinho NUNCA tem autonomia para enviar mensagem sozinho
 * nesta fase. Toda mensagem comercial/pós-venda/reativação nasce em `outbound_messages` com
 * status "rascunho" e só pode avançar através das funções de gate em
 * `src/lib/management/outboundMessages.ts` — nenhuma outra tabela/rota grava aqui diretamente,
 * então o gate não pode ser contornado por nenhum caminho de código (job, webhook, retry, etc.):
 * todos passariam pela mesma função ou pela mesma constraint de status.
 */

export const outboundMessageKindEnum = pgEnum("outbound_message_kind", ["pos_venda", "reativacao", "manual", "outro"]);

/**
 * rascunho -> aprovada -> enviada (só quando um canal real existir e confirmar entrega) ou
 * falha_envio; rascunho -> descartada a qualquer momento antes da aprovação. Nunca um caminho
 * "rascunho -> enviada" direto — é essa transição ausente que é a própria regra de negócio.
 */
export const outboundMessageStatusEnum = pgEnum("outbound_message_status", ["rascunho", "aprovada", "descartada", "enviada", "falha_envio"]);

export const outboundMessages = pgTable("outbound_messages", {
  id: id(),
  kind: outboundMessageKindEnum("kind").notNull(),
  /** Canal PRETENDIDO (ex.: "whatsapp") — nunca implica que um canal real está configurado; ver `channel.ts`. */
  channel: text("channel").notNull().default("whatsapp"),
  /**
   * Missão Z6.2 — resolução do destinatário POR REFERÊNCIA, nunca por telefone completo
   * armazenado aqui (fonte canônica é `customers.phone`). Null quando o candidato não veio do
   * CRM interno (ex.: `post_sale_candidates`, que vem só de dados soltos da JumpPark — ver
   * `postSale.ts`, não existe hoje uma chave confiável para cruzar com `customers`) — nesse caso
   * o envio real será corretamente bloqueado por telefone não resolvido, e essa é a decisão
   * correta, não uma falha desta missão.
   */
  customerId: uuid("customer_id").references(() => customers.id),
  customerName: text("customer_name"),
  vehicleModel: text("vehicle_model"),
  /** Sempre mascarado antes de chegar aqui — nunca o telefone completo (mesma política de `operational-view.ts`/`mask.ts`). */
  phoneMasked: text("phone_masked"),
  /** Motivo do contato (ex.: "Lavação concluída — bom candidato a avaliação", "Sumiu há 45 dias — cliente recorrente"). */
  reason: text("reason").notNull(),
  /** Texto sugerido originalmente pelo Zézinho — NUNCA sobrescrito depois, mesmo quando o gestor edita antes de aprovar. */
  draftText: text("draft_text").notNull(),
  /** Texto que será (ou foi) realmente enviado — preenchido só na aprovação; igual a `draftText` quando o gestor não editou. */
  finalText: text("final_text"),
  status: outboundMessageStatusEnum("status").notNull().default("rascunho"),
  /**
   * Quem aprovou — SEMPRE resolvido a partir da sessão autenticada real de quem chamou a função
   * de aprovação (mesmo princípio de soberania de RBAC da Missão Z1: nunca aceito como texto
   * livre do chat — "diz que fulano aprovou" não é aprovação de fulano).
   */
  approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
  approvedByName: text("approved_by_name"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  discardedByUserId: uuid("discarded_by_user_id").references(() => users.id),
  discardedByName: text("discarded_by_name"),
  discardedAt: timestamp("discarded_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  /** Resultado real do canal de envio (ex.: "Canal de envio (WhatsApp) ainda não configurado neste ambiente.") — nunca "enviada" inventada. */
  sendResult: text("send_result"),
  /** Qual `MessageChannel` foi de fato usado (ex.: "whatsapp_cloud_api") — nunca o token/credencial. */
  provider: text("provider"),
  /** Id da mensagem devolvido pelo provider real (ex.: `wamid...` da Meta) — só preenchido em envio bem-sucedido. */
  externalMessageId: text("external_message_id"),
  /** `${kind}:${identidade real do candidato}:${data}` — mesma chamada de post_sale_candidates/inactive_customers nunca duplica o rascunho do mesmo candidato no mesmo dia. */
  dedupeKey: text("dedupe_key").notNull().unique(),
  active: active(),
  source: source(),
  notes: notes(),
  ...timestamps,
});

/**
 * Nível de autonomia de envio — hoje só existe UM valor operacionalmente permitido
 * (MANUAL_APPROVAL, ver `outboundMessages.ts#setAutonomyLevel`, que recusa qualquer outro valor
 * nesta fase). LIMITED_AUTONOMY/FULL_AUTONOMY existem só como preparação de schema para uma
 * missão futura — nunca ativados aqui.
 */
export const autonomyLevelEnum = pgEnum("autonomy_level", ["MANUAL_APPROVAL", "LIMITED_AUTONOMY", "FULL_AUTONOMY"]);

/** Configuração única (mesmo padrão de `commercial_policy`, Z3.2) — nunca um KV genérico. */
export const autonomySettings = pgTable("autonomy_settings", {
  id: id(),
  level: autonomyLevelEnum("level").notNull().default("MANUAL_APPROVAL"),
  changedByUserId: uuid("changed_by_user_id").references(() => users.id),
  changedByName: text("changed_by_name"),
  active: active(),
  source: source(),
  notes: notes(),
  ...timestamps,
});
