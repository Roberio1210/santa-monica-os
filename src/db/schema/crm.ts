import { date, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";

export const customers = pgTable("customers", {
  id: id(),
  name: text("name"),
  /** Telefone completo, se disponível — máscara é responsabilidade da camada de apresentação. */
  phone: text("phone"),
  email: text("email"),
  segment: text("segment"),
  totalSpent: numeric("total_spent", { precision: 12, scale: 2 }),
  lastVisit: date("last_visit"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

export const vehicles = pgTable("vehicles", {
  id: id(),
  customerId: uuid("customer_id").references(() => customers.id),
  plate: text("plate"),
  model: text("model"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});
