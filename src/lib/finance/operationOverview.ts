import "server-only";
import { computeDreReport } from "@/lib/finance/dre";
import { fetchDreSourceData } from "@/lib/finance/service";
import type { DreReport } from "@/lib/finance/types";
import { DATA_CORTE_JUMPPARK } from "@/lib/config/historical-source-precedence";
import { previousPeriodOf, type PeriodRange } from "@/lib/utils/timezone";

/**
 * Missão Financeiro 5D — apenas os dois centros de custo com visão própria na Central Financeira.
 * "administrativo_geral" nunca ganha aba própria (é o "compartilhado", já tratado nas outras abas).
 */
export type OperationKey = "estetica_automotiva" | "estacionamento";

export const OPERATION_LABELS: Record<OperationKey, string> = {
  estetica_automotiva: "Lavação",
  estacionamento: "Estacionamento",
};

export interface OperationQuantity {
  value: number | null;
  unidade: "lavagens" | "tickets/estadias";
  indisponivelMotivo: string | null;
}

export interface OperationOverview {
  group: OperationKey;
  label: string;
  /** DRE gerencial da operação isolada — receita, custos diretos, despesas, resultado, margem própria (nunca participação, que exige o total da empresa). */
  report: DreReport;
  /** Mesma operação, regime caixa — "quanto entrou de caixa rastreável", nunca confundir com receita por competência. */
  entradasCaixaRastreaveis: number | null;
  quantidade: OperationQuantity;
  ticketMedio: number | null;
  /** Sempre calculado a partir do relatório CONSOLIDADO (nunca do relatório isolado — receita/receita da própria operação sempre daria 100%). */
  participacaoFaturamento: number | null;
  crescimentoReceitaPercent: number | null;
  receitaBrutaPeriodoAnterior: number | null;
}

/**
 * Conta "unidades" reais de faturamento (1 lavação real / 1 ticket real) a partir dos itens de
 * receita da própria operação. Regra de honestidade (Missão 5D, item 9): a planilha histórica de
 * estacionamento é 1 linha = 1 DIA (totais diários), nunca 1 linha = 1 veículo — contar essas
 * linhas como "tickets" mentiria. Lavação não tem esse problema: tanto a planilha histórica
 * (1 linha = 1 lavação real) quanto o JumpPark (1 pedido = 1 lavação) têm a mesma granularidade.
 */
function computeQuantity(group: OperationKey, groupReport: DreReport): OperationQuantity {
  const items = group === "estetica_automotiva" ? groupReport.receitaBrutaEstetica.items : groupReport.receitaBrutaEstacionamento.items;
  const unidade: "lavagens" | "tickets/estadias" = group === "estetica_automotiva" ? "lavagens" : "tickets/estadias";

  if (items.length === 0) {
    return { value: null, unidade, indisponivelMotivo: "Nenhuma receita registrada no período." };
  }

  if (group === "estetica_automotiva") {
    // Planilha histórica e JumpPark têm a mesma granularidade (1 item = 1 lavação real) — soma direta.
    return { value: items.length, unidade, indisponivelMotivo: null };
  }

  const jumpParkItems = items.filter((item) => item.sourceKind === "jumppark_service_order");
  if (jumpParkItems.length === items.length) {
    return { value: jumpParkItems.length, unidade, indisponivelMotivo: null };
  }
  if (jumpParkItems.length === 0) {
    return {
      value: null,
      unidade,
      indisponivelMotivo: `Fonte do período (planilha histórica, antes de ${DATA_CORTE_JUMPPARK}) registra totais diários de estacionamento, não por veículo — quantidade de tickets não é calculável com honestidade.`,
    };
  }
  return {
    value: jumpParkItems.length,
    unidade,
    indisponivelMotivo: `Parcial — conta apenas tickets JumpPark (a partir de ${DATA_CORTE_JUMPPARK}); a parte do período coberta pela planilha histórica (totais diários) não entra nesta contagem.`,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function ticketMedioFrom(group: OperationKey, groupReport: DreReport, quantidade: OperationQuantity): number | null {
  if (quantidade.value === null || quantidade.value <= 0) return null;
  const items = group === "estetica_automotiva" ? groupReport.receitaBrutaEstetica.items : groupReport.receitaBrutaEstacionamento.items;
  const countedItems = group === "estacionamento" ? items.filter((item) => item.sourceKind === "jumppark_service_order") : items;
  const amount = round2(countedItems.reduce((sum, item) => sum + item.amount, 0));
  return round2(amount / quantidade.value);
}

export interface OperationOverviewDeps {
  groupReport: DreReport;
  consolidadoReport: DreReport;
  caixaReport: DreReport;
  previousGroupReport: DreReport;
}

/** Parte pura (sem banco) — recebe os 4 relatórios já calculados e monta o overview. Testável isoladamente. */
export function buildOperationOverview(group: OperationKey, deps: OperationOverviewDeps): OperationOverview {
  const { groupReport, consolidadoReport, caixaReport, previousGroupReport } = deps;
  const quantidade = computeQuantity(group, groupReport);
  const ticketMedio = ticketMedioFrom(group, groupReport, quantidade);
  const participacaoFaturamento = group === "estetica_automotiva" ? consolidadoReport.participacaoEsteticaReceita : consolidadoReport.participacaoEstacionamentoReceita;

  const current = groupReport.receitaBruta;
  const previous = previousGroupReport.receitaBruta;
  const crescimentoReceitaPercent = current !== null && previous !== null && previous > 0 ? round2(((current - previous) / previous) * 100) : null;

  return {
    group,
    label: OPERATION_LABELS[group],
    report: groupReport,
    entradasCaixaRastreaveis: caixaReport.receitaBruta,
    quantidade,
    ticketMedio,
    participacaoFaturamento,
    crescimentoReceitaPercent,
    receitaBrutaPeriodoAnterior: previous,
  };
}

/**
 * Busca real (Postgres) — uma única leitura de `fetchDreSourceData` reaproveitada nos 4 cálculos
 * (mesmo padrão de `fetchDreByCostCenterGroups`/`DrePage`, nunca duplica busca no banco).
 */
export async function fetchOperationOverview(group: OperationKey, period: PeriodRange): Promise<OperationOverview> {
  const sourceData = await fetchDreSourceData();
  const previous = previousPeriodOf(period);

  const groupReport = computeDreReport({ regime: "gerencial", competenceFrom: period.from, competenceTo: period.to, costCenterGroup: group, ...sourceData });
  const consolidadoReport = computeDreReport({ regime: "gerencial", competenceFrom: period.from, competenceTo: period.to, costCenterGroup: "consolidado", ...sourceData });
  const caixaReport = computeDreReport({ regime: "caixa", competenceFrom: period.from, competenceTo: period.to, costCenterGroup: group, ...sourceData });
  const previousGroupReport = computeDreReport({ regime: "gerencial", competenceFrom: previous.from, competenceTo: previous.to, costCenterGroup: group, ...sourceData });

  return buildOperationOverview(group, { groupReport, consolidadoReport, caixaReport, previousGroupReport });
}
