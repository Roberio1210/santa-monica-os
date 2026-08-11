import "server-only";
import { fetchEligibleOrders } from "@/lib/jumppark-orders/eligible-orders";
import { fetchOrderPreview } from "@/lib/jumppark-orders/preview-service";
import { confirmOrderConsumption, type ConfirmConsumptionLineInput } from "@/lib/jumppark-orders/confirmation";
import { getVehicleSizeMultiplier } from "@/lib/recipes/vehicle-size-multiplier";
import type { ConsumptionPreview } from "@/lib/jumppark-orders/preview";
import type { EligibleOrder } from "@/lib/jumppark-orders/types";

/**
 * Missão de Automação JumpPark → Consumo, seção 13 — data a partir da qual o consumo automático
 * pode processar ordens reais. Nenhuma ordem com data anterior a esta é processada, nunca —
 * elimina qualquer possibilidade de backfill retroativo silencioso sobre os milhares de ordens
 * históricas já sincronizadas. Fixa (não configurável por env var) para ficar auditável no git.
 */
export const AUTOMATIC_CONSUMPTION_ACTIVATED_AT = "2026-08-11";

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export type SkipReason = "antes_da_ativacao" | "ja_consumida" | "servico_nao_mapeado" | "sem_receita_aprovada" | "categoria_veiculo_desconhecida" | "parcial_requer_revisao_humana" | "falha";

export interface AutomaticConsumptionOrderResult {
  externalId: string;
  /** true = escreveu de verdade (baixa real de estoque). Em dryRun, nunca é true — ver `wouldProcess`. */
  processed: boolean;
  /** true quando a ordem teria sido processada (prévia "pronta") — em dryRun, é o resultado útil para o painel/simulação. */
  wouldProcess: boolean;
  skipReason: SkipReason | null;
  linesConsumed: number;
  knownCost: number | null;
  errorMessage: string | null;
}

export interface AutomaticConsumptionSummary {
  /** true quando esta chamada só simulou (seção 16 — validação sem escrita real). */
  dryRun: boolean;
  ordersEvaluated: number;
  ordersConsumed: number;
  ordersSkippedBeforeActivation: number;
  ordersAlreadyConsumed: number;
  ordersUnmapped: number;
  ordersWithoutApprovedRecipe: number;
  ordersRequiringHumanReview: number;
  ordersFailed: number;
  totalLinesConsumed: number;
  totalKnownCost: number | null;
  results: AutomaticConsumptionOrderResult[];
}

/**
 * Processa (ou só simula, se `dryRun`) consumo automático para ordens JumpPark reais e
 * finalizadas num período (Missão de Automação JumpPark → Consumo, seção 8). Reaproveita
 * INTEGRALMENTE a infraestrutura da Fase D já em produção: `fetchEligibleOrders` (mesma fonte da
 * tela humana `/estoque/ordens`, único lugar com acesso à placa real — nunca persistida sem
 * máscara em Neon), `fetchOrderPreview`/`computeConsumptionPreview` (mesmo motor de prévia, já
 * gated em receitas "aprovada"), e `confirmOrderConsumption` (mesma transação idempotente e
 * segura contra saldo negativo).
 *
 * Só processa de verdade uma ordem quando a prévia está "pronta" — TODOS os serviços mapeados da
 * ordem têm receita aprovada aplicável, sem nenhuma pendência. Uma ordem "parcial" (só alguns
 * serviços resolvíveis) fica para revisão humana em /estoque/ordens — automação nunca decide
 * sozinha o que fazer com uma pendência. `responsibleName` fixo identifica a origem como
 * automática nas movimentações geradas, nunca confundido com uma confirmação manual.
 *
 * `dryRun=true` (usada pelo painel "Consumo automático" e pela validação da seção 16) roda
 * exatamente a mesma classificação, mas nunca chama `confirmOrderConsumption` — zero escrita.
 */
export async function processAutomaticConsumption(startDate: string, endDate: string, options: { dryRun?: boolean } = {}): Promise<AutomaticConsumptionSummary> {
  const dryRun = options.dryRun ?? false;
  const { orders, jumpparkConfigured, error } = await fetchEligibleOrders(startDate, endDate);

  const results: AutomaticConsumptionOrderResult[] = [];
  let ordersConsumed = 0;
  let ordersSkippedBeforeActivation = 0;
  let ordersAlreadyConsumed = 0;
  let ordersUnmapped = 0;
  let ordersWithoutApprovedRecipe = 0;
  let ordersRequiringHumanReview = 0;
  let ordersFailed = 0;
  let totalLinesConsumed = 0;
  let totalKnownCost = 0;
  let anyKnownCost = false;

  if (!jumpparkConfigured) {
    return {
      dryRun,
      ordersEvaluated: 0,
      ordersConsumed: 0,
      ordersSkippedBeforeActivation: 0,
      ordersAlreadyConsumed: 0,
      ordersUnmapped: 0,
      ordersWithoutApprovedRecipe: 0,
      ordersRequiringHumanReview: 0,
      ordersFailed: error ? 1 : 0,
      totalLinesConsumed: 0,
      totalKnownCost: null,
      results: error ? [{ externalId: "n/a", processed: false, wouldProcess: false, skipReason: "falha", linesConsumed: 0, knownCost: null, errorMessage: error }] : [],
    };
  }

  for (const order of orders) {
    const result = await processOneOrder(order, dryRun);
    results.push(result);

    switch (result.skipReason) {
      case "antes_da_ativacao":
        ordersSkippedBeforeActivation += 1;
        break;
      case "ja_consumida":
        ordersAlreadyConsumed += 1;
        break;
      case "servico_nao_mapeado":
        ordersUnmapped += 1;
        break;
      case "sem_receita_aprovada":
        ordersWithoutApprovedRecipe += 1;
        break;
      case "categoria_veiculo_desconhecida":
      case "parcial_requer_revisao_humana":
        ordersRequiringHumanReview += 1;
        break;
      case "falha":
        ordersFailed += 1;
        break;
      default:
        break;
    }

    if (result.processed || (dryRun && result.wouldProcess)) {
      ordersConsumed += 1;
      totalLinesConsumed += result.linesConsumed;
      if (result.knownCost !== null) {
        totalKnownCost += result.knownCost;
        anyKnownCost = true;
      }
    }
  }

  return {
    dryRun,
    ordersEvaluated: orders.length,
    ordersConsumed,
    ordersSkippedBeforeActivation,
    ordersAlreadyConsumed,
    ordersUnmapped,
    ordersWithoutApprovedRecipe,
    ordersRequiringHumanReview,
    ordersFailed,
    totalLinesConsumed,
    totalKnownCost: anyKnownCost ? Math.round(totalKnownCost * 100) / 100 : null,
    results,
  };
}

export interface OrderClassification {
  action: "consumir" | "pular";
  skipReason: SkipReason | null;
  lines: ConfirmConsumptionLineInput[];
}

/**
 * Núcleo puro de decisão (extraído para ser 100% testável sem I/O nem mocks, mesmo padrão já
 * usado em `computeConsumptionPreview`/`preview.ts`): recebe uma prévia já calculada e decide se
 * a ordem deve consumir automaticamente e quais linhas exatas gerar, aplicando o multiplicador de
 * porte do veículo. Nunca toca em banco — só decide.
 */
export function classifyOrderForAutomaticConsumption(preview: ConsumptionPreview): OrderClassification {
  if (preview.alreadyConsumed) return { action: "pular", skipReason: "ja_consumida", lines: [] };
  if (preview.vehicleCategory === "desconhecido") return { action: "pular", skipReason: "categoria_veiculo_desconhecida", lines: [] };
  if (preview.unmappedServices.length > 0) return { action: "pular", skipReason: "servico_nao_mapeado", lines: [] };
  if (preview.lines.length === 0) return { action: "pular", skipReason: "sem_receita_aprovada", lines: [] };
  // Automação nunca decide por conta própria diante de uma pendência — só processa quando a
  // prévia está inteiramente resolvida (todo serviço mapeado tem receita aprovada aplicável).
  if (preview.state !== "pronta") return { action: "pular", skipReason: "parcial_requer_revisao_humana", lines: [] };

  const lines: ConfirmConsumptionLineInput[] = preview.lines.map((line) => {
    const multiplier = getVehicleSizeMultiplier(preview.vehicleCategory, line.processStep);
    const confirmedQuantity = round3(line.expectedQuantity * multiplier);
    const diverges = Math.abs(confirmedQuantity - line.expectedQuantity) > 0.001;
    return {
      itemId: line.itemId,
      recipeId: line.recipeId,
      processStep: line.processStep,
      expectedQuantity: line.expectedQuantity,
      confirmedQuantity,
      justification: diverges ? `Ajuste automático por porte do veículo (categoria: ${preview.vehicleCategory}, fator: ${multiplier}).` : null,
      isExtra: false,
    };
  });

  return { action: "consumir", skipReason: null, lines };
}

async function processOneOrder(order: EligibleOrder, dryRun: boolean): Promise<AutomaticConsumptionOrderResult> {
  if (order.date < AUTOMATIC_CONSUMPTION_ACTIVATED_AT) {
    return { externalId: order.externalId, processed: false, wouldProcess: false, skipReason: "antes_da_ativacao", linesConsumed: 0, knownCost: null, errorMessage: null };
  }
  if (order.activeConfirmationId) {
    return { externalId: order.externalId, processed: false, wouldProcess: false, skipReason: "ja_consumida", linesConsumed: 0, knownCost: null, errorMessage: null };
  }

  try {
    const preview = await fetchOrderPreview(order);
    const classification = classifyOrderForAutomaticConsumption(preview);

    if (classification.action === "pular") {
      return { externalId: order.externalId, processed: false, wouldProcess: false, skipReason: classification.skipReason, linesConsumed: 0, knownCost: null, errorMessage: null };
    }

    if (dryRun) {
      return { externalId: order.externalId, processed: false, wouldProcess: true, skipReason: null, linesConsumed: classification.lines.length, knownCost: preview.knownCostTotal, errorMessage: null };
    }

    const confirmation = await confirmOrderConsumption({
      externalId: order.externalId,
      vehicleCategory: preview.vehicleCategory,
      responsibleName: "Sistema (consumo automático)",
      justification: null,
      lines: classification.lines,
      removedItemsLog: [],
      isPartial: false,
    });

    if (confirmation.alreadyExisted) {
      return { externalId: order.externalId, processed: false, wouldProcess: false, skipReason: "ja_consumida", linesConsumed: 0, knownCost: null, errorMessage: null };
    }

    return { externalId: order.externalId, processed: true, wouldProcess: true, skipReason: null, linesConsumed: classification.lines.length, knownCost: preview.knownCostTotal, errorMessage: null };
  } catch (err) {
    return {
      externalId: order.externalId,
      processed: false,
      wouldProcess: false,
      skipReason: "falha",
      linesConsumed: 0,
      knownCost: null,
      errorMessage: err instanceof Error ? err.message : "Falha desconhecida ao processar consumo automático.",
    };
  }
}
