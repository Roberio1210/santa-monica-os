import { date, integer, jsonb, numeric, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { active, externalId, id, notes, source, timestamps } from "./common";
import { inventoryItems, inventoryMovements, inventoryUnitEnum, itemClassificationEnum } from "./inventory";

/**
 * Missão 23 (Auditoria e Consolidação do Estoque) — módulo inteiramente aditivo sobre o /estoque
 * já em produção. Nada aqui substitui `inventoryItems`/`inventoryMovements`: consolidação sempre
 * passa por uma movimentação real (nunca edita saldo em silêncio) e toda ação de auditoria fica
 * registrada em `inventory_audit_events`, nunca aplicada sem confirmação explícita do usuário.
 */

/**
 * Registro imutável de toda ação de auditoria (consolidação, classificação, correção manual) —
 * nunca apagado, nunca reescrito. `entityType`/`entityId` apontam para o registro afetado (sem FK
 * de banco porque `entityType` varia entre tabelas); `beforeState`/`afterState` são o retrato
 * exato do registro antes/depois, para nunca depender de reconstruir o estado a partir de outros
 * logs.
 */
export const inventoryAuditEvents = pgTable("inventory_audit_events", {
  id: id(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  action: text("action").notNull(),
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
  reason: text("reason"),
  actor: text("actor").notNull(),
  source: source(),
  notes: notes(),
  ...timestamps,
});

/**
 * Um evento de consolidação — vários cadastros de embalagem viram um único produto mestre.
 * `unitBase` é a unidade em que o saldo convertido foi somado ao mestre. Nunca reversível por
 * exclusão: reverter (se necessário no futuro) seria uma nova movimentação, nunca um DELETE.
 */
export const inventoryConsolidations = pgTable("inventory_consolidations", {
  id: id(),
  masterItemId: uuid("master_item_id")
    .notNull()
    .references(() => inventoryItems.id),
  unitBase: inventoryUnitEnum("unit_base").notNull(),
  reason: text("reason"),
  performedBy: text("performed_by").notNull(),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

/**
 * Um cadastro incorporado numa consolidação — preserva o retrato exato de saldo/custo antes da
 * consolidação e aponta para as duas movimentações reais que registraram a transferência
 * (`transferMovementId` no cadastro incorporado, `receivingMovementId` no mestre). Isso garante
 * que o livro-razão nunca perde a rastreabilidade: toda mudança de saldo tem uma movimentação.
 */
export const inventoryConsolidationMembers = pgTable("inventory_consolidation_members", {
  id: id(),
  consolidationId: uuid("consolidation_id")
    .notNull()
    .references(() => inventoryConsolidations.id),
  mergedItemId: uuid("merged_item_id")
    .notNull()
    .references(() => inventoryItems.id),
  previousBalance: numeric("previous_balance", { precision: 12, scale: 3 }).notNull(),
  previousUnitCost: numeric("previous_unit_cost", { precision: 12, scale: 2 }),
  convertedQuantity: numeric("converted_quantity", { precision: 12, scale: 3 }).notNull(),
  transferMovementId: uuid("transfer_movement_id").references(() => inventoryMovements.id),
  receivingMovementId: uuid("receiving_movement_id").references(() => inventoryMovements.id),
  ...timestamps,
});

export const purchaseImportStatusEnum = pgEnum("purchase_import_status", ["previa", "parcial", "concluido"]);

/** Um lote de importação (um upload de arquivo CSV/JSON) — ver purchase-import-format.ts para o formato oficial. */
export const purchaseImports = pgTable("purchase_imports", {
  id: id(),
  /** "csv" ou "json" — formato do arquivo enviado. */
  fileFormat: text("file_format").notNull(),
  filename: text("filename"),
  importedBy: text("imported_by").notNull(),
  status: purchaseImportStatusEnum("status").notNull().default("previa"),
  rowCount: integer("row_count").notNull().default(0),
  validRowCount: integer("valid_row_count").notNull().default(0),
  invalidRowCount: integer("invalid_row_count").notNull().default(0),
  active: active(),
  source: source(),
  notes: notes(),
  ...timestamps,
});

export const purchaseMatchStatusEnum = pgEnum("purchase_match_status", ["encontrado", "possivel", "nao_encontrado"]);

export const purchaseLineDecisionEnum = pgEnum("purchase_line_decision", [
  "vincular_existente",
  "criar_produto",
  "ignorar",
  "patrimonio",
  "despesa_manutencao",
  "revisar_depois",
  /**
   * Missão de Fechamento da Reconciliação dos Snow Foams — a compra já foi identificada e
   * vinculada a um `inventory_item` existente, mas sua entrada de estoque já foi contabilizada
   * por outro processo (ex.: lançamento manual de auditoria feito antes de a NF ter sido
   * cruzada). Nunca gera `inventory_movement`: ao contrário de "vincular_existente", esta decisão
   * NUNCA popula `resultingMovementId` (permanece `null` — nenhum movimento nasceu desta
   * confirmação, mesmo com a linha indo para `status="confirmado"`). Valor aditivo via
   * `ALTER TYPE ... ADD VALUE` — nunca remove nem reaproveita um valor existente.
   */
  "ja_contabilizado_manualmente",
]);

export const purchaseLineStatusEnum = pgEnum("purchase_line_status", ["pendente", "confirmado", "ignorado", "duplicado"]);

/**
 * Uma linha de compra dentro de um lote de importação — sempre nasce em `pendente` (prévia) e só
 * vira uma movimentação real de estoque depois de uma decisão explícita do usuário na Etapa 2
 * (confirmação). `dedupeKey` é UNIQUE no banco — é a garantia real contra reimportar a mesma nota
 * duas vezes, não apenas uma checagem de aplicação (mesmo padrão de
 * `inventory_consumption_confirmations.idempotency_key`).
 */
export const purchaseImportLines = pgTable("purchase_import_lines", {
  id: id(),
  importId: uuid("import_id")
    .notNull()
    .references(() => purchaseImports.id),
  /** Identificador externo da linha, quando a fonte já traz um (ex.: id do sistema de origem). */
  externalId: externalId(),
  rowIndex: integer("row_index").notNull(),
  /** Retrato exato da linha como veio do arquivo — nunca perdido, mesmo se a linha for inválida. */
  rawData: jsonb("raw_data").notNull(),
  valid: active(),
  validationErrors: jsonb("validation_errors"),

  date: date("date"),
  invoiceNumber: text("invoice_number"),
  supplierName: text("supplier_name"),
  supplierCnpj: text("supplier_cnpj"),
  nfeKey: text("nfe_key"),
  productDescription: text("product_description"),
  brand: text("brand"),
  packageCount: numeric("package_count", { precision: 12, scale: 3 }),
  packageQuantity: numeric("package_quantity", { precision: 12, scale: 3 }),
  packageUnit: text("package_unit"),
  totalConvertedQuantity: numeric("total_converted_quantity", { precision: 12, scale: 3 }),
  baseUnit: inventoryUnitEnum("base_unit"),
  unitPricePerPackage: numeric("unit_price_per_package", { precision: 12, scale: 2 }),
  totalItemValue: numeric("total_item_value", { precision: 12, scale: 2 }),
  freightAllocated: numeric("freight_allocated", { precision: 12, scale: 2 }),
  discountAllocated: numeric("discount_allocated", { precision: 12, scale: 2 }),
  finalValue: numeric("final_value", { precision: 12, scale: 2 }),
  observation: text("observation"),

  /** Calculado na prévia: chave da NF-e > identificador externo > combinação nota+fornecedor+data+produto+valor. */
  dedupeKey: text("dedupe_key").unique(),

  matchedItemId: uuid("matched_item_id").references(() => inventoryItems.id),
  matchStatus: purchaseMatchStatusEnum("match_status"),
  /** [{itemId, itemName, score}] — candidatos quando matchStatus="possivel". */
  matchCandidates: jsonb("match_candidates"),
  classification: itemClassificationEnum("classification"),
  decision: purchaseLineDecisionEnum("decision"),
  status: purchaseLineStatusEnum("status").notNull().default("pendente"),
  /**
   * Preenchido só quando a decisão gera uma movimentação real de estoque (vincular/criar produto
   * químico/consumível). `decision="ja_contabilizado_manualmente"` também leva a
   * `status="confirmado"`, mas por definição NUNCA preenche este campo — a movimentação já existe
   * fora deste fluxo, e apontar para ela aqui sugeriria falsamente que esta confirmação a gerou.
   */
  resultingMovementId: uuid("resulting_movement_id").references(() => inventoryMovements.id),

  ...timestamps,
});
