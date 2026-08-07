import { date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";

/**
 * Missão 28 (revisão segura de identidade) — nível de confiança do vínculo de identidade de um
 * cliente `source = 'jumppark'`, conforme a hierarquia documentada em
 * `src/lib/crm/normalize.ts`/`src/lib/integrations/jumppark/customers.ts`:
 *   - `confirmado`: identificador estruturado da JumpPark ou telefone completo normalizado —
 *     nenhum dos dois existe nesta integração hoje (telefone sempre chega mascarado), então esta
 *     categoria fica vazia até a fonte fornecer um dos dois. Não removida por documentar a meta.
 *   - `provavel`: nome normalizado com 2+ termos (mais poder discriminante que um primeiro nome
 *     sozinho), consistente nas ordens.
 *   - `provisorio`: identidade baseada só em nome — a maioria dos casos hoje. Nunca deve ser
 *     tratada como prova definitiva de que duas ordens são da mesma pessoa.
 *   - `ambiguo`: nome de um único token (ex.: só "Lucas") associado a mais de uma placa distinta
 *     nas ordens — sinal real de possível fusão de homônimos, sem evidência suficiente para
 *     separar automaticamente. Vai para a fila de revisão manual.
 */
export const identityConfidenceEnum = pgEnum("identity_confidence", ["confirmado", "provavel", "provisorio", "ambiguo"]);

/** Status da decisão manual de um item da fila "Identidades para revisar" — sempre reversível (nunca apaga o item, só muda o status/decisão). */
export const identityReviewStatusEnum = pgEnum("identity_review_status", ["pending", "kept_separate", "deferred"]);

export const customers = pgTable("customers", {
  id: id(),
  name: text("name"),
  /** Telefone completo, se disponível — máscara é responsabilidade da camada de apresentação. */
  phone: text("phone"),
  /** Opcional — nem todo cliente informa CPF no atendimento. */
  cpf: text("cpf"),
  email: text("email"),
  segment: text("segment"),
  totalSpent: numeric("total_spent", { precision: 12, scale: 2 }),
  lastVisit: date("last_visit"),
  /**
   * Missão 26 (Fase 1, CRM derivado da JumpPark) — campos aditivos, preenchidos só para
   * `source = 'jumppark'` (nunca para clientes cadastrados manualmente no Atendimento, que não
   * usam estes campos). `externalId` vira a chave de idempotência da sincronização (identityKey:
   * telefone normalizado > nome normalizado, ver src/lib/crm/normalize.ts) — por isso agora é
   * `unique()` (nulo continua permitido e não conflita entre si, para os clientes manuais).
   */
  firstVisitAt: date("first_visit_at"),
  visitCount: integer("visit_count"),
  averageTicket: numeric("average_ticket", { precision: 12, scale: 2 }),
  /** Ordens com valor de serviço/lavação > 0 — proxy real e honesto para "quantidade de serviços": não há lista de serviços por nome persistida (ver docs da Missão 26). */
  servicesOrderCount: integer("services_order_count"),
  /**
   * Missão 28 — classificação auditável do vínculo de identidade (ver `identityConfidenceEnum`
   * acima). Recalculada a cada sincronização, junto com o resto do registro — puramente derivada
   * dos dados, nunca de uma decisão manual (decisões manuais vivem em `identity_review_items`).
   */
  identityConfidence: identityConfidenceEnum("identity_confidence").notNull().default("provisorio"),
  identityConfidenceReason: text("identity_confidence_reason"),
  active: active(),
  source: source(),
  externalId: externalId().unique(),
  notes: notes(),
  ...timestamps,
});

export const vehicles = pgTable("vehicles", {
  id: id(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id),
  plate: text("plate"),
  brand: text("brand"),
  model: text("model"),
  year: integer("year"),
  color: text("color"),
  /** Missão 26 — mesmo raciocínio de `customers` acima. `externalId` guarda a placa mascarada (`plate:<mascarada>`) — nunca a placa real, que a JumpPark não fornece nesta integração. */
  firstSeenAt: date("first_seen_at"),
  lastSeenAt: date("last_seen_at"),
  visitCount: integer("visit_count"),
  active: active(),
  source: source(),
  externalId: externalId().unique(),
  notes: notes(),
  ...timestamps,
});

/**
 * Missão 28 (revisão segura de identidade) — fila "Identidades para revisar": um item por placa
 * mascarada associada a mais de um nome de cliente distinto nas ordens da JumpPark (evidência
 * real de possível homônimo, nunca fundido automaticamente). Recalculada a cada sincronização
 * (`refreshJumpParkCustomers`), que faz upsert por `subjectKey` e SÓ atualiza as colunas de
 * evidência (`evidence`, `rule`, `confidence`, `plateMasked`) — nunca `status`/`decidedAt`/
 * `decidedNotes`, para nunca apagar uma decisão manual já tomada. Itens cuja evidência deixou de
 * existir num recálculo (ex.: só sobrou 1 nome distinto para a placa) são marcados `active =
 * false` em vez de apagados — preserva o histórico e permite reverter.
 */
export const identityReviewItems = pgTable(
  "identity_review_items",
  {
    id: id(),
    /** Chave natural estável do item — hoje sempre `plate:<placaMascarada>`; único para permitir upsert idempotente a cada recálculo. */
    subjectKey: text("subject_key").notNull().unique(),
    plateMasked: text("plate_masked").notNull(),
    confidence: identityConfidenceEnum("confidence").notNull().default("ambiguo"),
    /** Descrição em linguagem direta da regra/evidência que gerou este item — auditável, exibida na fila. */
    rule: text("rule").notNull(),
    /**
     * Evidência completa capturada no momento do recálculo — candidatos (clientes existentes
     * associados a esta placa) e ordens sem cliente resolvido que compartilham a mesma placa.
     * Formato: `{ candidates: {customerId, customerExternalId, name, visitCount, totalSpent,
     * orderIds}[], unresolvedOrders: {orderId, orderExternalId, orderDate, vehicleModel,
     * totalAmount}[] }`. Guardada crua (jsonb) para exibir "lado a lado" na UI sem recalcular.
     */
    evidence: jsonb("evidence").notNull(),
    status: identityReviewStatusEnum("status").notNull().default("pending"),
    /** Preenchidos só pela ação manual (`identity-review/actions.ts`) — nunca pelo recálculo automático. Reversível: decidir de novo troca status/decidedAt/decidedNotes livremente. */
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedNotes: text("decided_notes"),
    active: active(),
    source: source(),
    notes: notes(),
    ...timestamps,
  },
  (table) => [index("identity_review_items_status_idx").on(table.status)],
);
