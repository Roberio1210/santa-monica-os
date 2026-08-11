/**
 * Missão de Instrumentação Gerencial — "custo de serviço" (seção 6/9 da missão). Reaproveita, sem
 * duplicar, a mesma regra já usada em `inventory/autonomy.ts`: só receita com status "aprovada"
 * (mediana real de amostras de calibração, nunca um número digitado à mão) participa do cálculo.
 *
 * Objetivo explícito da missão: "custo de produto por serviço + outros custos disponíveis = custo
 * operacional conhecido do serviço" — comparável ao preço vendido, MAS nunca apresentado como
 * margem real quando algum componente de custo ainda não existe. `isPartial=true` sempre que
 * faltar receita aprovada para qualquer etapa OU o custo do produto usado nela ainda não estiver
 * cadastrado — nesse caso a UI deve mostrar "Custo parcial", nunca um número fechado.
 */

export type RecipeStatusForCost = "rascunho" | "em_calibracao" | "aprovada" | "suspensa";

export interface RecipeCostInput {
  itemId: string;
  itemName: string;
  processStep: string;
  quantityPerService: number | null;
  unit: string;
  status: RecipeStatusForCost;
  isActiveVersion: boolean;
}

export interface ServiceCostLine {
  itemId: string;
  itemName: string;
  processStep: string;
  quantityPerService: number;
  unit: string;
  /** Null quando o produto ainda não tem custo médio cadastrado — nunca 0. */
  unitCost: number | null;
  /** Null quando `unitCost` é null — nunca calculado a partir de um custo desconhecido. */
  lineCost: number | null;
}

export interface ServiceCostEstimate {
  /** Soma de `lineCost` só das linhas com custo conhecido — nunca inclui uma linha desconhecida como 0. */
  knownCost: number;
  lines: ServiceCostLine[];
  /** true quando não há nenhuma receita aprovada, ou quando ao menos um produto usado não tem custo cadastrado. */
  isPartial: boolean;
  /** Sempre preenchido quando isPartial=true — explica exatamente o que falta. */
  partialReason: string | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeServiceCostEstimate(recipes: RecipeCostInput[], itemCostById: Map<string, number | null>): ServiceCostEstimate {
  const approved = recipes.filter((r) => r.isActiveVersion && r.status === "aprovada" && r.quantityPerService !== null);

  if (approved.length === 0) {
    return { knownCost: 0, lines: [], isPartial: true, partialReason: "Custo parcial — nenhuma receita aprovada cadastrada ainda para este serviço." };
  }

  const lines: ServiceCostLine[] = approved.map((r) => {
    const unitCost = itemCostById.get(r.itemId) ?? null;
    const quantityPerService = r.quantityPerService as number;
    return {
      itemId: r.itemId,
      itemName: r.itemName,
      processStep: r.processStep,
      quantityPerService,
      unit: r.unit,
      unitCost,
      lineCost: unitCost !== null ? round2(quantityPerService * unitCost) : null,
    };
  });

  const knownCost = round2(lines.reduce((sum, l) => sum + (l.lineCost ?? 0), 0));
  const itemsWithoutCost = lines.filter((l) => l.unitCost === null);

  if (itemsWithoutCost.length > 0) {
    const names = [...new Set(itemsWithoutCost.map((l) => l.itemName))].join(", ");
    return { knownCost, lines, isPartial: true, partialReason: `Custo parcial — produto(s) sem custo médio cadastrado ainda: ${names}.` };
  }

  return { knownCost, lines, isPartial: false, partialReason: null };
}
