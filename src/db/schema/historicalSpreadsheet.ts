import { date, integer, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { active, notes, source, timestamps } from "./common";
import { services } from "./inventory";

/**
 * Missão de Consolidação do Histórico 2026 — registros REAIS da planilha histórica de lavação,
 * usados exclusivamente para 01/01/2026–30/04/2026 (ver `DATA_CORTE_JUMPPARK` em
 * `src/lib/config/historical-source-precedence.ts` — nunca gravar aqui uma data >= o corte,
 * nunca somar com `jumppark_service_orders` no mesmo período).
 *
 * `source` é sempre "historical_spreadsheet" — nunca finge ter vindo do JumpPark.
 * `canonicalServiceId` fica null quando o tipo de lavação não tem correspondência segura no
 * catálogo (ex.: "CONVENCIONAL"/"CORTESIA") — nunca uma aproximação por preço ou suposição.
 * Campos com formato misto na planilha original (`machineAmountReceivedRaw`,
 * `martelinhoRaw`) ficam como texto bruto — nunca convertidos à força para número.
 */
export const historicalSpreadsheetWashRecords = pgTable("historical_spreadsheet_wash_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** `hist-sheet-lavacao:{aba}:{linha}` — idempotência real (linha exata da planilha original). */
  externalId: text("external_id").notNull().unique(),
  sourceSheet: text("source_sheet").notNull(),
  sourceRow: integer("source_row").notNull(),
  recordDate: date("record_date").notNull(),
  clientName: text("client_name"),
  vehicleModel: text("vehicle_model"),
  plate: text("plate"),
  /** Texto exato como está na planilha (ex.: "BRONZE", "CONVENCIONAL") — nunca normalizado destrutivamente. */
  serviceTypeRaw: text("service_type_raw"),
  /** Null quando o serviço não tem correspondência segura no catálogo — nunca inventado. */
  canonicalServiceId: uuid("canonical_service_id").references(() => services.id),
  washAmount: numeric("wash_amount", { precision: 12, scale: 2 }),
  additionalDescription: text("additional_description"),
  additionalAmount: numeric("additional_amount", { precision: 12, scale: 2 }),
  discountAmount: numeric("discount_amount", { precision: 12, scale: 2 }),
  totalReceived: numeric("total_received", { precision: 12, scale: 2 }),
  paymentMethodRaw: text("payment_method_raw"),
  conferenceStatus: text("conference_status"),
  machineAmountReceivedRaw: text("machine_amount_received_raw"),
  martelinhoRaw: text("martelinho_raw"),
  active: active(),
  source: source(),
  notes: notes(),
  ...timestamps,
});

/**
 * Missão de Consolidação do Histórico 2026 — totais diários REAIS da planilha histórica de
 * estacionamento (granularidade real da fonte: só totais por dia e forma de pagamento — nunca
 * tickets/veículos individuais inventados). Mesma regra de corte da tabela de lavação.
 */
export const historicalSpreadsheetParkingRecords = pgTable("historical_spreadsheet_parking_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** `hist-sheet-estacionamento:{data}` — uma linha por dia, idempotência pela própria data. */
  externalId: text("external_id").notNull().unique(),
  sourceSheet: text("source_sheet").notNull(),
  recordDate: date("record_date").notNull(),
  dayOfWeek: text("day_of_week"),
  creditAmount: numeric("credit_amount", { precision: 12, scale: 2 }).notNull(),
  debitAmount: numeric("debit_amount", { precision: 12, scale: 2 }).notNull(),
  pixAmount: numeric("pix_amount", { precision: 12, scale: 2 }).notNull(),
  cashAmount: numeric("cash_amount", { precision: 12, scale: 2 }).notNull(),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  active: active(),
  source: source(),
  notes: notes(),
  ...timestamps,
});
