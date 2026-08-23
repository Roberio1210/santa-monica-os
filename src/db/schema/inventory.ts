import { boolean, date, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, unique, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
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

/**
 * "descarte"/"outros" adicionados na Missão 22 (Estoque Inteligente) para a baixa manual por
 * motivo (Consumo/Perda/Descarte/Teste/Outros) — os demais motivos já reaproveitam tipos
 * existentes (consumo→consumo_interno, perda→perda, teste→consumo_teste_calibracao). Aditivo:
 * nenhum valor existente foi removido ou renomeado.
 */
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
  "descarte",
  "outros",
]);

export const quantityStatusEnum = pgEnum("inventory_quantity_status", ["confirmed", "measurement_pending"]);

/**
 * Missão 23 (Auditoria e Consolidação) — como cada produto deve ser tratado. Definida aqui (não em
 * inventoryAudit.ts) porque `inventoryItems.classification` também usa este enum e
 * inventoryAudit.ts já importa de inventory.ts — evita import circular. Nunca mistura
 * patrimônio/ferramenta com consumo químico controlado em estoque.
 */
export const itemClassificationEnum = pgEnum("item_classification", [
  "quimico_volume",
  "solido_peso",
  "consumivel_unidade",
  "epi",
  "ferramenta",
  "equipamento",
  "patrimonio",
  "manutencao",
  "material_divulgacao",
  "brinde_cliente",
  "nao_controlado",
]);

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
  // Missão Z3.2 — etapas confirmadas pelo gestor para diferenciar Bronze/Silver/Gold de verdade
  // (a auditoria da Z3 encontrou Silver e Gold com as mesmas etapas cadastradas — incorreto).
  "simbolos",
  "letras",
  "macanetas",
  "sanitizacao_interna",
  "cera_carnauba",
  "batentes",
  "descontaminacao_ferrosa",
  "cromados",
  "estepe",
]);

export const recipeStatusEnum = pgEnum("recipe_status", ["rascunho", "em_calibracao", "aprovada", "suspensa"]);

/**
 * Missão de Histórico Retroativo — nível de confiança do valor usado num cálculo teórico (espelha
 * src/lib/inventory/yield.ts, YieldConfidence). "gerencial" adicionado na Missão do Modelo de
 * Consumo Médio Gerencial V1 — fica ENTRE "em_calibracao" e "tecnico" na hierarquia de prioridade
 * (uma média gerencial derivada de volume de compra real é mais confiável que uma referência
 * técnica nunca verificada operacionalmente, mas menos confiável que qualquer amostra física
 * real). Valor aditivo via ALTER TYPE ... ADD VALUE — nunca reescreve as linhas históricas
 * existentes de `historical_theoretical_consumption`, que continuam com os 3 valores antigos.
 */
export const recipeConfidenceTierEnum = pgEnum("recipe_confidence_tier", ["tecnico", "em_calibracao", "gerencial", "calibrado"]);

export const calibrationSampleStatusEnum = pgEnum("calibration_sample_status", ["valida", "excluida"]);

/**
 * Missão do Catálogo Técnico Mestre — como um produto/receita participa de uma etapa
 * operacional. Nunca aplicado automaticamente por nome; só quando o gestor confirma
 * explicitamente (ver docs da missão para a justificativa de cada valor por produto).
 */
export const recipeUsageTypeEnum = pgEnum("recipe_usage_type", [
  "standard", // produto padrão daquela etapa
  "conditional", // só utilizado quando necessário
  "alternative", // um entre vários produtos possíveis para a mesma etapa
  "specific_service", // produto específico de determinado serviço
  "operational", // consumido pela operação, não diretamente por um veículo
  "durable", // material reutilizável, sem baixa por serviço
]);

/**
 * Missão do Catálogo Técnico Mestre — função técnica do produto/receita, independente do
 * serviço em que é usado (ex.: "Fast Cut" é CUT_COMPOUND tanto no Polimento Comercial quanto
 * no Técnico). Vocabulário mantido em inglês por ser terminologia técnica de detailing,
 * deliberadamente distinta do vocabulário operacional em português já usado em `process_step`.
 * `PAINT_FINISHER` e `EXTERIOR_DRESSING` foram adicionados nesta missão (ver relatório) — todo
 * o restante veio da lista original proposta pelo gestor.
 */
export const technicalFunctionEnum = pgEnum("technical_function", [
  "pre_wash",
  "shampoo",
  "apc",
  "degreaser",
  "acid_cleaner",
  "tire_cleaner",
  "tire_dressing",
  "glass_cleaner",
  "glass_decontamination",
  "glass_coating",
  "interior_cleaner",
  "upholstery_cleaner",
  "sanitizer",
  "leather_cleaner",
  "leather_conditioner",
  "plastic_dressing",
  "exterior_dressing",
  "tar_glue_remover",
  "iron_remover",
  "paint_decontamination",
  "cut_compound",
  "refinish_compound",
  "finish_compound",
  "polish_inspection",
  "wax",
  "sealant",
  "paint_coating",
  "plastic_coating",
  "headlight_coating",
  "coating_maintenance",
  "engine_degreaser",
  "engine_dressing",
  "chassis_cleaner",
  "metal_cleaner",
  "microfiber_cleaner",
  "pad",
  "microfiber",
  "sprayer",
  "equipment",
  "ppe",
  "paint",
  "paint_finisher",
  /** Missão de Saneamento Final do Catálogo — produto que executa corte + refino + lustro no mesmo processo (ex.: "Polidor 3 em 1"), nunca reduzido artificialmente a CUT_COMPOUND sozinho. */
  "multi_stage_polish",
  /** Missão de Saneamento Final do Catálogo — cera com ação de limpeza/microabrasão leve além de proteção/brilho (ex.: Hard Cleaner Wax), distinta de WAX puro. */
  "cleaner_wax",
  "other",
]);

/**
 * Missão do Catálogo Técnico Mestre — de onde vem a informação de uma receita/quantidade
 * técnica. Distingue "o fabricante recomenda" de "é assim que a Santa Mônica utiliza" — nunca
 * confundido, nunca usado para inventar um valor.
 */
export const recipeInformationSourceEnum = pgEnum("recipe_information_source", [
  "manufacturer",
  "technical_datasheet",
  "specialized_source",
  "purchase_document",
  "santa_monica_operation",
  "calibrated_real_usage",
]);

/** Missão do Catálogo Técnico Mestre — sobre o que a diluição de uma receita é medida. */
export const recipeDilutionBasisEnum = pgEnum("recipe_dilution_basis", ["concentrate", "prepared_solution", "pure_product"]);

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
  /** Estoque ideal (Missão 22) — nível confortável de operação, distinto do mínimo (limiar de compra). Nunca inferido. */
  idealStock: numeric("ideal_stock", { precision: 12, scale: 3 }),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
  /** Fornecedor mais recente conhecido (Missão 22) — atualizado automaticamente a cada entrada com fornecedor informado, editável manualmente enquanto não houver entrada. */
  supplier: text("supplier"),
  /** Localização física (Missão 22) — ex.: "Prateleira A", "Box 1". Texto livre, editável manualmente. */
  location: text("location"),
  /** Missão 23 — classificação opcional (nunca inferida automaticamente para os 65 produtos existentes). */
  classification: itemClassificationEnum("classification"),
  /**
   * Missão do Catálogo Técnico Mestre — identidade técnica "de catálogo" do produto (o que ele
   * é, independente de em qual serviço é usado). Distinto de `service_consumption_rules.technical_function`,
   * que pode existir por receita específica quando o mesmo produto tiver papéis diferentes em
   * contextos diferentes. Nunca inferido por nome — só populado quando o gestor confirma.
   */
  technicalFunction: technicalFunctionEnum("technical_function"),
  /** Missão do Catálogo Técnico Mestre — tipo de utilização "de catálogo" do produto. Mesmo cuidado de `technicalFunction` acima: nunca inferido, só confirmado. */
  usageType: recipeUsageTypeEnum("usage_type"),
  /**
   * Missão 23 — quando preenchido, este item foi incorporado a outro (o produto mestre) numa
   * consolidação. O item nunca é excluído: fica `active=false`, aponta para o mestre, e todo o
   * histórico de movimentações permanece rastreável através dele. Null = item não consolidado
   * (pode ser mestre de outros, ou nunca ter passado por consolidação).
   */
  canonicalItemId: uuid("canonical_item_id").references((): AnyPgColumn => inventoryItems.id),
  consolidatedAt: timestamp("consolidated_at", { withTimezone: true }),
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
  /** Documento/lote de referência (ex.: "STOCKTAKE-2026-07-10", "RECEIPT-2026-07-15") — a Missão 22 reaproveita este campo para "número da nota" nas entradas manuais. */
  reference: text("reference"),
  /** Fornecedor desta movimentação (Missão 22) — só preenchido em entradas/compras; null nos demais tipos. */
  supplier: text("supplier"),
  /** Preço unitário pago nesta movimentação (Missão 22) — só preenchido em entradas/compras; usado para recalcular o custo médio ponderado do item. Null nos demais tipos. */
  unitPricePaid: numeric("unit_price_paid", { precision: 12, scale: 2 }),
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
  /** Preço-base do serviço — só quando o serviço tem UM preço único (sem variação por porte/tier). Serviços com variação usam `servicePriceVariants`, e este campo fica null. Nunca inventado. */
  defaultPrice: numeric("default_price", { precision: 12, scale: 2 }),
  /**
   * Missão Z3.2 — condição comercial atualmente praticada, quando DIFERENTE do preço-base
   * (`defaultPrice`). Null significa "preço comercial atual = preço-base" (o caso comum). Nunca
   * preenchido a partir do valor de uma Ordem de Serviço específica — só de confirmação explícita
   * do gestor. Ver `docs` da missão: preço-base ≠ preço comercial atual ≠ preço negociado (esse
   * último nunca é armazenado aqui, só existe na OS/venda em si).
   */
  currentPrice: numeric("current_price", { precision: 12, scale: 2 }),
  active: active(),
  source: source(),
  /** Slug estável (ex.: "lavacao-parceria-iesa"), único, para seed idempotente. */
  externalId: text("external_id").unique(),
  notes: notes(),
  /**
   * Missão Z3 (base de conhecimento do Zézinho) — campos de catálogo comercial, todos opcionais e
   * null até o gestor confirmar o dado real (nunca inferidos por dedução do nome do serviço).
   */
  shortDescription: text("short_description"),
  detailedDescription: text("detailed_description"),
  estimatedDurationMinutes: integer("estimated_duration_minutes"),
  /** Texto livre, um benefício por linha — null até confirmação do gestor. */
  benefits: text("benefits"),
  indications: text("indications"),
  restrictions: text("restrictions"),
  /** `true` quando o resultado real depende de avaliação presencial do veículo (ex.: polimento em risco profundo) — nunca usado para prometer resultado sem inspeção. */
  requiresInspection: boolean("requires_inspection").notNull().default(false),
  /** Ordem de exibição sugerida — nunca um dado de negócio, só uma dica de UI/resposta. Null = sem preferência. */
  displayOrder: integer("display_order"),
  ...timestamps,
});

/**
 * Missão Z3 — preço varia por porte de veículo e/ou por outra dimensão comercial (tier de cera,
 * duração da vitrificação, janela de horário do estacionamento etc.). `services.defaultPrice`
 * continua servindo para o caso simples (um preço só); esta tabela existe porque uma única
 * coluna nunca conseguiria representar "Bronze Hatch R$100 / SUV R$140", por exemplo — nunca
 * duplica `services`, só adiciona a dimensão de preço que faltava.
 */
export const servicePriceVariants = pgTable(
  "service_price_variants",
  {
    id: id(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    /** Porte do veículo, quando essa for a dimensão de variação — null quando não se aplica (ex.: variação só por tier de cera/duração). */
    vehicleCategory: vehicleCategoryEnum("vehicle_category"),
    /** Segunda dimensão de variação em texto livre (ex.: "Sem cera", "1 ano", "08h-18h Fração") — null quando a variação é só por porte. */
    variantLabel: text("variant_label"),
    /** Preço-base desta variante. Nunca inventado. */
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    /** Missão Z3.2 — condição comercial atual, quando diferente do preço-base (`price`). Null = preço comercial atual é o próprio `price`. Mesmo princípio de `services.currentPrice`. */
    currentPrice: numeric("current_price", { precision: 12, scale: 2 }),
    displayOrder: integer("display_order"),
    active: active(),
    source: source(),
    /** `${serviceExternalId}:${vehicleCategory ?? "-"}:${variantLabel ?? "-"}` — idempotência do seed. */
    externalId: text("external_id").unique(),
    notes: notes(),
    ...timestamps,
  },
);

/**
 * Missão do Catálogo Técnico Mestre — desacopla ETAPA de SERVIÇO: declara que um serviço
 * (Bronze/Silver/Gold/etc.) inclui uma determinada etapa operacional (`process_step`, mesmo
 * enum já usado em `service_consumption_rules`). Existe para que, no futuro, uma receita possa
 * ser escrita uma única vez por etapa (`service_consumption_rules.service_id = null`) e valer
 * para todo serviço que declarar usar aquela etapa aqui — em vez de precisar de uma linha de
 * receita duplicada por serviço, como hoje.
 *
 * Criada VAZIA nesta missão — nenhuma linha inserida. Popular Bronze/Silver/Gold é objeto de
 * uma missão futura; até lá, o motor de consumo continua resolvendo exclusivamente pelo
 * caminho antigo (receita presa a um `service_id` específico), sem nenhuma dependência desta
 * tabela.
 */
export const serviceOperationalSteps = pgTable(
  "service_operational_steps",
  {
    id: id(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id),
    processStep: processStepEnum("process_step").notNull(),
    active: active(),
    source: source(),
    /** `${serviceExternalId}:${processStep}` — permite seed idempotente quando esta tabela começar a ser populada. */
    externalId: text("external_id").unique(),
    notes: notes(),
    ...timestamps,
  },
  (table) => [unique().on(table.serviceId, table.processStep)],
);

/**
 * Missão Z3.2 — "este serviço usa este produto", separado de `serviceConsumptionRules` (que
 * exige porte + etapa + unidade + é voltado para CALIBRAÇÃO de consumo/quantidade). Muitos dos
 * serviços confirmados nesta missão (motor, chassi, chuva ácida, proteção de vidros, faróis,
 * plásticos, couro) não variam por porte e não têm nenhuma amostra de calibração real — forçar
 * esses casos em `serviceConsumptionRules` exigiria um `vehicleCategory`/`unit` artificial só
 * para satisfazer o schema. Aqui só se registra QUAL produto real está confirmado para qual papel
 * no serviço — nunca inferido pela mera existência do produto no estoque: todo registro desta
 * tabela vem de confirmação explícita do gestor.
 *
 * Missão Z3.3 (gerente operacional: serviço → etapa → produto homologado → estoque real) —
 * `itemId` passou a ser NULLABLE e ganhou `priceVariantId`/`productNameFallback`/`brandFallback`/
 * `durabilityLabel`: um produto pode ser HOMOLOGADO (confirmado pelo gestor como opção adequada,
 * ex.: os 3 vitrificadores de couro citados na missão) mesmo sem nunca ter sido cadastrado no
 * estoque real — nesse caso `itemId` fica null e `productNameFallback`/`brandFallback` guardam o
 * nome/marca exatamente como o gestor informou (nunca um `itemId` inventado só para satisfazer o
 * schema). Quando `itemId` está preenchido, o produto É um item real de `inventoryItems` e sua
 * disponibilidade é sempre lida do saldo atual dele — nunca hardcoded aqui. Aplicação garante
 * `itemId IS NOT NULL OR productNameFallback IS NOT NULL` (sem CHECK no banco, mesmo padrão de
 * invariante só-em-aplicação já usado no restante deste schema). `priceVariantId` (nullable,
 * aponta para `service_price_variants`) existe porque produtos homologados podem variar por
 * variante de preço do MESMO serviço (ex.: vitrificação de pintura 1/2/3/4/5 anos usa produtos
 * diferentes por duração) — null significa "vale para o serviço inteiro, independente de
 * variante" (ex.: Glass Limpa Vidros nos três pacotes, independente do porte).
 */
export const serviceProducts = pgTable("service_products", {
  id: id(),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id),
  /** Nullable quando a homologação vale para o serviço inteiro, independente de variante (ex.: porte). Preenchido quando o produto é específico de uma variante (ex.: uma duração de vitrificação). */
  priceVariantId: uuid("price_variant_id").references(() => servicePriceVariants.id),
  /** Null quando o produto homologado ainda não foi cadastrado no estoque real (ver `productNameFallback`). */
  itemId: uuid("item_id").references(() => inventoryItems.id),
  /** Nome do produto exatamente como o gestor confirmou — só preenchido quando `itemId` é null. */
  productNameFallback: text("product_name_fallback"),
  /** Marca do produto exatamente como o gestor confirmou — só preenchido quando `itemId` é null. */
  brandFallback: text("brand_fallback"),
  /** Papel do produto no serviço, em texto curto confirmado pelo gestor (ex.: "Proteção com cera líquida", "Desengraxante", "Finalização com verniz") — nunca inventado. */
  role: text("role").notNull(),
  /** `true` quando o gestor confirmou este produto como uma ALTERNATIVA aceitável a outro já cadastrado para o mesmo papel (ex.: Nograx OU o "3 em 1"), nunca uma dedução. */
  isAlternative: boolean("is_alternative").notNull().default(false),
  /** Durabilidade/proteção aproximada confirmada pelo gestor para ESTE produto especificamente (ex.: "~1 ano", "1 a 2 anos") — nunca inventada, nunca tratada como garantia. Null até confirmação. */
  durabilityLabel: text("durability_label"),
  displayOrder: integer("display_order"),
  active: active(),
  source: source(),
  /** `${serviceExternalId}:${variantLabel ?? "-"}:${itemId ?? "fallback:" + productNameFallback-slug}:${role-slug}` — idempotência do seed. */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

/**
 * Missão Z3.2 — política comercial estruturada (nunca só no system prompt do Zézinho, para poder
 * mudar sem editar código — ver missão, seção 31). Modelada como linha única de configuração
 * (não um KV genérico): os parâmetros são finitos e conhecidos, um KV store seria
 * sobre-engenharia para 4 números. Nunca contém custo/margem interna — só regras de negociação
 * voltadas ao cliente, seguras para o papel operacional.
 */
export const commercialPolicy = pgTable("commercial_policy", {
  id: id(),
  /** Limite máximo de desconto financeiro, em % — nunca oferecido de imediato, sempre último recurso. */
  maxDiscountPercent: numeric("max_discount_percent", { precision: 5, scale: 2 }).notNull(),
  /** Passos sugeridos de progressão do desconto, em %, do menor ao maior (ex.: [5, 10]) — nunca pular direto para o máximo. */
  discountProgressionSteps: jsonb("discount_progression_steps").notNull(),
  /** Valor mínimo da venda para oferecer parcelamento. */
  installmentThresholdAmount: numeric("installment_threshold_amount", { precision: 12, scale: 2 }).notNull(),
  maxInstallments: integer("max_installments").notNull(),
  active: active(),
  source: source(),
  notes: notes(),
  ...timestamps,
});

/**
 * Missão Z3.2 — quais serviços já têm autorização prévia do gestor para serem oferecidos como
 * cortesia estratégica (nunca decidido pelo Zézinho sozinho — só reflete o que já foi
 * autorizado). O "valor percebido" da cortesia é sempre o preço real do próprio serviço em
 * `services`/`servicePriceVariants` — nunca duplicado aqui.
 */
export const serviceComplimentaryOptions = pgTable("service_complimentary_options", {
  id: id(),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id),
  /** Contexto de quando esta cortesia é apropriada, confirmado pelo gestor (ex.: "fechamento de ticket relevante com vários serviços adicionais"). */
  context: text("context"),
  active: active(),
  source: source(),
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
  /**
   * Missão do Catálogo Técnico Mestre — tornado opcional para permitir, no futuro, receitas
   * presas à ETAPA (`process_step`) em vez de a um serviço específico, reutilizáveis por vários
   * serviços via `service_operational_steps`. Nesta missão nenhuma receita nova usa
   * `service_id = null` — as 40 receitas existentes continuam com o serviço preenchido, e o
   * motor de consumo continua resolvendo exclusivamente pelo caminho antigo (serviço
   * específico). A resolução por etapa fica para a missão que configurar Bronze/Silver/Gold.
   */
  serviceId: uuid("service_id").references(() => services.id),
  itemId: uuid("item_id")
    .notNull()
    .references(() => inventoryItems.id),
  vehicleCategory: vehicleCategoryEnum("vehicle_category").notNull(),
  processStep: processStepEnum("process_step").notNull(),
  /** Mediana das amostras válidas — null até haver ao menos 1 amostra (nunca um valor inventado). */
  quantityPerService: numeric("quantity_per_service", { precision: 12, scale: 3 }),
  /**
   * Missão de Automação JumpPark → Consumo — valor técnico de referência inicial (informado por
   * fabricante/gestor, nunca calculado pelo sistema), distinto de `quantityPerService` (que só
   * vem de calibração real — amostra física, nunca preenchida manualmente). Usado apenas como
   * estimativa provisória rotulada "técnico" (rendimento estimado, painel de consumo) enquanto
   * não houver amostras reais suficientes. Nunca substitui `quantityPerService` nem torna uma
   * receita aprovável sozinho — aprovação continua exigindo MIN_SAMPLES_FOR_PROVISIONAL amostras
   * reais (ver approveRecipe em src/lib/recipes/service.ts).
   */
  technicalReferenceQuantity: numeric("technical_reference_quantity", { precision: 12, scale: 3 }),
  /** Fonte do valor técnico de referência (ex.: "Instrução do gestor — missão automação JumpPark, 2026-08-11" ou "vonixx.com.br/produto/v-floc — diluição 1:400"). Null quando technicalReferenceQuantity é null. */
  technicalReferenceSource: text("technical_reference_source"),
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
  /** Missão do Catálogo Técnico Mestre — como esta receita específica participa da etapa (ver `recipeUsageTypeEnum`). Nullable: nenhuma receita existente foi classificada retroativamente nesta missão. */
  usageType: recipeUsageTypeEnum("usage_type"),
  /** Missão do Catálogo Técnico Mestre — função técnica desta receita específica (ver `technicalFunctionEnum`). Nullable pelo mesmo motivo. */
  technicalFunction: technicalFunctionEnum("technical_function"),
  /** Missão do Catálogo Técnico Mestre — categoria estruturada da fonte (ver `recipeInformationSourceEnum`), ao lado de `technicalReferenceSource` (texto livre da citação exata). */
  informationSource: recipeInformationSourceEnum("information_source"),
  /** Missão do Catálogo Técnico Mestre — sobre o que `dilutionRatio` é medido. Nullable: nunca inferido. */
  dilutionBasis: recipeDilutionBasisEnum("dilution_basis"),
  /**
   * Missão do Modelo de Consumo Médio Gerencial V1 — trilho GERENCIAL, paralelo e independente
   * dos trilhos técnico (`technicalReferenceQuantity`) e de calibração real (`quantityPerService`).
   * Nunca escrito por `recalculateStatistics`/`addSample`/`approveRecipe`; nunca lido por
   * `preview.ts`/`automatic-consumption.ts`/`resolution.ts`. Estimativa administrativa (não
   * medição física) para previsão de consumo/compras — nunca "consumo comprovado".
   */
  managerialBaselineQuantity: numeric("managerial_baseline_quantity", { precision: 12, scale: 3 }),
  /** Faixa de tolerância da estimativa gerencial, por receita — nunca uma tolerância universal. */
  managerialTolerancePercentage: numeric("managerial_tolerance_percentage", { precision: 5, scale: 2 }),
  /** Fonte estruturada do baseline gerencial (mesmo enum de `informationSource`, coluna própria). */
  managerialBaselineSource: recipeInformationSourceEnum("managerial_baseline_source"),
  /** Data em que este baseline passou a valer — nunca retroage para período anterior ao registro. */
  managerialBaselineSince: date("managerial_baseline_since"),
  /** Liga/desliga o multiplicador de porte (`getVehicleSizeMultiplier`) SÓ para a projeção gerencial desta receita — granularidade por produto, nunca reaproveita/altera `AREA_SENSITIVE_STEPS` (que é por etapa). */
  managerialSizeAdjustmentApplicable: boolean("managerial_size_adjustment_applicable").notNull().default(false),
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

/**
 * FASE D — integração preview_and_confirm entre JumpPark e estoque. Espelha
 * src/lib/orders/types.ts.
 */
export const jumpparkServiceMappingStatusEnum = pgEnum("jumppark_service_mapping_status", ["mapeado", "nao_mapeado"]);

/** Inclui "desconhecido" — o JumpPark não expõe categoria estruturada de veículo. */
export const orderVehicleCategoryEnum = pgEnum("order_vehicle_category", ["hatch", "sedan", "suv", "caminhonete", "desconhecido"]);

export const consumptionConfirmationStatusEnum = pgEnum("consumption_confirmation_status", ["confirmada", "parcial", "estornada"]);

/**
 * Mapeamento explícito texto do serviço JumpPark → serviço canônico (Fase D, seção 1). Nunca
 * mapeado por aproximação — cada texto novo encontrado numa ordem real gera uma linha própria
 * com status "nao_mapeado" até confirmação humana explícita.
 */
export const jumpparkServiceMappings = pgTable("jumppark_service_mappings", {
  id: id(),
  /** Texto exatamente como retornado pelo JumpPark — nunca alterado, preservado para auditoria. */
  jumpparkServiceName: text("jumppark_service_name").notNull(),
  canonicalServiceId: uuid("canonical_service_id").references(() => services.id),
  status: jumpparkServiceMappingStatusEnum("status").notNull().default("nao_mapeado"),
  lastValidatedAt: date("last_validated_at"),
  active: active(),
  source: source(),
  /** Slug estável derivado do texto normalizado — idempotência do primeiro registro automático. */
  externalId: text("external_id").unique(),
  notes: notes(),
  ...timestamps,
});

/**
 * Categoria do veículo por placa (Fase D, seção 2) — o JumpPark não expõe um id estável de
 * veículo, então a placa normalizada é a chave de identidade. Nunca confirmada automaticamente
 * pelo texto do modelo; fica "desconhecido" até revisão manual explícita.
 */
export const vehicleCategoryAssignments = pgTable("vehicle_category_assignments", {
  id: id(),
  /** Placa normalizada (maiúscula, sem espaços) — única. */
  plateNormalized: text("plate_normalized").notNull().unique(),
  category: orderVehicleCategoryEnum("category").notNull().default("desconhecido"),
  previousCategory: orderVehicleCategoryEnum("previous_category"),
  responsibleName: text("responsible_name"),
  changedAt: timestamp("changed_at", { withTimezone: true }),
  reason: text("reason"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

/**
 * Uma confirmação humana de consumo para uma ordem JumpPark (Fase D, seção 5/6). Nunca criada
 * automaticamente — sempre exige responsável textual. `idempotencyKey` (ordem + versão) tem
 * UNIQUE no banco: é a garantia real contra duplo clique/dupla aba/reexecução, não apenas uma
 * checagem de aplicação.
 */
export const inventoryConsumptionConfirmations = pgTable("inventory_consumption_confirmations", {
  id: id(),
  jumpparkOrderExternalId: text("jumppark_order_external_id").notNull(),
  /** Incrementa a cada nova confirmação da MESMA ordem após um estorno — nunca reaproveita a mesma versão. */
  version: integer("version").notNull().default(1),
  vehicleCategory: orderVehicleCategoryEnum("vehicle_category").notNull(),
  status: consumptionConfirmationStatusEnum("status").notNull(),
  responsibleName: text("responsible_name").notNull(),
  justification: text("justification"),
  /** [{itemName, recipeId, reason}] — itens que estavam na prévia e foram removidos antes de confirmar; nunca geram movimentação nem linha. */
  removedItemsLog: jsonb("removed_items_log"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  reversedBy: text("reversed_by"),
  reversalReason: text("reversal_reason"),
  /** `${jumpparkOrderExternalId}:v${version}` — único no banco. */
  idempotencyKey: text("idempotency_key").notNull().unique(),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

/**
 * Uma linha de produto dentro de uma confirmação — sempre vinculada à movimentação real do
 * livro-razão que ela gerou (Fase A). `expectedQuantity` null quando o item foi adicionado extra
 * (sem receita), nunca inventado.
 */
export const inventoryConsumptionLines = pgTable("inventory_consumption_lines", {
  id: id(),
  confirmationId: uuid("confirmation_id")
    .notNull()
    .references(() => inventoryConsumptionConfirmations.id),
  itemId: uuid("item_id")
    .notNull()
    .references(() => inventoryItems.id),
  recipeId: uuid("recipe_id").references(() => serviceConsumptionRules.id),
  processStep: processStepEnum("process_step"),
  expectedQuantity: numeric("expected_quantity", { precision: 12, scale: 3 }),
  confirmedQuantity: numeric("confirmed_quantity", { precision: 12, scale: 3 }).notNull(),
  unit: inventoryUnitEnum("unit").notNull(),
  previousBalance: numeric("previous_balance", { precision: 12, scale: 3 }).notNull(),
  newBalance: numeric("new_balance", { precision: 12, scale: 3 }).notNull(),
  movementId: uuid("movement_id")
    .notNull()
    .references(() => inventoryMovements.id),
  /** Preenchido só quando a confirmação é estornada — aponta para o movimento inverso ("devolucao"). */
  reversalMovementId: uuid("reversal_movement_id").references(() => inventoryMovements.id),
  isExtra: boolean("is_extra").notNull().default(false),
  lineJustification: text("line_justification"),
  active: active(),
  source: source(),
  externalId: externalId(),
  notes: notes(),
  ...timestamps,
});

/**
 * Missão de Consolidação do Histórico 2026 — de onde veio o registro-fonte de um cálculo de
 * consumo teórico. Estrutural (não texto livre em `source`) para que consultas de auditoria
 * ("jan-abr só planilha, mai+ só JumpPark") sejam confiáveis, nunca dependam de parsing de texto.
 */
export const historicalConsumptionSourceTypeEnum = pgEnum("historical_consumption_source_type", ["jumppark", "historical_spreadsheet"]);

/**
 * Consumo teórico HISTÓRICO (Missão de Histórico Retroativo, renomeada/estendida na Missão de
 * Consolidação do Histórico 2026 para aceitar as duas fontes oficiais por período) —
 * deliberadamente uma tabela separada de `inventory_consumption_lines`/`inventory_movements`:
 * nunca representa uma baixa real de estoque, só a estimativa de quanto um serviço histórico
 * real teria consumido segundo a receita técnica vigente no momento do processamento. Nunca
 * altera `inventory_items.current_quantity`, nunca gera `inventory_movements`. Ao contrário do
 * consumo automático real (que só usa receita "aprovada"), este cálculo usa a melhor referência
 * disponível — aprovada > em calibração > técnica — porque é só análise, nunca escreve saldo.
 *
 * `jumpparkOrderExternalId` (nome de coluna mantido por simplicidade de migração — na prática é
 * um id de registro-fonte genérico) é `jumppark_service_orders.external_id` quando
 * `sourceRecordType='jumppark'`, ou `historical_spreadsheet_wash_records.external_id` quando
 * `sourceRecordType='historical_spreadsheet'` — nunca as duas fontes para a mesma data (ver
 * `officialHistoricalSource` em src/lib/config/historical-source-precedence.ts).
 *
 * `externalId` (aqui com UNIQUE de verdade, ao contrário do bug corrigido em
 * `service_consumption_rules` na missão anterior) é `hist:{jumpparkOrderExternalId}:{itemId}:
 * {processStep}` — reprocessar o mesmo período nunca duplica uma linha.
 */
export const historicalTheoreticalConsumption = pgTable("historical_theoretical_consumption", {
  id: id(),
  jumpparkOrderExternalId: text("jumppark_order_external_id").notNull(),
  sourceRecordType: historicalConsumptionSourceTypeEnum("source_record_type").notNull(),
  orderDate: date("order_date").notNull(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => inventoryItems.id),
  serviceId: uuid("service_id")
    .notNull()
    .references(() => services.id),
  vehicleCategory: orderVehicleCategoryEnum("vehicle_category").notNull(),
  processStep: processStepEnum("process_step").notNull(),
  recipeId: uuid("recipe_id")
    .notNull()
    .references(() => serviceConsumptionRules.id),
  /** Qual nível de referência foi usado para este cálculo — nunca confundido com "consumo real medido". */
  confidenceTier: recipeConfidenceTierEnum("confidence_tier").notNull(),
  theoreticalQuantity: numeric("theoretical_quantity", { precision: 12, scale: 3 }).notNull(),
  unit: inventoryUnitEnum("unit").notNull(),
  /** Custo médio do produto NO MOMENTO DO PROCESSAMENTO (não há rastro de custo histórico por data) — limitação documentada. Null quando o produto não tinha custo cadastrado. */
  theoreticalUnitCost: numeric("theoretical_unit_cost", { precision: 12, scale: 2 }),
  theoreticalCost: numeric("theoretical_cost", { precision: 12, scale: 2 }),
  active: active(),
  source: source(),
  externalId: text("external_id").notNull().unique(),
  notes: notes(),
  ...timestamps,
});
