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
  | "revisao_final";

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
];

export type RecipeStatus = "rascunho" | "em_calibracao" | "aprovada" | "suspensa";

export type CalibrationSampleStatus = "valida" | "excluida";

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
}

export interface NewRecipeInput {
  serviceId: string;
  itemId: string;
  vehicleCategory: VehicleCategory;
  processStep: ProcessStep;
  unit: InventoryUnit;
  dilutionRatio: number | null;
  notes: string | null;
}

/** Campos que o repositório aceita alterar — identidade da receita (serviço/categoria/etapa/produto) nunca muda após criada; para isso, ver createNewVersion. */
export interface RecipePatch {
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
