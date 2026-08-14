import type { RecipeUsageType, VehicleCategory } from "@/lib/recipes/types";

/**
 * Missão do Modelo de Consumo Médio Gerencial V1 — núcleo puro (sem I/O) do modelo gerencial de
 * consumo: expected × apparent × desvio. Nunca lido por `preview.ts`/`automatic-consumption.ts`/
 * `resolution.ts` (o motor de consumo real) — este módulo existe só para comparação/relatório
 * gerencial, nunca gera `inventory_movements`, nunca aprova receita, nunca baixa estoque.
 *
 * `MANAGERIAL_VEHICLE_SIZE_MULTIPLIER` é uma tabela PRÓPRIA da camada gerencial — nunca
 * `getVehicleSizeMultiplier` (a função gated por `AREA_SENSITIVE_STEPS`, que é por ETAPA) nem o
 * `VEHICLE_SIZE_MULTIPLIER` técnico geral (`src/lib/recipes/vehicle-size-multiplier.ts`, que
 * continua com `suv=1.15`, intocado, servindo o caminho técnico/histórico antigo). O modelo
 * gerencial liga/desliga o multiplicador por RECEITA (`managerialSizeAdjustmentApplicable`),
 * granularidade que `AREA_SENSITIVE_STEPS` não consegue expressar (ex.: Atomic e Blend Spray
 * dividem o mesmo `process_step` "protecao_externa" mas só um dos dois recebe o multiplicador).
 *
 * Missão de Estoque Gerencial V2, seção 1 — DECISÃO DE NEGÓCIO EXPLÍCITA do gestor: para fins de
 * ESTOQUE/CONSUMO GERENCIAL (nunca para preço/classificação comercial), SUV e SEDAN são tratados
 * como a MESMA categoria de referência — `suv: 1.00` (era 1.15 na V1, agora igual a sedan).
 * Hatch (0.90) e Caminhonete (1.30) permanecem inalterados. `VEHICLE_SIZE_MULTIPLIER`
 * (`vehicle-size-multiplier.ts`) NÃO foi tocado — continua `suv=1.15` para todo o resto do
 * sistema (histórico teórico, motor real quando ativado).
 */
export const SUV_SEDAN_COMBINADO_FACTOR = 1.0;

export const MANAGERIAL_VEHICLE_SIZE_MULTIPLIER: Record<VehicleCategory, number> = {
  hatch: 0.9,
  sedan: 1.0,
  suv: SUV_SEDAN_COMBINADO_FACTOR,
  caminhonete: 1.3,
};

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export interface ExpectedConsumptionCell {
  usageType: RecipeUsageType | null;
  managerialBaselineQuantity: number | null;
  managerialSizeAdjustmentApplicable: boolean;
  vehicleCategory: VehicleCategory;
  /** Quantidade de serviços realizados nesta combinação (serviço×categoria) — fonte: histórico oficial/JumpPark já mapeado, nunca inventada aqui. */
  servicesRealized: number;
}

export interface ExpectedManagerialConsumptionResult {
  /** Soma de (serviços realizados × baseline gerencial × multiplicador quando aplicável), só para células STANDARD com baseline configurado. Null quando nenhuma célula elegível contribuiu. */
  expectedConsumption: number | null;
  cellsIncluded: number;
  /** Células `alternative`/`conditional`/`specific_service`/etc. — nunca somadas automaticamente (Missão do Modelo de Consumo Médio Gerencial V1, seção 5). */
  cellsExcludedNotStandard: number;
  /** Células STANDARD mas sem `managerialBaselineQuantity` configurado ainda — nunca inventa um valor. */
  cellsExcludedNoBaseline: number;
}

/**
 * Σ (serviços realizados × managerialBaselineQuantity × multiplicador de porte quando aplicável),
 * somando SÓ células `usageType === 'standard'` — `alternative`/`conditional`/qualquer outro valor
 * nunca entram automaticamente no agregado (o sistema não pode presumir qual alternativa foi
 * usada em cada OS; essa seleção não existe ainda). Uma célula com `usageType==='standard'` mas
 * sem `servicesRealized` (0) contribui 0 legitimamente — não é excluída, é somada como zero.
 */
export function computeExpectedManagerialConsumption(cells: ExpectedConsumptionCell[]): ExpectedManagerialConsumptionResult {
  let sum = 0;
  let cellsIncluded = 0;
  let cellsExcludedNotStandard = 0;
  let cellsExcludedNoBaseline = 0;

  for (const cell of cells) {
    if (cell.usageType !== "standard") {
      cellsExcludedNotStandard++;
      continue;
    }
    if (cell.managerialBaselineQuantity === null) {
      cellsExcludedNoBaseline++;
      continue;
    }
    const multiplier = cell.managerialSizeAdjustmentApplicable ? MANAGERIAL_VEHICLE_SIZE_MULTIPLIER[cell.vehicleCategory] : 1;
    sum += cell.servicesRealized * cell.managerialBaselineQuantity * multiplier;
    cellsIncluded++;
  }

  return {
    expectedConsumption: cellsIncluded > 0 ? round(sum, 3) : null,
    cellsIncluded,
    cellsExcludedNotStandard,
    cellsExcludedNoBaseline,
  };
}

export interface ApparentConsumptionInput {
  /** "Estoque inicial confiável" — null quando não há uma contagem física inicial confiável para ancorar o cálculo (mesmo conceito de `computeTheoreticalStockLevel`). Nunca inventado. */
  openingQuantity: number | null;
  /** Soma de compras/entradas reais no período (ENTRADA_TYPES) — sempre um número, 0 quando não houve nenhuma. */
  entradas: number;
  /** "Estoque atual confiável" — null quando não há saldo físico atual confiável. Nunca inventado. */
  currentQuantity: number | null;
}

/**
 * consumo aparente = estoque inicial confiável + compras/entradas − estoque atual confiável.
 * Null (nunca um número fabricado) quando faltar `openingQuantity` ou `currentQuantity`.
 */
export function computeApparentConsumption(input: ApparentConsumptionInput): number | null {
  if (input.openingQuantity === null || input.currentQuantity === null) return null;
  return round(input.openingQuantity + input.entradas - input.currentQuantity, 3);
}

export type ConsumptionVarianceStatus = "NORMAL" | "ATTENTION" | "HIGH_CONSUMPTION" | "LOW_CONSUMPTION" | "INSUFFICIENT_DATA";

export interface ConsumptionVarianceInput {
  expectedConsumption: number | null;
  apparentConsumption: number | null;
  /** Tolerância percentual DA RECEITA/PRODUTO (25 = 25%) — nunca uma tolerância universal. Null quando o produto não tem tolerância configurada. */
  tolerancePercentage: number | null;
}

export interface ConsumptionVarianceResult {
  varianceAbsolute: number | null;
  variancePercentage: number | null;
  confidence: "gerencial" | "insuficiente";
  status: ConsumptionVarianceStatus;
}

/**
 * Zona ATTENTION (V1): fora da faixa de tolerância declarada, mas dentro do dobro dela — um
 * amortecedor entre "normal" e "fora do esperado o bastante para alertar com força". Fora desse
 * dobro, vira HIGH/LOW_CONSUMPTION. Não especificado literalmente pela missão (que só dá exemplos
 * para NORMAL/HIGH/LOW) — decisão de V1, documentada aqui, revisável pelo gestor.
 */
const ATTENTION_BAND_MULTIPLIER = 2;

/**
 * Classifica o desvio entre o consumo esperado (gerencial) e o consumo aparente (real, via
 * estoque/compras). NUNCA bloqueia operação, nunca gera baixa, nunca altera estoque — é
 * classificação/alerta, nada mais. INSUFFICIENT_DATA sempre que faltar qualquer input — o sistema
 * prefere ausência de conclusão a fabricar precisão.
 */
export function computeConsumptionVariance(input: ConsumptionVarianceInput): ConsumptionVarianceResult {
  if (input.expectedConsumption === null || input.apparentConsumption === null || input.tolerancePercentage === null || input.expectedConsumption === 0) {
    return { varianceAbsolute: null, variancePercentage: null, confidence: "insuficiente", status: "INSUFFICIENT_DATA" };
  }

  const varianceAbsolute = round(input.apparentConsumption - input.expectedConsumption, 3);
  const variancePercentage = round((varianceAbsolute / input.expectedConsumption) * 100, 2);

  const toleranceFraction = input.tolerancePercentage / 100;
  const lowerBand = input.expectedConsumption * (1 - toleranceFraction);
  const upperBand = input.expectedConsumption * (1 + toleranceFraction);
  const lowerAttention = input.expectedConsumption * (1 - toleranceFraction * ATTENTION_BAND_MULTIPLIER);
  const upperAttention = input.expectedConsumption * (1 + toleranceFraction * ATTENTION_BAND_MULTIPLIER);

  let status: ConsumptionVarianceStatus;
  if (input.apparentConsumption >= lowerBand && input.apparentConsumption <= upperBand) {
    status = "NORMAL";
  } else if (input.apparentConsumption >= upperAttention) {
    status = "HIGH_CONSUMPTION";
  } else if (input.apparentConsumption <= lowerAttention) {
    status = "LOW_CONSUMPTION";
  } else {
    status = "ATTENTION";
  }

  return { varianceAbsolute, variancePercentage, confidence: "gerencial", status };
}
