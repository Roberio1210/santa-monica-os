import { boolean, date, integer, numeric, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
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

/**
 * FASE B — motor de receitas e calibração. Espelha src/lib/recipes/types.ts.
 */
export const vehicleCategoryEnum = pgEnum("vehicle_category", ["hatch", "sedan", "suv", "caminhonete"]);

export const processStepEnum = pgEnum("process_step", [
  "pre_lavagem",
  "shampoo",
  "rodas",
  "caixas_de_rodas",
  "aspiracao",
  "limpeza_interna",
  "couro",
  "plasticos_internos",
  "vidros",
  "cera",
  "protecao_externa",
  "pneus",
  "motor",
  "chassi",
  "polimento_corte",
  "polimento_refino",
  "polimento_lustro",
  "vitrificacao",
  "higienizacao",
  "farois",
  "chuva_acida",
  "cristalizacao",
  "revisao_final",
]);

export const recipeStatusEnum = pgEnum("recipe_status", ["rascunho", "em_calibracao", "aprovada", "suspensa"]);

export const calibrationSampleStatusEnum = pgEnum("calibration_sample_status", ["valida", "excluida"]);

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
 * Receita técnica de consumo — serviço × categoria de veículo × etapa × produto (FASE B).
 * `quantityPerService` é a mediana das amostras válidas (null enquanto não houver amostras;
 * nunca preenchido manualmente com um valor inventado — ver src/lib/recipes/service.ts,
 * recalculateStatistics). Só receitas com status "aprovada" podem gerar consumo automático,
 * e mesmo assim somente em modo preview_and_confirm nas fases seguintes — nenhuma baixa
 * automática existe ainda nesta fase.
 *
 * `isActiveVersion` mantém no máximo uma versão ativa por combinação
 * (serviceId, vehicleCategory, processStep, itemId) — versões antigas permanecem no banco
 * com isActiveVersion=false para preservar o histórico (ver createNewVersion). A unicidade da
 * combinação ativa é garantida na camada de aplicação (não há índice parcial no banco).
 */
export const serviceConsumptionRules = pgTable("service_consumption_rules", {
  id: id(),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id),
  itemId: uuid("item_id")
    .notNull()
    .references(() => inventoryItems.id),
  vehicleCategory: vehicleCategoryEnum("vehicle_category").notNull(),
  processStep: processStepEnum("process_step").notNull(),
  /** Mediana das amostras válidas — null até haver ao menos 1 amostra (nunca um valor inventado). */
  quantityPerService: numeric("quantity_per_service", { precision: 12, scale: 3 }),
  unit: inventoryUnitEnum("unit").notNull(),
  status: recipeStatusEnum("status").notNull().default("rascunho"),
  version: integer("version").notNull().default(1),
  isActiveVersion: boolean("is_active_version").notNull().default(true),
  /** Partes de água por parte de produto (1:5 → 5). Null = produto puro / diluição não aplicável. */
  dilutionRatio: numeric("dilution_ratio", { precision: 8, scale: 2 }),
  minObserved: numeric("min_observed", { precision: 12, scale: 3 }),
  maxObserved: numeric("max_observed", { precision: 12, scale: 3 }),
  /** Contagem de amostras válidas (status "valida") — recalculado a cada adição/exclusão. */
  sampleCount: integer("sample_count").notNull().default(0),
  lastCalibratedAt: date("last_calibrated_at"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

/**
 * Amostra individual de calibração de uma receita (FASE B). Amostras com status "excluida"
 * nunca entram no cálculo de mediana/mínimo/máximo (ver src/lib/recipes/stats.ts), mas
 * permanecem no banco com `exclusionReason` preenchido — nunca apagadas.
 */
export const recipeCalibrationSamples = pgTable("recipe_calibration_samples", {
  id: id(),
  recipeId: uuid("recipe_id")
    .notNull()
    .references(() => serviceConsumptionRules.id),
  /** Identificador externo da ordem no JumpPark, quando a amostra foi vinculada a uma ordem real. */
  serviceOrderExternalId: text("service_order_external_id"),
  date: date("date").notNull(),
  quantityBefore: numeric("quantity_before", { precision: 12, scale: 3 }).notNull(),
  quantityAfter: numeric("quantity_after", { precision: 12, scale: 3 }).notNull(),
  /** Volume/peso da solução diluída preparada, quando o método de medição foi por diluição. */
  preparedQuantity: numeric("prepared_quantity", { precision: 12, scale: 3 }),
  leftoverReused: numeric("leftover_reused", { precision: 12, scale: 3 }),
  discarded: numeric("discarded", { precision: 12, scale: 3 }),
  dilutionRatio: numeric("dilution_ratio", { precision: 8, scale: 2 }),
  /** Concentrado real consumido, já calculado (ver src/lib/recipes/dilution.ts) — é o valor usado nas estatísticas. */
  concentrateConsumed: numeric("concentrate_consumed", { precision: 12, scale: 3 }).notNull(),
  responsibleName: text("responsible_name"),
  status: calibrationSampleStatusEnum("status").notNull().default("valida"),
  exclusionReason: text("exclusion_reason"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

/**
 * Sugestão de mapeamento etapa → produto candidato (FASE B, seção 7) — NUNCA gera consumo
 * automático; é só um lembrete de "este produto costuma ser usado nesta etapa", pendente de
 * confirmação humana ao criar a receita de fato (service_consumption_rules).
 */
export const processStepProductSuggestions = pgTable("process_step_product_suggestions", {
  id: id(),
  processStep: processStepEnum("process_step").notNull(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => inventoryItems.id),
  confirmed: boolean("confirmed").notNull().default(false),
  active: active(),
  source: source(),
  /** Único (ex.: "pre_lavagem:apc-100") — permite seed idempotente (ON CONFLICT DO NOTHING). */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});
