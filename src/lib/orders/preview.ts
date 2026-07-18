/**
 * Motor de prévia de consumo (Fase D, seção 4) — função pura, sem I/O. O chamador reúne
 * mapeamentos, receitas e saldos reais e monta o input; esta função só decide o estado da
 * prévia e o que mostrar, nunca busca dado nenhum sozinha.
 */
import type { InventoryUnit } from "@/lib/inventory/types";
import type { ProcessStep, Recipe } from "@/lib/recipes/types";
import type { JumpparkServiceMappingStatus, OrderVehicleCategory } from "@/lib/orders/types";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export type PreviewState = "pronta" | "parcial" | "bloqueada";

export interface PreviewLine {
  serviceLineDescription: string;
  canonicalServiceId: string;
  canonicalServiceName: string;
  processStep: ProcessStep;
  itemId: string;
  itemName: string;
  recipeId: string;
  recipeVersion: number;
  expectedQuantity: number;
  unit: InventoryUnit;
  currentBalance: number;
  projectedBalance: number;
  hasSufficientBalance: boolean;
  knownCost: number | null;
}

export interface ServiceIssue {
  serviceLineDescription: string;
}

export interface ServiceWithoutRecipeIssue extends ServiceIssue {
  canonicalServiceId: string;
  canonicalServiceName: string;
  reason: string;
}

export interface LineIssue {
  description: string;
}

export interface ConsumptionPreview {
  externalId: string;
  vehicleCategory: OrderVehicleCategory;
  state: PreviewState;
  lines: PreviewLine[];
  unmappedServices: ServiceIssue[];
  servicesWithoutApprovedRecipe: ServiceWithoutRecipeIssue[];
  itemsWithoutProduct: LineIssue[];
  itemsWithInsufficientBalance: LineIssue[];
  unitMismatches: LineIssue[];
  alreadyConsumed: boolean;
  blockingReasons: string[];
  /** Soma dos custos conhecidos das linhas — null quando nenhuma linha tem custo cadastrado. */
  knownCostTotal: number | null;
  /** true quando ao menos uma linha não tem custo cadastrado — nunca tratado como bloqueio, só sinalizado. */
  costIncomplete: boolean;
}

export interface PreviewServiceMapping {
  canonicalServiceId: string | null;
  canonicalServiceName: string | null;
  status: JumpparkServiceMappingStatus;
}

export interface PreviewItem {
  id: string;
  name: string;
  unit: InventoryUnit;
  currentQuantity: number;
  unitCost: number | null;
}

export interface PreviewInput {
  externalId: string;
  services: { description: string; amount: number }[];
  vehicleCategory: OrderVehicleCategory;
  /** Confirmação ativa (não estornada) já existente para esta ordem, quando houver — bloqueia a prévia por completo. */
  activeConfirmationId: string | null;
  /** Chave = texto exato do serviço no JumpPark. */
  serviceMappings: Map<string, PreviewServiceMapping>;
  /** Chave = `${canonicalServiceId}:${vehicleCategory}` → todas as versões ativas (qualquer status) de receita para essa combinação. */
  recipesByService: Map<string, Recipe[]>;
  itemsById: Map<string, PreviewItem>;
}

export function computeConsumptionPreview(input: PreviewInput): ConsumptionPreview {
  const { externalId, services, vehicleCategory, activeConfirmationId } = input;

  if (activeConfirmationId) {
    return {
      externalId,
      vehicleCategory,
      state: "bloqueada",
      lines: [],
      unmappedServices: [],
      servicesWithoutApprovedRecipe: [],
      itemsWithoutProduct: [],
      itemsWithInsufficientBalance: [],
      unitMismatches: [],
      alreadyConsumed: true,
      blockingReasons: ["Esta ordem já tem uma confirmação de consumo ativa — estorne antes de processar de novo."],
      knownCostTotal: null,
      costIncomplete: true,
    };
  }

  const blockingReasons: string[] = [];
  if (vehicleCategory === "desconhecido") blockingReasons.push("Categoria do veículo ainda não confirmada.");

  const unmappedServices: ServiceIssue[] = [];
  const servicesWithoutApprovedRecipe: ServiceWithoutRecipeIssue[] = [];
  const itemsWithoutProduct: LineIssue[] = [];
  const itemsWithInsufficientBalance: LineIssue[] = [];
  const unitMismatches: LineIssue[] = [];
  const lines: PreviewLine[] = [];

  let anyMappedService = false;
  let anyServiceWithUsableLine = false;
  let allMappedServicesHaveUsableLine = true;

  for (const serviceLine of services) {
    const mapping = input.serviceMappings.get(serviceLine.description);
    if (!mapping || mapping.status === "nao_mapeado" || !mapping.canonicalServiceId) {
      unmappedServices.push({ serviceLineDescription: serviceLine.description });
      blockingReasons.push(`Serviço "${serviceLine.description}" ainda não está mapeado.`);
      allMappedServicesHaveUsableLine = false;
      continue;
    }

    anyMappedService = true;
    const key = `${mapping.canonicalServiceId}:${vehicleCategory}`;
    const recipes = input.recipesByService.get(key) ?? [];
    const approved = recipes.filter((r) => r.status === "aprovada" && r.quantityPerService !== null);

    if (approved.length === 0) {
      servicesWithoutApprovedRecipe.push({
        serviceLineDescription: serviceLine.description,
        canonicalServiceId: mapping.canonicalServiceId,
        canonicalServiceName: mapping.canonicalServiceName ?? "",
        reason: "Consumo indisponível: receita ainda não calibrada.",
      });
      allMappedServicesHaveUsableLine = false;
      continue;
    }

    let serviceHasUsableLine = false;
    for (const recipe of approved) {
      const item = input.itemsById.get(recipe.itemId);
      if (!item) {
        itemsWithoutProduct.push({ description: `Produto da receita não encontrado (receita ${recipe.id}).` });
        continue;
      }
      if (item.unit !== recipe.unit) {
        unitMismatches.push({ description: `${item.name}: unidade da receita (${recipe.unit}) diferente da unidade do produto (${item.unit}).` });
        blockingReasons.push(`Inconsistência de unidade em ${item.name}.`);
        continue;
      }

      const expectedQuantity = recipe.quantityPerService as number;
      const projectedBalance = round3(item.currentQuantity - expectedQuantity);
      const hasSufficientBalance = projectedBalance >= 0;
      if (!hasSufficientBalance) {
        itemsWithInsufficientBalance.push({ description: `${item.name}: saldo ${item.currentQuantity} ${item.unit}, esperado ${expectedQuantity} ${item.unit}.` });
      }

      lines.push({
        serviceLineDescription: serviceLine.description,
        canonicalServiceId: mapping.canonicalServiceId,
        canonicalServiceName: mapping.canonicalServiceName ?? "",
        processStep: recipe.processStep,
        itemId: item.id,
        itemName: item.name,
        recipeId: recipe.id,
        recipeVersion: recipe.version,
        expectedQuantity,
        unit: item.unit,
        currentBalance: item.currentQuantity,
        projectedBalance,
        hasSufficientBalance,
        knownCost: item.unitCost !== null ? round2(item.unitCost * expectedQuantity) : null,
      });
      serviceHasUsableLine = true;
    }

    if (serviceHasUsableLine) anyServiceWithUsableLine = true;
    else allMappedServicesHaveUsableLine = false;
  }

  const isHardBlocked = vehicleCategory === "desconhecido" || unmappedServices.length > 0 || unitMismatches.length > 0;

  let state: PreviewState;
  if (isHardBlocked) {
    state = "bloqueada";
  } else if (!anyMappedService || !anyServiceWithUsableLine) {
    state = "bloqueada";
    if (blockingReasons.length === 0) blockingReasons.push("Consumo indisponível: receita ainda não calibrada.");
  } else if (allMappedServicesHaveUsableLine) {
    state = "pronta";
  } else {
    state = "parcial";
  }

  const knownCosts = lines.map((l) => l.knownCost).filter((c): c is number => c !== null);
  const knownCostTotal = knownCosts.length > 0 ? round2(knownCosts.reduce((sum, c) => sum + c, 0)) : null;
  const costIncomplete = lines.some((l) => l.knownCost === null);

  return {
    externalId,
    vehicleCategory,
    state,
    lines,
    unmappedServices,
    servicesWithoutApprovedRecipe,
    itemsWithoutProduct,
    itemsWithInsufficientBalance,
    unitMismatches,
    alreadyConsumed: false,
    blockingReasons,
    knownCostTotal,
    costIncomplete,
  };
}
