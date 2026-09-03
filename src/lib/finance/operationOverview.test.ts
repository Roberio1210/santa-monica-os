import { describe, expect, it } from "vitest";
import { buildOperationOverview } from "@/lib/finance/operationOverview";
import type { DreLineItem, DreReport } from "@/lib/finance/types";

function item(overrides: Partial<DreLineItem>): DreLineItem {
  return {
    sourceKind: "jumppark_service_order",
    sourceId: "order-1",
    date: "2026-07-10",
    description: "item",
    partyName: null,
    categoryName: null,
    costCenterName: "Estética Automotiva",
    amount: 100,
    origin: "regra_automatica",
    ...overrides,
  };
}

function groupTotal(amount: number, items: DreLineItem[] = []) {
  return { label: "grupo", amount, items };
}

function emptyReport(overrides: Partial<DreReport> = {}): DreReport {
  return {
    regime: "gerencial",
    competenceFrom: "2026-07-01",
    competenceTo: "2026-07-31",
    costCenterGroup: "estetica_automotiva",
    receitaBrutaEstetica: groupTotal(0),
    receitaBrutaEstacionamento: groupTotal(0),
    receitaBrutaParceriasCorporativas: groupTotal(0),
    receitaBrutaOutras: groupTotal(0),
    receitaBruta: null,
    receitaBrutaIndisponivelMotivo: "sem receita",
    deducoes: groupTotal(0),
    receitaLiquida: null,
    custosDiretos: groupTotal(0),
    margemContribuicao: null,
    margemContribuicaoIndisponivelMotivo: "sem receita",
    despesasOperacionais: groupTotal(0),
    resultadoOperacional: null,
    resultadoOperacionalIndisponivelMotivo: "sem receita",
    resultadoFinanceiro: groupTotal(0),
    resultadoAntesTributos: null,
    tributos: groupTotal(0),
    resultadoLiquido: null,
    naoClassificados: [],
    margemContribuicaoPercentual: null,
    margemOperacionalPercentual: null,
    margemLiquidaPercentual: null,
    participacaoEsteticaReceita: null,
    participacaoEstacionamentoReceita: null,
    participacaoParceriasReceita: null,
    ebitda: null,
    ebitdaIndisponivelMotivo: "sem receita",
    maoDeObraTotal: null,
    maoDeObraOperacional: null,
    maoDeObraIndisponivelMotivo: "sem receita",
    maoDeObraPercentualReceitaLiquida: null,
    maoDeObraPercentualReceitaBruta: null,
    ...overrides,
  };
}

describe("buildOperationOverview — Missão Financeiro 5D", () => {
  it("Lavação: conta 1 item = 1 lavação real, tanto para itens históricos quanto JumpPark, sem distinção de fonte", () => {
    const items = [
      item({ sourceKind: "historical_spreadsheet_revenue", sourceId: "h1", amount: 80 }),
      item({ sourceKind: "jumppark_service_order", sourceId: "j1", amount: 120 }),
    ];
    const groupReport = emptyReport({ receitaBrutaEstetica: groupTotal(200, items), receitaBruta: 200, receitaBrutaIndisponivelMotivo: null });
    const consolidadoReport = emptyReport({ participacaoEsteticaReceita: 60 });
    const caixaReport = emptyReport({ receitaBruta: 150 });
    const previousGroupReport = emptyReport({ receitaBruta: 100 });

    const overview = buildOperationOverview("estetica_automotiva", { groupReport, consolidadoReport, caixaReport, previousGroupReport });

    expect(overview.quantidade).toEqual({ value: 2, unidade: "lavagens", indisponivelMotivo: null });
    expect(overview.ticketMedio).toBe(100);
    expect(overview.participacaoFaturamento).toBe(60);
    expect(overview.entradasCaixaRastreaveis).toBe(150);
    expect(overview.crescimentoReceitaPercent).toBe(100);
  });

  it("Estacionamento: período 100% histórico (antes de 01/05) nunca finge contar tickets — quantidade fica null com motivo explícito", () => {
    const items = [item({ sourceKind: "historical_spreadsheet_revenue", sourceId: "h1", amount: 300, costCenterName: "Estacionamento" })];
    const groupReport = emptyReport({ receitaBrutaEstacionamento: groupTotal(300, items), receitaBruta: 300, receitaBrutaIndisponivelMotivo: null });
    const consolidadoReport = emptyReport();
    const caixaReport = emptyReport();
    const previousGroupReport = emptyReport();

    const overview = buildOperationOverview("estacionamento", { groupReport, consolidadoReport, caixaReport, previousGroupReport });

    expect(overview.quantidade.value).toBeNull();
    expect(overview.quantidade.unidade).toBe("tickets/estadias");
    expect(overview.quantidade.indisponivelMotivo).toContain("totais diários");
    expect(overview.ticketMedio).toBeNull();
  });

  it("Estacionamento: período misto (parte histórica + parte JumpPark) conta só a parte JumpPark, sinalizando parcialidade", () => {
    const items = [
      item({ sourceKind: "historical_spreadsheet_revenue", sourceId: "h1", amount: 300, costCenterName: "Estacionamento" }),
      item({ sourceKind: "jumppark_service_order", sourceId: "j1", amount: 50, costCenterName: "Estacionamento" }),
      item({ sourceKind: "jumppark_service_order", sourceId: "j2", amount: 70, costCenterName: "Estacionamento" }),
    ];
    const groupReport = emptyReport({ receitaBrutaEstacionamento: groupTotal(420, items), receitaBruta: 420, receitaBrutaIndisponivelMotivo: null });
    const consolidadoReport = emptyReport();
    const caixaReport = emptyReport();
    const previousGroupReport = emptyReport();

    const overview = buildOperationOverview("estacionamento", { groupReport, consolidadoReport, caixaReport, previousGroupReport });

    expect(overview.quantidade.value).toBe(2);
    expect(overview.quantidade.indisponivelMotivo).toContain("Parcial");
    // ticket médio usa só a soma dos itens JumpPark (50+70=120) / 2, nunca o total misto (420) / 2
    expect(overview.ticketMedio).toBe(60);
  });

  it("Estacionamento: 100% JumpPark conta normalmente, sem ressalva de parcialidade", () => {
    const items = [
      item({ sourceKind: "jumppark_service_order", sourceId: "j1", amount: 50, costCenterName: "Estacionamento" }),
      item({ sourceKind: "jumppark_service_order", sourceId: "j2", amount: 70, costCenterName: "Estacionamento" }),
    ];
    const groupReport = emptyReport({ receitaBrutaEstacionamento: groupTotal(120, items), receitaBruta: 120, receitaBrutaIndisponivelMotivo: null });
    const overview = buildOperationOverview("estacionamento", {
      groupReport,
      consolidadoReport: emptyReport(),
      caixaReport: emptyReport(),
      previousGroupReport: emptyReport(),
    });

    expect(overview.quantidade).toEqual({ value: 2, unidade: "tickets/estadias", indisponivelMotivo: null });
    expect(overview.ticketMedio).toBe(60);
  });

  it("sem nenhuma receita no período, quantidade e ticket médio nunca viram zero — ficam null com motivo", () => {
    const groupReport = emptyReport();
    const overview = buildOperationOverview("estetica_automotiva", {
      groupReport,
      consolidadoReport: emptyReport(),
      caixaReport: emptyReport(),
      previousGroupReport: emptyReport(),
    });

    expect(overview.quantidade.value).toBeNull();
    expect(overview.quantidade.indisponivelMotivo).toBe("Nenhuma receita registrada no período.");
    expect(overview.ticketMedio).toBeNull();
  });

  it("crescimento vs período anterior fica null quando qualquer um dos dois lados é indisponível — nunca finge base zero", () => {
    const groupReport = emptyReport({ receitaBruta: 500, receitaBrutaIndisponivelMotivo: null });
    const overview = buildOperationOverview("estetica_automotiva", {
      groupReport,
      consolidadoReport: emptyReport(),
      caixaReport: emptyReport(),
      previousGroupReport: emptyReport(), // receitaBruta: null (sem dado no período anterior)
    });

    expect(overview.crescimentoReceitaPercent).toBeNull();
  });

  it("participação vem sempre do relatório CONSOLIDADO, nunca do relatório isolado da própria operação (que sempre daria 100%)", () => {
    const groupReport = emptyReport({ receitaBruta: 500, receitaBrutaIndisponivelMotivo: null, participacaoEsteticaReceita: 100 });
    const consolidadoReport = emptyReport({ participacaoEsteticaReceita: 42 });
    const overview = buildOperationOverview("estetica_automotiva", { groupReport, consolidadoReport, caixaReport: emptyReport(), previousGroupReport: emptyReport() });

    expect(overview.participacaoFaturamento).toBe(42);
  });
});
