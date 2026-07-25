import { describe, expect, it } from "vitest";
import { extractFacts } from "@/lib/zezinho/reasoning/facts";
import type { ToolResult } from "@/lib/zezinho/tools/types";
import type { StoneReconciliationSummary } from "@/lib/integrations/stone/reconciliationSummary";

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
