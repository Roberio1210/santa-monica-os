import { boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";
import { customers, vehicles } from "./crm";

/**
 * Modelo de destino para a sincronização descrita em docs/jumppark-sync-strategy.md.
 * Nenhum cron ou sincronização automática é executado nesta tarefa — apenas a estrutura.
 */
export const jumpParkServiceOrders = pgTable("jumppark_service_orders", {
  id: id(),
  /** serviceOrderId do JumpPark — chave de idempotência (unique). */
  externalId: text("external_id").notNull().unique(),
  code: text("code"),
  entryTime: text("entry_time"),
  exitTime: text("exit_time"),
  orderDate: date("order_date").notNull(),
  plateMasked: text("plate_masked"),
  vehicleModel: text("vehicle_model"),
  clientName: text("client_name"),
  clientPhoneMasked: text("client_phone_masked"),
  parkingAmount: numeric("parking_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  servicesAmount: numeric("services_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  paymentMethod: text("payment_method"),
  situation: text("situation"),
  /**
   * Missão 27 (backfill + enriquecimento) — campos reais adicionais documentados em
   * docs/jumppark-data-map.md, ausentes na primeira entrega (que só persistia os agregados
   * mínimos). Todos nulos quando a API não retornou o campo naquela ordem — nunca inferidos.
   */
  vehicleColor: text("vehicle_color"),
  /** Só preenchido quando a JumpPark realmente retorna um e-mail — raramente populado (ver docs/jumppark-data-map.md). */
  clientEmail: text("client_email"),
  /** Operador que registrou a entrada (`userName` na API). Não é "responsável pelo cliente" — é o único campo de responsável disponível na fonte. */
  staffEntryName: text("staff_entry_name"),
  /** Operador que registrou a saída (`userOutputName` na API). */
  staffExitName: text("staff_exit_name"),
  operationSituationName: text("operation_situation_name"),
  situationId: integer("situation_id"),
  financialSituationId: integer("financial_situation_id"),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }),
  discountType: text("discount_type"),
  /** Indicador observado de tabela de preço (ex.: possível sinal de mensalista) — não confirmado, ver docs/jumppark-data-map.md. */
  typePrice: text("type_price"),
  cardCode: integer("card_code"),
  establishmentId: text("establishment_id"),
  establishmentName: text("establishment_name"),
  /** Objeto observation/editObservation/cancelObservation/deleteObservation/changePriceObservation, cru. */
  observations: jsonb("observations"),
  /**
   * JSON bruto da ordem, SOMENTE quando já sanitizado (sem telefone/nome completo em claro) —
   * ver docs/jumppark-sync-strategy.md, seção "Preservação do payload bruto". Null por padrão.
   */
  rawPayloadSanitized: jsonb("raw_payload_sanitized"),
  /**
   * Missão 26 (Fase 1, CRM derivado) — preenchidos pelo mesmo passo que atualiza `customers`/
   * `vehicles` a cada sincronização (nunca escritos manualmente). Nulos quando a ordem não tem
   * telefone nem nome (sem identidade possível) ou não tem placa. Permite abrir o histórico
   * completo de um cliente/veículo com uma consulta indexada, sem recalcular identidade a cada
   * visualização.
   */
  customerId: uuid("customer_id").references(() => customers.id),
  vehicleId: uuid("vehicle_id").references(() => vehicles.id),
  /**
   * Missão 28 (revisão segura de identidade) — `true` só quando um humano vinculou esta ordem a
   * um cliente pela fila "Identidades para revisar" (`identity-review/actions.ts`). Enquanto
   * `true`, o recálculo automático (`refreshJumpParkCustomers`) nunca sobrescreve `customer_id`/
   * `vehicle_id` desta ordem — é assim que uma decisão manual sobrevive ao recálculo completo a
   * cada sincronização. `false` (padrão) significa "vínculo 100% derivado dos dados", livre para
   * o recálculo ajustar (inclusive desfazer, se a evidência mudar).
   */
  customerLinkLocked: boolean("customer_link_locked").notNull().default(false),
  active: active(),
  source: source(),
  notes: notes(),
  ...timestamps,
}, (table) => [index("jumppark_service_orders_customer_id_idx").on(table.customerId), index("jumppark_service_orders_vehicle_id_idx").on(table.vehicleId)]);

/**
 * Missão 27 — serviços individuais por ordem (`services[]` da API, ver docs/jumppark-data-map.md).
 * Sem chave natural por item na fonte: a cada sincronização da ordem, os itens existentes são
 * apagados e reinseridos (full-replace), igual ao padrão já usado no recálculo de Clientes/Veículos
 * — nunca acumula duplicata, sempre reflete o payload mais recente daquela ordem.
 */
export const jumpParkServiceOrderItems = pgTable("jumppark_service_order_items", {
  id: id(),
  serviceOrderId: uuid("service_order_id").notNull().references(() => jumpParkServiceOrders.id, { onDelete: "cascade" }),
  description: text("description"),
  quantity: integer("quantity"),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  /** serviceContractId cru da API — significado não confirmado (ver docs/jumppark-data-map.md). */
  serviceContractId: text("service_contract_id"),
  /** commissioners cru da API — estrutura não documentada, preservado como veio. */
  commissioners: jsonb("commissioners"),
  source: source(),
  ...timestamps,
}, (table) => [index("jumppark_service_order_items_service_order_id_idx").on(table.serviceOrderId)]);

export const syncStatusEnum = pgEnum("sync_status", ["running", "success", "partial", "error"]);

export const jumpParkSyncLogs = pgTable("jumppark_sync_logs", {
  id: id(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: syncStatusEnum("status").notNull().default("running"),
  dateRangeStart: date("date_range_start").notNull(),
  dateRangeEnd: date("date_range_end").notNull(),
  ordersFetched: integer("orders_fetched"),
  ordersInserted: integer("orders_inserted"),
  ordersUpdated: integer("orders_updated"),
  attempt: integer("attempt").notNull().default(1),
  /** Mensagem de erro sanitizada — nunca deve conter token, header de autorização ou payload bruto. */
  errorMessage: text("error_message"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});
