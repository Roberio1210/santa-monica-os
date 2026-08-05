import { date, integer, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";

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
