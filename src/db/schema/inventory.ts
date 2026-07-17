import { date, integer, numeric, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";

/**
 * Espelha exatamente src/lib/inventory/types.ts (InventoryCategory/InventoryUnit/
 * InventoryCondition/MovementType) — qualquer mudança nos tipos TypeScript deve ser
 * replicada aqui e vice-versa, para que o seed (docs/database-architecture.md, seção
 * "Migração do estoque") não precise traduzir valores.
 */
export const inventoryCategoryEnum = pgEnum("inventory_category", [
  "Lavagem",
  "Higienização",
  "Pneus e borrachas",
  "Vidros",
  "Couro",
  "Plásticos",
  "Polimento",
  "Ceras e selantes",
  "Vitrificação",
  "Motor e chassi",
  "Boinas e acessórios",
  "Equipamentos",
  "EPIs",
  "Outros",
]);

export const inventoryUnitEnum = pgEnum("inventory_unit", ["L", "ml", "kg", "g", "unidade", "caixa"]);

export const inventoryConditionEnum = pgEnum("inventory_condition", [
  "lacrado",
  "aberto",
  "pela_metade",
  "estimado",
]);

export const movementTypeEnum = pgEnum("movement_type", [
  "entrada",
  "saida",
  "ajuste_inventario",
  "perda",
  "consumo_interno",
  "compra",
  "contagem_fisica_inicial",
  "ajuste_positivo",
  "ajuste_negativo",
  "avaria",
  "vencimento",
  "devolucao",
  "transferencia",
  "consumo_teste_calibracao",
  "correcao_inventario",
]);

export const quantityStatusEnum = pgEnum("inventory_quantity_status", ["confirmed", "measurement_pending"]);

export const inventoryItems = pgTable("inventory_items", {
  id: id(),
  name: text("name").notNull(),
  /** Nome exatamente como informado na origem, quando diverge do nome canônico (`name`). Null quando igual. */
  originalName: text("original_name"),
  brand: text("brand").notNull(),
  category: inventoryCategoryEnum("category").notNull(),
  currentQuantity: numeric("current_quantity", { precision: 12, scale: 3 }).notNull(),
  unit: inventoryUnitEnum("unit").notNull(),
  packageCapacity: numeric("package_capacity", { precision: 12, scale: 3 }),
  packageCount: integer("package_count"),
  condition: inventoryConditionEnum("condition").notNull(),
  /** Nunca inferido. Null = "Sem mínimo definido" (ver computeStatus em src/lib/inventory/status.ts). */
  minimumStock: numeric("minimum_stock", { precision: 12, scale: 3 }),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
  lastCountDate: date("last_count_date").notNull(),
  /** "measurement_pending" quando o conteúdo real da embalagem ainda não foi medido — nunca inventado. */
  quantityStatus: quantityStatusEnum("quantity_status").notNull().default("confirmed"),
  active: active(),
  source: source(),
  /**
   * Slug estável do item (ex.: "v-floc-shampoo-vonixx"), igual ao `id` usado em
   * src/lib/inventory/data/initial-count-2026-07-10.ts. Único, para permitir seed idempotente
   * (ver src/db/seed/inventory.ts) — nunca duplica um item ao rodar o seed mais de uma vez.
   */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

export const inventoryMovements = pgTable("inventory_movements", {
  id: id(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => inventoryItems.id),
  type: movementTypeEnum("type").notNull(),
  /** Para tipos absolutos (ajuste_inventario/contagem_fisica_inicial/correcao_inventario), valor recontado — não um delta (ver movement-math.ts). */
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  unit: inventoryUnitEnum("unit").notNull(),
  date: date("date").notNull(),
  responsible: text("responsible"),
  /** Documento/lote de referência (ex.: "STOCKTAKE-2026-07-10", "RECEIPT-2026-07-15"). */
  reference: text("reference"),
  /** Saldo do item imediatamente antes desta movimentação — sempre calculado pelo repositório, nunca informado pelo chamador. */
  previousBalance: numeric("previous_balance", { precision: 12, scale: 3 }),
  /** Saldo do item imediatamente após esta movimentação — sempre calculado pelo repositório. */
  newBalance: numeric("new_balance", { precision: 12, scale: 3 }),
  active: active(),
  source: source(),
  /** Único quando informado — permite backfill/seed idempotente (ON CONFLICT DO NOTHING) sem duplicar movimentações históricas. */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

export const services = pgTable("services", {
  id: id(),
  name: text("name").notNull(),
  category: text("category"),
  /** Preço padrão do serviço. Null quando não cadastrado — nunca inventado. */
  defaultPrice: numeric("default_price", { precision: 12, scale: 2 }),
  active: active(),
  source: source(),
  /** Slug estável (ex.: "lavacao-parceria-iesa"), único, para seed idempotente. */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

/**
 * Ficha técnica de consumo (preparada, não usada ainda — ver docs/inventory-module.md,
 * seção "Como evoluir para baixa automática"). Ao concluir uma ordem de serviço, cada regra
 * aqui geraria um inventory_movement do tipo consumo_interno automaticamente.
 */
export const serviceConsumptionRules = pgTable("service_consumption_rules", {
  id: id(),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id),
  itemId: uuid("item_id")
    .notNull()
    .references(() => inventoryItems.id),
  quantityPerService: numeric("quantity_per_service", { precision: 12, scale: 3 }).notNull(),
  unit: inventoryUnitEnum("unit").notNull(),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});
