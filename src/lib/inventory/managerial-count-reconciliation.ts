import "server-only";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { getLastTwoReliableCounts, type ReliableCountPosition } from "@/lib/inventory/managerial-physical-count";
import { sumEntradasFromMovements } from "@/lib/inventory/managerial-stock-window";
import { getManagerialServicesRealized } from "@/lib/jumppark-orders/managerial-services-realized";
import { buildExpectedConsumptionCellsForItem, determineDataQuality, fetchManagerialRecipesByItem } from "@/lib/inventory/managerial-consumption-analysis";
import type { ManagerialDataQuality } from "@/lib/inventory/managerial-consumption-analysis";
import { computeApparentConsumption, computeConsumptionVariance, computeExpectedManagerialConsumption } from "@/lib/inventory/managerial-consumption-variance";
import type { ConsumptionVarianceStatus } from "@/lib/inventory/managerial-consumption-variance";
import { computeManagerialYield } from "@/lib/inventory/yield";
import type { MovementType } from "@/lib/inventory/types";

/**
 * Missão de Estoque Gerencial V2, seção 7/8 — "janela gerencial entre contagens", read-only.
 * Nunca duplica matemática: reaproveita os núcleos puros da Missão do Modelo Gerencial V1
 * (`computeApparentConsumption`/`computeExpectedManagerialConsumption`/
 * `computeConsumptionVariance`) e o wiring da Missão de Wiring V1
 * (`getManagerialServicesRealized`), além do `buildExpectedConsumptionCellsForItem` extraído
 * nesta missão. Nunca escreve nada — nunca gera `inventory_movements`, nunca altera receita,
 * nunca ativa o motor real.
 */
export interface ConsumptionBetweenCountsResult {
  itemId: string;
  hasTwoReliablePositions: boolean;
  previousCount: ReliableCountPosition | null;
  latestCount: ReliableCountPosition | null;
  entries: number | null;
  servicesRealized: number;
  expectedConsumption: number | null;
  apparentConsumption: number | null;
  varianceAbsolute: number | null;
  variancePercentage: number | null;
  tolerancePercentage: number | null;
  status: ConsumptionVarianceStatus;
  dataQuality: ManagerialDataQuality;
  reasons: string[];
}

/**
 * "Desde a última contagem..." (seção 8) — deriva automaticamente as duas últimas posições
 * confiáveis de um item e compara consumo esperado × aparente entre elas. `INSUFFICIENT_DATA`
 * sempre que houver menos de 2 posições — nunca inventa uma janela.
 */
export async function analyzeConsumptionBetweenCounts(itemId: string): Promise<ConsumptionBetweenCountsResult> {
  const { latest, previous } = await getLastTwoReliableCounts(itemId);

  if (!latest || !previous) {
    return {
      itemId,
      hasTwoReliablePositions: false,
      previousCount: previous,
      latestCount: latest,
      entries: null,
      servicesRealized: 0,
      expectedConsumption: null,
      apparentConsumption: null,
      varianceAbsolute: null,
      variancePercentage: null,
      tolerancePercentage: null,
      status: "INSUFFICIENT_DATA",
      dataQuality: "INSUFFICIENT",
      reasons: ["Não há duas posições físicas confiáveis para calcular consumo aparente."],
    };
  }

  const repo = getInventoryRepository();
  const [movements, servicesRealizedResult, { recipesByItem }] = await Promise.all([
    repo.listMovements(itemId),
    getManagerialServicesRealized(previous.date, latest.date),
    fetchManagerialRecipesByItem(),
  ]);

  const entries = sumEntradasFromMovements(
    movements.filter((m) => m.date > previous.date && m.date <= latest.date).map((m) => ({ type: m.type as MovementType, quantity: m.quantity })),
  );
  const apparentConsumption = computeApparentConsumption({ openingQuantity: previous.quantity, entradas: entries, currentQuantity: latest.quantity });

  const recipes = recipesByItem.get(itemId) ?? [];
  const servicesRealizedByKey = new Map(servicesRealizedResult.cells.map((c) => [`${c.serviceId}:${c.vehicleCategoryBucket}`, c.servicesRealized]));
  const cells = buildExpectedConsumptionCellsForItem(recipes, servicesRealizedByKey);
  const expected = computeExpectedManagerialConsumption(cells);

  const tolerancePercentage = recipes.find((r) => r.managerialTolerancePercentage !== null)?.managerialTolerancePercentage ?? null;
  const variance = computeConsumptionVariance({ expectedConsumption: expected.expectedConsumption, apparentConsumption, tolerancePercentage });
  const hasIndeterminadoBucket = servicesRealizedResult.cells.some((c) => c.vehicleCategoryBucket === "indeterminado");

  const reasons: string[] = [];
  if (recipes.length === 0) {
    reasons.push("Produto sem receita gerencial declarada em Bronze/Silver/Gold — não é possível calcular consumo esperado.");
  } else if (expected.expectedConsumption === null) {
    reasons.push(
      expected.cellsExcludedNotStandard > 0 && expected.cellsIncluded === 0
        ? "Nenhuma receita STANDARD deste produto tem baseline gerencial suficiente — produto participa só como alternative/conditional (nunca somado automaticamente)."
        : "Nenhuma célula STANDARD com baseline gerencial contribuiu para este produto no período entre as duas contagens.",
    );
  }
  if (hasIndeterminadoBucket) {
    reasons.push("Parte dos serviços realizados no período tem porte indeterminado (nome JumpPark sem nenhum sufixo de categoria) — tratado como neutro (sedan, fator 1.00) só para o cálculo.");
  }

  return {
    itemId,
    hasTwoReliablePositions: true,
    previousCount: previous,
    latestCount: latest,
    entries,
    servicesRealized: cells.reduce((sum, c) => sum + c.servicesRealized, 0),
    expectedConsumption: expected.expectedConsumption,
    apparentConsumption,
    varianceAbsolute: variance.varianceAbsolute,
    variancePercentage: variance.variancePercentage,
    tolerancePercentage,
    status: variance.status,
    dataQuality: determineDataQuality({ expectedConsumption: expected.expectedConsumption, apparentConsumption, status: variance.status }, false, hasIndeterminadoBucket),
    reasons,
  };
}

/** Missão de Estoque Gerencial V2, seção 17 — resumo gerencial de um produto para consulta pontual. */
export interface ProductManagerialInventorySummary {
  itemId: string;
  itemName: string;
  brand: string | null;
  unit: string;
  currentQuantity: number;
  quantityStatus: string;
  lastCount: ReliableCountPosition | null;
  previousCount: ReliableCountPosition | null;
  entriesSinceLastCount: number | null;
  servicesSinceLastCount: number;
  expectedConsumption: number | null;
  apparentConsumption: number | null;
  varianceAbsolute: number | null;
  variancePercentage: number | null;
  tolerancePercentage: number | null;
  status: ConsumptionVarianceStatus;
  dataQuality: ManagerialDataQuality;
  /** RENDIMENTO GERENCIAL ESTIMADO — nunca "real"/"garantido". */
  expectedServicesPerPackage: number | null;
}

export async function getProductManagerialInventorySummary(itemId: string): Promise<ProductManagerialInventorySummary> {
  const repo = getInventoryRepository();
  const [item, { recipesByItem }, between] = await Promise.all([repo.getItem(itemId), fetchManagerialRecipesByItem(), analyzeConsumptionBetweenCounts(itemId)]);
  if (!item) throw new Error(`Item de estoque não encontrado: ${itemId}`);

  const recipes = recipesByItem.get(itemId) ?? [];
  const yieldEstimate = computeManagerialYield(item.packageCapacity, recipes[0]?.managerialBaselineQuantity ?? null);

  return {
    itemId,
    itemName: item.name,
    brand: item.brand,
    unit: item.unit,
    currentQuantity: item.currentQuantity,
    quantityStatus: item.quantityStatus,
    lastCount: between.latestCount,
    previousCount: between.previousCount,
    entriesSinceLastCount: between.entries,
    servicesSinceLastCount: between.servicesRealized,
    expectedConsumption: between.expectedConsumption,
    apparentConsumption: between.apparentConsumption,
    varianceAbsolute: between.varianceAbsolute,
    variancePercentage: between.variancePercentage,
    tolerancePercentage: between.tolerancePercentage,
    status: between.status,
    dataQuality: between.dataQuality,
    expectedServicesPerPackage: yieldEstimate.expectedServicesPerPackage,
  };
}

export type ManagerialAlertSeverity = "info" | "warning" | "critical";

export interface ManagerialAlert {
  status: ConsumptionVarianceStatus;
  severity: ManagerialAlertSeverity;
  message: string;
}

/**
 * Missão de Estoque Gerencial V2, seção 15/16 — estrutura de alerta READ-ONLY. Nunca enviado
 * automaticamente nesta missão (só a função existe). Linguagem sempre gerencial/hipotética —
 * nunca "funcionário desperdiçou" ou "serviço não foi feito": desvio é sinal, não conclusão.
 */
export function buildManagerialAlert(input: { itemName: string; status: ConsumptionVarianceStatus; variancePercentage: number | null; periodStart: string | null; periodEnd: string | null }): ManagerialAlert {
  const period = input.periodStart && input.periodEnd ? ` entre ${input.periodStart} e ${input.periodEnd}` : "";
  const pct = input.variancePercentage !== null ? Math.abs(input.variancePercentage).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : null;

  switch (input.status) {
    case "NORMAL":
      return { status: "NORMAL", severity: "info", message: `Consumo de ${input.itemName} dentro da faixa gerencial esperada${period}.` };
    case "ATTENTION":
      return {
        status: "ATTENTION",
        severity: "warning",
        message: `Consumo aparente de ${input.itemName} ficou fora da faixa gerencial esperada${pct !== null ? ` (${pct}%)` : ""}${period} — verificar dosagem, desperdício, uso fora das OS ou baseline.`,
      };
    case "HIGH_CONSUMPTION":
      return {
        status: "HIGH_CONSUMPTION",
        severity: "warning",
        message: `Consumo aparente de ${input.itemName} ficou${pct !== null ? ` ${pct}%` : ""} acima da referência gerencial${period} — possível consumo acima do esperado; verificar dosagem, desperdício, uso fora das OS ou baseline.`,
      };
    case "LOW_CONSUMPTION":
      return {
        status: "LOW_CONSUMPTION",
        severity: "warning",
        message: `Consumo aparente de ${input.itemName} ficou${pct !== null ? ` ${pct}%` : ""} abaixo do esperado para os serviços realizados${period} — possível consumo abaixo do esperado; verificar execução da etapa ou baseline.`,
      };
    case "INSUFFICIENT_DATA":
      return { status: "INSUFFICIENT_DATA", severity: "info", message: `Não há duas posições físicas confiáveis para calcular consumo aparente de ${input.itemName}.` };
  }
}
