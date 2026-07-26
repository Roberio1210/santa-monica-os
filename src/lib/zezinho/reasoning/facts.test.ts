import { describe, expect, it } from "vitest";
import { extractFacts } from "@/lib/zezinho/reasoning/facts";
import type { ToolResult } from "@/lib/zezinho/tools/types";
import type { StoneReconciliationSummary } from "@/lib/integrations/stone/reconciliationSummary";
import type { FinancialScheduleResult } from "@/lib/integrations/stone/financialScheduleService";
import type { JumpparkReconciliationResult } from "@/lib/integrations/stone/jumpparkReconciliationService";
import type { FinancialSchedule } from "@/lib/integrations/stone/financialSchedule";
import type { Diagnostic, FinancialDirectorReport, FinancialMetricSet } from "@/lib/finance/intelligence/types";

function meta(status: ToolResult["status"], limitations: string[] = []) {
  return { status, collectedAt: "2026-07-24T12:00:00.000Z", limitations };
}

function stoneSummary(overrides: Partial<StoneReconciliationSummary> = {}): StoneReconciliationSummary {
  return {
    status: "ok",
    error: null,
    limitations: [],
    referenceDate: "2026-07-23",
    generationDateTime: "2026-07-24T05:30:00",
    processedAt: "2026-07-24T12:00:00.000Z",
    establishmentCode: "900000001",
    terminalSerialNumbers: ["TERM-ANON-01"],
    transactionCount: 12,
    grossAmountTotal: 5000,
    netAmountTotal: 4750,
    feesTotal: 250,
    debitTransactionCount: 5,
    creditTransactionCount: 7,
    installmentSaleCount: 2,
    installmentCount: 15,
    expectedPaymentsCount: 15,
    expectedPaymentsAmountTotal: 4750,
    realizedPaymentsCount: 1,
    realizedPaymentsAmountTotal: 4750,
    cancellationCount: 3,
    refundCount: 0,
    chargebackCount: 0,
    advanceCount: 1,
    pixIncluded: false,
    pixNote: "PIX não está incluído no arquivo diário de conciliação — é um arquivo/fluxo assíncrono separado.",
    financialPosition: { status: "ok", amount: 12345.67, referenceDate: "2026-07-23", processedAt: "2026-07-24T12:00:00.000Z", origin: "Stone — arquivo de conciliação diário", limitation: "Esta é a última posição financeira processada pela Stone, não um saldo em tempo real." },
    transactionExternalKeys: [],
    ...overrides,
  };
}

function emptySchedule(overrides: Partial<FinancialSchedule> = {}): FinancialSchedule {
  return {
    dataAvailableThroughDate: "2026-07-24",
    daily: [],
    curves: [
      { label: "hoje", windowStart: "2026-07-24", windowEnd: "2026-07-24", grossAmountExpected: 0, netAmountExpected: 0, settledAmount: 0, pendingAmount: 0, overdueAmount: 0, feesExpected: 0, receivableCount: 0, pendingCount: 0, settledCount: 0 },
      { label: "proximos_7_dias", windowStart: "2026-07-24", windowEnd: "2026-07-31", grossAmountExpected: 0, netAmountExpected: 700, settledAmount: 0, pendingAmount: 700, overdueAmount: 0, feesExpected: 0, receivableCount: 3, pendingCount: 3, settledCount: 0 },
      { label: "proximos_30_dias", windowStart: "2026-07-24", windowEnd: "2026-08-23", grossAmountExpected: 0, netAmountExpected: 3000, settledAmount: 0, pendingAmount: 3000, overdueAmount: 0, feesExpected: 0, receivableCount: 10, pendingCount: 10, settledCount: 0 },
      { label: "mes_atual", windowStart: "2026-07-01", windowEnd: "2026-07-31", grossAmountExpected: 0, netAmountExpected: 0, settledAmount: 0, pendingAmount: 0, overdueAmount: 0, feesExpected: 0, receivableCount: 0, pendingCount: 0, settledCount: 0 },
    ],
    limitations: [],
    ...overrides,
  };
}

function scheduleResult(overrides: Partial<FinancialScheduleResult> = {}): FinancialScheduleResult {
  return { status: "ok", error: null, limitations: [], schedule: emptySchedule(), ...overrides };
}

function reconciliationServiceResult(overrides: Partial<JumpparkReconciliationResult> = {}): JumpparkReconciliationResult {
  return { status: "ok", error: null, limitations: [], results: [], divergences: [], ...overrides };
}

describe("extractFacts — stone_financial_schedule (Sprint 7.0, Z3, decisão do usuário)", () => {
  it("status ok produz as frases exatas pedidas pelo usuário", () => {
    const result: ToolResult = {
      id: "stone_financial_schedule",
      source: "Stone",
      error: null,
      ...meta("ok"),
      result: scheduleResult({
        schedule: emptySchedule({
          daily: [
            { date: "2026-07-20", grossAmountExpected: 0, feesExpected: 0, netAmountExpected: 0, settledAmount: 500, pendingAmount: 0, overdueAmount: 0, paymentCount: 1, installmentCount: 1, earlySettledCount: 0, overdueCount: 0, pendingCount: 0, settledCount: 1, differenceExpectedVsSettled: 0 },
            { date: "2026-07-25", grossAmountExpected: 700, feesExpected: 0, netAmountExpected: 700, settledAmount: 0, pendingAmount: 700, overdueAmount: 0, paymentCount: 3, installmentCount: 3, earlySettledCount: 0, overdueCount: 0, pendingCount: 13, settledCount: 0, differenceExpectedVsSettled: 0 },
          ],
        }),
      }),
    };
    const facts = extractFacts([result]);

    expect(facts.find((f) => f.key === "stone_schedule_net_expected_7d")?.statement).toBe("Há R$ 700.00 líquidos previstos para os próximos sete dias.");
    expect(facts.find((f) => f.key === "stone_schedule_net_expected_30d")?.statement).toBe("Há R$ 3000.00 líquidos previstos para os próximos trinta dias.");
    expect(facts.find((f) => f.key === "stone_schedule_settled_period")?.statement).toBe("R$ 500.00 já foram liquidados no período.");
    expect(facts.find((f) => f.key === "stone_schedule_pending_count")?.statement).toBe("Existem 13 recebível(is) pendente(s).");
  });

  it("status not_configured/no_data nunca produz Fact — nunca um zero inventado", () => {
    const result: ToolResult = { id: "stone_financial_schedule", source: "Stone", error: "x", ...meta("not_configured"), result: scheduleResult({ status: "not_configured", schedule: null }) };
    expect(extractFacts([result])).toEqual([]);
  });
});

describe("extractFacts — stone_jumppark_reconciliation (Sprint 7.0, Z3, decisão do usuário)", () => {
  it("status ok produz as frases exatas pedidas pelo usuário", () => {
    const result: ToolResult = {
      id: "stone_jumppark_reconciliation",
      source: "Stone × JumpPark",
      error: null,
      ...meta("ok"),
      result: reconciliationServiceResult({
        results: [
          { type: "exact_match", confidence: "high", heuristicScore: 100, favorableSignals: [], contrarySignals: [], limitations: [], ruleApplied: "", comparedFields: [], jumpparkOrder: null, stoneSale: null },
          { type: "probable_match", confidence: "medium", heuristicScore: 60, favorableSignals: [], contrarySignals: [], limitations: [], ruleApplied: "", comparedFields: [], jumpparkOrder: null, stoneSale: null },
          { type: "pending_processing", confidence: "low", heuristicScore: 0, favorableSignals: [], contrarySignals: [], limitations: [], ruleApplied: "", comparedFields: [], jumpparkOrder: null, stoneSale: null },
        ],
        divergences: [{ type: "diferenca_de_valor", priority: "alta", evidence: [], financialImpact: 10, involvedRecords: { jumpparkOrderRef: null, stoneSaleRef: null }, confidence: "medium", reviewRecommendation: "conferir", status: "identificado" }],
      }),
    };
    const facts = extractFacts([result]);

    expect(facts.find((f) => f.key === "stone_jumppark_exact_matches")?.statement).toBe("Foram encontradas 1 correspondência(s) exata(s) entre Stone e JumpPark.");
    expect(facts.find((f) => f.key === "stone_jumppark_divergence_count")?.statement).toBe("Existem 1 divergência(s) que precisam de conferência.");
    expect(facts.find((f) => f.key === "stone_jumppark_pending_processing")?.statement).toBe("1 venda(s) permanece(m) como processamento pendente e ainda não deve(m) ser tratada(s) como erro.");
    expect(facts.find((f) => f.key === "stone_jumppark_probable_matches")?.statement.toLowerCase()).toContain("nunca tratadas como certeza");
  });

  it("teste 34 — status not_configured (JumpPark indisponível) nunca produz Fact, nunca inventa divergência", () => {
    const result: ToolResult = { id: "stone_jumppark_reconciliation", source: "Stone × JumpPark", error: "JumpPark não configurado.", ...meta("not_configured"), result: reconciliationServiceResult({ status: "not_configured", error: "JumpPark não configurado." }) };
    expect(extractFacts([result])).toEqual([]);
  });

  it("teste 33 — status temporary_failure (falha da Stone) nunca produz Fact, nunca lança", () => {
    const result: ToolResult = { id: "stone_jumppark_reconciliation", source: "Stone × JumpPark", error: "falha", ...meta("temporary_failure"), result: reconciliationServiceResult({ status: "temporary_failure", error: "falha" }) };
    expect(() => extractFacts([result])).not.toThrow();
    expect(extractFacts([result])).toEqual([]);
  });
});

describe("extractFacts — ferramentas da Z2 (clima, meta, padrão histórico) agora viram Fact (Sprint 4.0, Z3)", () => {
  it("weather_forecast ok com condição atual vira um Fact — nunca quando not_configured", () => {
    const ok: ToolResult = {
      id: "weather_forecast",
      source: "OpenWeatherMap",
      error: null,
      ...meta("ok"),
      forecast: { status: "ok", configured: true, error: null, source: "OpenWeatherMap", location: "Floripa", updatedAt: "2026-07-24T12:00:00.000Z", current: { temperature: 24, feelsLike: 25, condition: "céu limpo", precipitationProbability: null, windSpeedKmh: 10 }, nextHours: [], dailyForecast: [], limitations: [] },
    };
    expect(extractFacts([ok]).some((f) => f.key === "weather_current")).toBe(true);

    const notConfigured: ToolResult = { id: "weather_forecast", source: "OpenWeatherMap", error: "não configurado", ...meta("not_configured"), forecast: { status: "not_configured", configured: false, error: "não configurado", source: null, location: null, updatedAt: null, current: null, nextHours: [], dailyForecast: [], limitations: [] } };
    expect(extractFacts([notConfigured]).some((f) => f.key === "weather_current")).toBe(false);
  });

  it("goal_progress ok vira Fact com direção conforme o ritmo — nunca quando progress é null", () => {
    const behind: ToolResult = {
      id: "goal_progress",
      source: "Metas (Neon)",
      error: null,
      ...meta("ok"),
      progress: { goal: { id: "g1", area: "lavacao", label: "Lavação Julho", targetAmount: 30000, periodStart: "2026-07-01", periodEnd: "2026-07-31", bonusTiers: [] }, currentAmount: 5000, percentComplete: 16, remainingAmount: 25000, daysElapsed: 24, daysTotal: 31, projectedAmount: 15000, projectedPercent: 50, pace: "abaixo_do_ritmo", nextBonusTier: null, amountToNextBonus: null },
    };
    const facts = extractFacts([behind]);
    const fact = facts.find((f) => f.key === "goal_progress");
    expect(fact).toBeDefined();
    expect(fact?.direction).toBe("queda");

    const noGoal: ToolResult = { id: "goal_progress", source: "Metas (Neon)", error: "Nenhuma meta configurada.", ...meta("no_data"), progress: null };
    expect(extractFacts([noGoal])).toEqual([]);
  });

  it("historical_pattern ok com amostra vira Fact, rotulado proxy quando a amostra é insuficiente", () => {
    const insufficient: ToolResult = {
      id: "historical_pattern",
      source: "JumpPark — padrão histórico",
      error: null,
      ...meta("ok"),
      pattern: { weekdayIndex: 3, sampleWeeks: 2, sampleQuality: "insuficiente", typicalVehicles: 5, typicalRevenue: 500, typicalTicket: 100, typicalWashCount: 3, typicalParkingCount: 2, typicalAddOnRate: 0.2, topServices: [], cutoffTimeHM: null, limitations: [] },
    };
    const facts = extractFacts([insufficient]);
    const fact = facts.find((f) => f.key === "historical_pattern");
    expect(fact?.isProxy).toBe(true);

    const empty: ToolResult = { id: "historical_pattern", source: "JumpPark — padrão histórico", error: null, ...meta("no_data"), pattern: { weekdayIndex: 3, sampleWeeks: 0, sampleQuality: "insuficiente", typicalVehicles: null, typicalRevenue: null, typicalTicket: null, typicalWashCount: null, typicalParkingCount: null, typicalAddOnRate: null, topServices: [], cutoffTimeHM: null, limitations: [] } };
    expect(extractFacts([empty])).toEqual([]);
  });
});

describe("extractFacts — novas ferramentas da Z3 (situacional, contas a pagar/receber)", () => {
  it("situational_context sempre vira Fact — é síncrono e sempre 'ok'", () => {
    const result: ToolResult = {
      id: "situational_context",
      source: "Contexto situacional",
      error: null,
      ...meta("ok"),
      context: {
        nowIso: "2026-07-24",
        timeHM: "10:00",
        weekdayIndex: 5,
        weekdayLabel: "sexta-feira",
        areas: {
          lavacao: { area: "lavacao", isOpen: true, stage: "meio_expediente", minutesSinceOpen: 120, minutesUntilClose: 300, sampleConfidence: "parcial" },
          estacionamento: { area: "estacionamento", isOpen: true, stage: "meio_expediente", minutesSinceOpen: 120, minutesUntilClose: 600, sampleConfidence: "parcial" },
        },
      },
    };
    expect(extractFacts([result]).some((f) => f.key === "situational_context")).toBe(true);
  });

  it("accounts_payable ok com contas vencidas vira Fact com direção 'queda'", () => {
    const result: ToolResult = { id: "accounts_payable", source: "Neon — Contas a Pagar", error: null, ...meta("ok"), summary: { totalPending: 1000, totalOverdue: 500, totalPaidThisMonth: 200, upcoming7Count: 2, upcoming30Count: 5, count: 10 } };
    const fact = extractFacts([result]).find((f) => f.key === "accounts_payable");
    expect(fact?.direction).toBe("queda");
  });

  it("accounts_receivable ok sem atraso vira Fact com direção 'estavel'", () => {
    const result: ToolResult = {
      id: "accounts_receivable",
      source: "Neon — Contas a Receber",
      error: null,
      ...meta("ok"),
      dashboard: { receiveToday: 100, receiveTomorrow: 0, receiveThisWeek: 500, receiveThisMonth: 2000, overdueTotal: 0, delinquentClients: [], byCostCenter: [], byPaymentMethod: [], byCategory: [], upcomingDueDates: [] },
    };
    const fact = extractFacts([result]).find((f) => f.key === "accounts_receivable");
    expect(fact?.direction).toBe("estavel");
  });
});

describe("extractFacts — stone_reconciliation_summary (Sprint 7.0, Z2, decisão do usuário — DirectorReport estruturado)", () => {
  it("status ok produz um Fact por item pedido, com as frases exatas do exemplo do usuário", () => {
    const result: ToolResult = { id: "stone_reconciliation_summary", source: "Stone — Conciliação Cliente Stone", error: null, ...meta("ok"), summary: stoneSummary() };
    const facts = extractFacts([result]);

    const grossFact = facts.find((f) => f.key === "stone_gross_amount_total");
    expect(grossFact?.statement).toContain("R$ 5000.00 em vendas brutas");

    const feesFact = facts.find((f) => f.key === "stone_fees_total");
    expect(feesFact?.statement).toContain("R$ 250.00 em taxas");

    const netFact = facts.find((f) => f.key === "stone_net_amount_total");
    expect(netFact?.statement).toContain("R$ 4750.00");

    const cancellationFact = facts.find((f) => f.key === "stone_cancellation_count");
    expect(cancellationFact?.statement).toContain("Existem 3 cancelamento(s)");
    expect(cancellationFact?.direction).toBe("queda");

    const positionFact = facts.find((f) => f.key === "stone_financial_position");
    expect(positionFact?.statement).toContain("R$ 12345.67");
    expect(positionFact?.statement).toContain("2026-07-23");
    expect(positionFact?.statement.toLowerCase()).not.toContain("saldo disponível");
  });

  it("produz um Fact separado para cada item pedido — nunca combina dois números numa frase só", () => {
    const result: ToolResult = { id: "stone_reconciliation_summary", source: "Stone — Conciliação Cliente Stone", error: null, ...meta("ok"), summary: stoneSummary() };
    const keys = extractFacts([result]).map((f) => f.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "stone_file_period",
        "stone_processed_at",
        "stone_transaction_count",
        "stone_gross_amount_total",
        "stone_net_amount_total",
        "stone_fees_total",
        "stone_debit_transaction_count",
        "stone_credit_transaction_count",
        "stone_installment_sale_count",
        "stone_installment_count",
        "stone_expected_payments",
        "stone_realized_payments",
        "stone_cancellation_count",
        "stone_advance_count",
        "stone_pix_included",
        "stone_financial_position",
        "stone_terminal_count",
      ]),
    );
  });

  it("sem chargeback/estorno neste dia, o Fact ainda é criado com um zero real — nunca escondido, nunca tratado como ausência de dado", () => {
    const result: ToolResult = { id: "stone_reconciliation_summary", source: "Stone", error: null, ...meta("ok"), summary: stoneSummary({ chargebackCount: 0, refundCount: 0 }) };
    const facts = extractFacts([result]);
    const chargebackFact = facts.find((f) => f.key === "stone_chargeback_count");
    const refundFact = facts.find((f) => f.key === "stone_refund_count");
    expect(chargebackFact?.statement).toContain("Existem 0 chargeback(s)");
    expect(chargebackFact?.direction).toBe("estavel");
    expect(refundFact?.statement).toContain("Existem 0 estorno(s)");
  });

  it("status not_configured/no_data/temporary_failure nunca produz nenhum Fact — nunca um zero de mentira", () => {
    for (const status of ["not_configured", "no_data", "temporary_failure"] as const) {
      const result: ToolResult = {
        id: "stone_reconciliation_summary",
        source: "Stone",
        error: "algo",
        ...meta(status),
        summary: stoneSummary({ status, transactionCount: 0, grossAmountTotal: 0 }),
      };
      expect(extractFacts([result])).toEqual([]);
    }
  });

  it("posição financeira 'no_data' nunca vira Fact — nunca um saldo inventado", () => {
    const result: ToolResult = {
      id: "stone_reconciliation_summary",
      source: "Stone",
      error: null,
      ...meta("ok"),
      summary: stoneSummary({ financialPosition: { status: "no_data", amount: null, referenceDate: null, processedAt: "2026-07-24T12:00:00.000Z", origin: "Stone", limitation: "Nenhuma posição financeira." } }),
    };
    expect(extractFacts([result]).some((f) => f.key === "stone_financial_position")).toBe(false);
  });
});

function financialMetricSet(overrides: Partial<FinancialMetricSet> = {}): FinancialMetricSet {
  return {
    periodFrom: "2026-06-23",
    periodTo: "2026-07-22",
    transactionCount: 40,
    grossRevenue: 4000,
    netRevenue: 3850,
    totalFees: 150,
    feePercentage: 3.75,
    averageTicket: 100,
    averageTransactionValue: 96.25,
    highestSale: 300,
    lowestSale: 20,
    topSalesConcentration: 22,
    brandDistribution: [],
    paymentMethodDistribution: [],
    installmentDistribution: [],
    dailyRevenue: [],
    weeklyRevenue: [],
    monthlyRevenue: [],
    pendingReceivablesAmount: 500,
    overdueReceivablesAmount: 50,
    settledReceivablesAmount: 3000,
    settledReceivablesPercentage: 84.5,
    averageSettlementDays: 1,
    advancedAmount: 100,
    advancedPercentage: 3.3,
    ...overrides,
  };
}

function financialDirectorReport(overrides: Partial<FinancialDirectorReport> = {}): FinancialDirectorReport {
  return {
    status: "ok",
    error: null,
    limitations: [],
    generatedAt: "2026-07-24T12:00:00.000Z",
    dataAvailableThroughDate: "2026-07-22",
    primaryMetrics: financialMetricSet(),
    comparisons: [],
    diagnostics: [],
    recommendations: [],
    executiveSummary: {
      netRevenueLabel: "R$ 3850.00 nos últimos 30 dias",
      receivablesLabel: "R$ 3000.00 liquidados, R$ 500.00 futuros, R$ 50.00 vencidos",
      mainRisk: "Nenhum risco relevante identificado no período.",
      mainOpportunity: "Nenhuma oportunidade adicional identificada no período.",
      situation: "Saudável.",
      mainRecommendation: "Nenhuma ação adicional necessária no momento.",
    },
    ...overrides,
  };
}

describe("extractFacts — financial_intelligence (Sprint 8, Diretor Financeiro Inteligente)", () => {
  it("status ok com métricas e resumo executivo produz um Fact por item do resumo, nunca recalcula nada", () => {
    const result: ToolResult = { id: "financial_intelligence", source: "Santa Monica OS — Diretor Financeiro Inteligente", error: null, ...meta("ok"), report: financialDirectorReport() };
    const facts = extractFacts([result]);

    expect(facts.find((f) => f.key === "financial_intelligence_situation")?.statement).toBe("Saudável.");
    expect(facts.find((f) => f.key === "financial_intelligence_net_revenue")?.statement).toBe("R$ 3850.00 nos últimos 30 dias");
    expect(facts.find((f) => f.key === "financial_intelligence_average_ticket")?.statement).toContain("R$ 100.00");
    expect(facts.find((f) => f.key === "financial_intelligence_fee_percentage")?.statement).toContain("3.8%");
  });

  it("diagnósticos com severidade warning/critical viram Fact — diagnósticos 'info' nunca entram", () => {
    const diagnostics: Diagnostic[] = [
      { id: "ticket_medio_caiu", severity: "warning", confidence: "medium", title: "Ticket médio caiu", description: "desc", reason: "r", evidence: [], recommendation: "rec" },
      { id: "receita_cresceu", severity: "info", confidence: "medium", title: "Receita cresceu", description: "desc", reason: "r", evidence: [], recommendation: "rec" },
    ];
    const result: ToolResult = { id: "financial_intelligence", source: "Santa Monica OS", error: null, ...meta("ok"), report: financialDirectorReport({ diagnostics }) };
    const facts = extractFacts([result]);
    expect(facts.some((f) => f.key === "financial_intelligence_diagnostic_ticket_medio_caiu")).toBe(true);
    expect(facts.some((f) => f.key === "financial_intelligence_diagnostic_receita_cresceu")).toBe(false);
  });

  it("status not_configured/no_data/temporary_failure nunca produz nenhum Fact — nunca um número inventado", () => {
    for (const status of ["not_configured", "no_data", "temporary_failure"] as const) {
      const result: ToolResult = { id: "financial_intelligence", source: "Santa Monica OS", error: "algo", ...meta(status), report: financialDirectorReport({ status, primaryMetrics: null, executiveSummary: null }) };
      expect(extractFacts([result])).toEqual([]);
    }
  });
});
