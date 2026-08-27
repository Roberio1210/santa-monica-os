import type { InventoryUnit } from "@/lib/inventory/types";

export type VehicleCategory = "hatch" | "sedan" | "suv" | "caminhonete";

export const vehicleCategories: VehicleCategory[] = ["hatch", "sedan", "suv", "caminhonete"];

export type ProcessStep =
  | "pre_lavagem"
  | "shampoo"
  | "rodas"
  | "caixas_de_rodas"
  | "aspiracao"
  | "limpeza_interna"
  | "couro"
  | "plasticos_internos"
  | "vidros"
  | "cera"
  | "protecao_externa"
  | "pneus"
  | "motor"
  | "chassi"
  | "polimento_corte"
  | "polimento_refino"
  | "polimento_lustro"
  | "vitrificacao"
  | "higienizacao"
  | "farois"
  | "chuva_acida"
  | "cristalizacao"
  | "revisao_final"
  // Missão Z3.2 — etapas confirmadas para diferenciar Bronze/Silver/Gold de verdade.
  | "simbolos"
  | "letras"
  | "macanetas"
  | "sanitizacao_interna"
  | "cera_carnauba"
  | "batentes"
  | "descontaminacao_ferrosa"
  | "cromados"
  | "estepe"
  // Missão de Fechamento da Fase 1 (Bronze/Silver/Gold) — hidratação/revitalização de plásticos
  // internos e externos da Gold, distinta de "plasticos_internos" (higienização).
  | "hidratacao_plasticos";

export const processSteps: ProcessStep[] = [
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
  "simbolos",
  "letras",
  "macanetas",
  "sanitizacao_interna",
  "cera_carnauba",
  "batentes",
  "descontaminacao_ferrosa",
  "cromados",
  "estepe",
  "hidratacao_plasticos",
];

export type RecipeStatus = "rascunho" | "em_calibracao" | "aprovada" | "suspensa";

export type CalibrationSampleStatus = "valida" | "excluida";

/** Missão do Protocolo Operacional V1 — espelha recipe_usage_type em src/db/schema/inventory.ts. */
export type RecipeUsageType = "standard" | "conditional" | "alternative" | "specific_service" | "operational" | "durable";

/** Missão do Catálogo Técnico Mestre — espelha technical_function em src/db/schema/inventory.ts. */
export type TechnicalFunction =
  | "pre_wash"
  | "shampoo"
  | "apc"
  | "degreaser"
  | "acid_cleaner"
  | "tire_cleaner"
  | "tire_dressing"
  | "glass_cleaner"
  | "glass_decontamination"
  | "glass_coating"
  | "interior_cleaner"
  | "upholstery_cleaner"
  | "sanitizer"
  | "leather_cleaner"
  | "leather_conditioner"
  | "plastic_dressing"
  | "exterior_dressing"
  | "tar_glue_remover"
  | "iron_remover"
  | "paint_decontamination"
  | "cut_compound"
  | "refinish_compound"
  | "finish_compound"
  | "polish_inspection"
  | "wax"
  | "sealant"
  | "paint_coating"
  | "plastic_coating"
  | "headlight_coating"
  | "coating_maintenance"
  | "engine_degreaser"
  | "engine_dressing"
  | "chassis_cleaner"
  | "metal_cleaner"
  | "microfiber_cleaner"
  | "pad"
  | "microfiber"
  | "sprayer"
  | "equipment"
  | "ppe"
  | "paint"
  | "paint_finisher"
  | "multi_stage_polish"
  | "cleaner_wax"
  | "other";

/** Missão do Catálogo Técnico Mestre — espelha recipe_information_source em src/db/schema/inventory.ts. */
export type RecipeInformationSource = "manufacturer" | "technical_datasheet" | "specialized_source" | "purchase_document" | "santa_monica_operation" | "calibrated_real_usage";

/** Missão do Catálogo Técnico Mestre — espelha recipe_dilution_basis em src/db/schema/inventory.ts. */
export type RecipeDilutionBasis = "concentrate" | "prepared_solution" | "pure_product";

/**
 * Receita técnica de consumo — combinação serviço × categoria de veículo × etapa × produto.
 * `quantityPerService` é a mediana das amostras válidas (null enquanto não houver nenhuma —
 * nunca um valor inventado). `unit` é sempre a unidade-base do item (ml/g/unidade/caixa).
 */
export interface Recipe {
  id: string;
  serviceId: string;
  itemId: string;
  vehicleCategory: VehicleCategory;
  processStep: ProcessStep;
  quantityPerService: number | null;
  unit: InventoryUnit;
  status: RecipeStatus;
  version: number;
  isActiveVersion: boolean;
  /** Partes de água por parte de produto (1:5 → 5). Null = produto puro / não aplicável. */
  dilutionRatio: number | null;
  minObserved: number | null;
  maxObserved: number | null;
  sampleCount: number;
  lastCalibratedAt: string | null;
  notes: string | null;
  /**
   * Missão de Automação JumpPark → Consumo — valor técnico de referência inicial (fabricante/
   * gestor), nunca calculado pelo sistema. Distinto de `quantityPerService` (só vem de
   * calibração real). Null quando não há referência técnica configurada ainda.
   */
  technicalReferenceQuantity: number | null;
  /** Fonte do valor técnico de referência (instrução do gestor, ficha técnica do fabricante etc.). Null quando technicalReferenceQuantity é null. */
  technicalReferenceSource: string | null;
  /** Missão do Protocolo Operacional V1 — como esta receita específica participa da etapa. Nullable: nunca inferido, só confirmado pelo gestor. */
  usageType: RecipeUsageType | null;
  /** Função técnica desta receita específica. Nullable pelo mesmo motivo. */
  technicalFunction: TechnicalFunction | null;
  /** Categoria estruturada da fonte, ao lado de technicalReferenceSource (texto livre da citação exata). */
  informationSource: RecipeInformationSource | null;
  /** Sobre o que dilutionRatio é medido. Nullable: nunca inferido. */
  dilutionBasis: RecipeDilutionBasis | null;
  /**
   * Missão do Modelo de Consumo Médio Gerencial V1 — trilho GERENCIAL, paralelo e independente de
   * `quantityPerService` (calibração real) e de `technicalReferenceQuantity` (referência técnica
   * antiga). Estimativa administrativa (não medição física), nunca lida por
   * `preview.ts`/`automatic-consumption.ts`/`resolution.ts`. Null quando não há baseline gerencial
   * configurado ainda.
   */
  managerialBaselineQuantity: number | null;
  /** Faixa de tolerância da estimativa gerencial, em percentual (25 = 25%), por receita — nunca universal. Null quando managerialBaselineQuantity é null. */
  managerialTolerancePercentage: number | null;
  /** Fonte estruturada do baseline gerencial (mesmo enum de informationSource, campo próprio). Null quando managerialBaselineQuantity é null. */
  managerialBaselineSource: RecipeInformationSource | null;
  /** Data em que este baseline passou a valer — nunca retroage para período anterior ao registro. Null quando managerialBaselineQuantity é null. */
  managerialBaselineSince: string | null;
  /** Liga/desliga getVehicleSizeMultiplier SÓ para a projeção gerencial desta receita — granularidade por produto, nunca reaproveita/altera AREA_SENSITIVE_STEPS (por etapa). Default false no banco. */
  managerialSizeAdjustmentApplicable: boolean;
}

export interface NewRecipeInput {
  serviceId: string;
  itemId: string;
  vehicleCategory: VehicleCategory;
  processStep: ProcessStep;
  unit: InventoryUnit;
  dilutionRatio: number | null;
  notes: string | null;
  technicalReferenceQuantity?: number | null;
  technicalReferenceSource?: string | null;
}

/** Campos que o repositório aceita alterar — identidade da receita (serviço/categoria/etapa/produto) nunca muda após criada; para isso, ver createNewVersion. */
export interface RecipePatch {
  /** Missão 23 — usada só para redirecionar uma receita ao produto mestre durante uma consolidação explícita. */
  itemId?: string;
  status?: RecipeStatus;
  version?: number;
  isActiveVersion?: boolean;
  quantityPerService?: number | null;
  dilutionRatio?: number | null;
  minObserved?: number | null;
  maxObserved?: number | null;
  sampleCount?: number;
  lastCalibratedAt?: string | null;
  notes?: string | null;
  technicalReferenceQuantity?: number | null;
  technicalReferenceSource?: string | null;
  usageType?: RecipeUsageType | null;
  technicalFunction?: TechnicalFunction | null;
  informationSource?: RecipeInformationSource | null;
  dilutionBasis?: RecipeDilutionBasis | null;
  managerialBaselineQuantity?: number | null;
  managerialTolerancePercentage?: number | null;
  managerialBaselineSource?: RecipeInformationSource | null;
  managerialBaselineSince?: string | null;
  managerialSizeAdjustmentApplicable?: boolean;
}

export interface CalibrationSample {
  id: string;
  recipeId: string;
  /** Identificador externo da ordem no JumpPark, quando a amostra foi vinculada a uma ordem real. */
  serviceOrderExternalId: string | null;
  date: string;
  quantityBefore: number;
  quantityAfter: number;
  preparedQuantity: number | null;
  leftoverReused: number | null;
  discarded: number | null;
  dilutionRatio: number | null;
  /** Concentrado real consumido — sempre pré-calculado (ver src/lib/recipes/dilution.ts) antes de chegar ao repositório. */
  concentrateConsumed: number;
  responsibleName: string | null;
  status: CalibrationSampleStatus;
  exclusionReason: string | null;
  notes: string | null;
}

export interface NewSampleInput {
  recipeId: string;
  serviceOrderExternalId: string | null;
  date: string;
  quantityBefore: number;
  quantityAfter: number;
  preparedQuantity: number | null;
  leftoverReused: number | null;
  discarded: number | null;
  dilutionRatio: number | null;
  concentrateConsumed: number;
  responsibleName: string | null;
  notes: string | null;
}

export interface SamplePatch {
  status?: CalibrationSampleStatus;
  exclusionReason?: string | null;
}

/** Mínimo de amostras válidas para uma referência provisória (mediana já calculável). */
export const MIN_SAMPLES_FOR_PROVISIONAL = 5;

/** Quantidade de amostras preferida antes de aprovar a receita (não é um mínimo obrigatório). */
export const PREFERRED_SAMPLES_FOR_APPROVAL = 10;

/**
 * Missão do Protocolo Operacional V1 — projeção mínima de uma receita COMPARTILHADA
 * (`serviceId = null` no banco, reutilizável por vários serviços via `service_operational_steps`).
 * Nunca passa por `toRecipe()`/o guard que lança para service_id nulo — contém só os campos que
 * o mecanismo de resolução precisa para decidir quantidade esperada. Amplie explicitamente
 * quando um consumidor real precisar de mais campos, nunca "por via das dúvidas".
 */
export interface SharedRecipeMatch {
  id: string;
  itemId: string;
  vehicleCategory: VehicleCategory;
  processStep: ProcessStep;
  quantityPerService: number | null;
  technicalReferenceQuantity: number | null;
  technicalReferenceSource: string | null;
  unit: InventoryUnit;
  status: RecipeStatus;
  dilutionRatio: number | null;
  sampleCount: number;
}

/** Missão do Protocolo Operacional V1 — resultado da resolução em 3 passos (ver src/lib/recipes/resolution.ts). */
export type RecipeResolution =
  | { source: "specific"; recipe: Recipe }
  | { source: "shared"; recipe: SharedRecipeMatch }
  | { source: "none"; reason: "no_match" | "step_not_declared_for_service" };
