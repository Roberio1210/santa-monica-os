import { describe, expect, it } from "vitest";
import { buildFinancialSchedule } from "@/lib/integrations/stone/financialSchedule";
import type { NormalizedConciliation, NormalizedExpectedPayment, NormalizedSettlement } from "@/lib/integrations/stone/normalize";

function conciliation(overrides: Partial<NormalizedConciliation> = {}): NormalizedConciliation {
  return {
    referenceDate: "2026-07-24",
    generationDateTime: "2026-07-25T05:30:00",
    establishmentCode: "900000001",
    layout: "XML2_4",
    sales: [],
    chargebacks: [],
    chargebackRefunds: [],
    expectedPayments: [],
    realizedPayments: [],
    advances: [],
    settlements: [],
    financialPositions: [],
    terminalSerialNumbers: [],
    ...overrides,
  };
}

function expectedPayment(overrides: Partial<NormalizedExpectedPayment> = {}): NormalizedExpectedPayment {
  return { saleExternalReference: "NSU-1", installmentNumber: 1, grossAmount: 100, amount: 97, expectedPaymentDate: "2026-07-25", ...overrides };
}

function settlement(overrides: Partial<NormalizedSettlement> = {}): NormalizedSettlement {
  return { saleExternalReference: "NSU-1", installmentNumber: 1, netAmount: 97, settledPaymentDate: "2026-07-25", isAdvance: false, ...overrides };
}

describe("buildFinancialSchedule — Sprint 7.0, Z3, Agenda Financeira própria (decisão do usuário)", () => {
  it("teste 9 — parcela de venda parcelada aparece com seu próprio installmentNumber", () => {
    const day = conciliation({
      expectedPayments: [
        expectedPayment({ installmentNumber: 1, expectedPaymentDate: "2026-07-25" }),
        expectedPayment({ installmentNumber: 2, expectedPaymentDate: "2026-08-25" }),
        expectedPayment({ installmentNumber: 3, expectedPaymentDate: "2026-09-25" }),
      ],
    });
    const schedule = buildFinancialSchedule([day], "2026-07-24", "2026-07-24");
    expect(schedule.daily).toHaveLength(3);
  });

  it("teste 10 — múltiplos recebíveis na mesma data são agregados num único bucket, com contagem de vendas distintas separada de parcelas", () => {
    const day = conciliation({
      expectedPayments: [
        expectedPayment({ saleExternalReference: "NSU-1", installmentNumber: 1, grossAmount: 100, amount: 97, expectedPaymentDate: "2026-07-25" }),
        expectedPayment({ saleExternalReference: "NSU-2", installmentNumber: 1, grossAmount: 50, amount: 48.5, expectedPaymentDate: "2026-07-25" }),
      ],
    });
    const schedule = buildFinancialSchedule([day], "2026-07-24", "2026-07-24");
    expect(schedule.daily).toHaveLength(1);
    const bucket = schedule.daily[0];
    expect(bucket.paymentCount).toBe(2);
    expect(bucket.installmentCount).toBe(2);
    expect(bucket.grossAmountExpected).toBe(150);
    expect(bucket.netAmountExpected).toBeCloseTo(145.5);
    expect(bucket.feesExpected).toBeCloseTo(4.5);
  });

  it("liga a parcela prevista à sua liquidação real, calculando valor pendente/liquidado/atrasado corretamente", () => {
    const day = conciliation({
      expectedPayments: [
        expectedPayment({ saleExternalReference: "SETTLED", installmentNumber: 1, amount: 100, expectedPaymentDate: "2026-07-10" }),
        expectedPayment({ saleExternalReference: "PENDING", installmentNumber: 1, amount: 200, expectedPaymentDate: "2026-07-30" }),
        expectedPayment({ saleExternalReference: "LATE", installmentNumber: 1, amount: 50, expectedPaymentDate: "2026-07-01" }),
      ],
      settlements: [settlement({ saleExternalReference: "SETTLED", installmentNumber: 1, netAmount: 100, settledPaymentDate: "2026-07-10" })],
    });
    const schedule = buildFinancialSchedule([day], "2026-07-24", "2026-07-24");
    const settledBucket = schedule.daily.find((b) => b.date === "2026-07-10")!;
    expect(settledBucket.settledAmount).toBe(100);
    expect(settledBucket.pendingAmount).toBe(0);
    expect(settledBucket.overdueAmount).toBe(0);

    const pendingBucket = schedule.daily.find((b) => b.date === "2026-07-30")!;
    expect(pendingBucket.pendingAmount).toBe(200);
    expect(pendingBucket.settledAmount).toBe(0);

    const overdueBucket = schedule.daily.find((b) => b.date === "2026-07-01")!;
    expect(overdueBucket.overdueAmount).toBe(50);
    expect(overdueBucket.pendingAmount).toBe(0);
  });

  it("teste 11 — curva de 7 dias soma só os recebíveis dentro da janela [hoje, hoje+7]", () => {
    const day = conciliation({
      expectedPayments: [
        expectedPayment({ saleExternalReference: "A", amount: 10, expectedPaymentDate: "2026-07-24" }),
        expectedPayment({ saleExternalReference: "B", amount: 20, expectedPaymentDate: "2026-07-30" }),
        expectedPayment({ saleExternalReference: "C", amount: 30, expectedPaymentDate: "2026-08-15" }), // fora da janela de 7 dias
      ],
    });
    const schedule = buildFinancialSchedule([day], "2026-07-24", "2026-07-24");
    const curve7 = schedule.curves.find((c) => c.label === "proximos_7_dias")!;
    expect(curve7.netAmountExpected).toBe(30); // 10 + 20, nunca inclui o de 30 (fora da janela)
    expect(curve7.receivableCount).toBe(2);
  });

  it("teste 12 — curva de 30 dias inclui recebíveis até hoje+30, exclui o que está além", () => {
    const day = conciliation({
      expectedPayments: [
        expectedPayment({ saleExternalReference: "A", amount: 10, expectedPaymentDate: "2026-08-10" }), // dentro de 30 dias
        expectedPayment({ saleExternalReference: "B", amount: 999, expectedPaymentDate: "2026-12-01" }), // muito além
      ],
    });
    const schedule = buildFinancialSchedule([day], "2026-07-24", "2026-07-24");
    const curve30 = schedule.curves.find((c) => c.label === "proximos_30_dias")!;
    expect(curve30.netAmountExpected).toBe(10);
  });

  it("teste 13 — ausência de dados (nenhum arquivo processado) devolve agenda vazia e honesta, nunca inventada", () => {
    const schedule = buildFinancialSchedule([], "2026-07-24", "2026-07-24");
    expect(schedule.daily).toEqual([]);
    expect(schedule.curves.every((c) => c.netAmountExpected === 0 && c.receivableCount === 0)).toBe(true);
    expect(schedule.limitations.some((l) => l.includes("Nenhum recebível"))).toBe(true);
  });

  it("teste 14 — arquivo defasado: dataAvailableThroughDate anterior a hoje nunca classifica uma parcela de ontem como atrasada indevidamente", () => {
    const day = conciliation({ expectedPayments: [expectedPayment({ expectedPaymentDate: "2026-07-23" })] });
    // dataAvailableThroughDate ainda é 2026-07-22 (arquivo de ontem ainda não processado) — 07-23 não é < 07-22, então não é overdue.
    const schedule = buildFinancialSchedule([day], "2026-07-24", "2026-07-22");
    const bucket = schedule.daily[0];
    expect(bucket.overdueAmount).toBe(0);
  });

  it("teste 15 — valores monetários seguros: soma de muitas parcelas fracionadas nunca gera erro de ponto flutuante", () => {
    const many = Array.from({ length: 50 }, (_, i) => expectedPayment({ saleExternalReference: `S${i}`, amount: 0.1, expectedPaymentDate: "2026-07-25" }));
    const day = conciliation({ expectedPayments: many });
    const schedule = buildFinancialSchedule([day], "2026-07-24", "2026-07-24");
    expect(schedule.daily[0].netAmountExpected).toBe(5); // 50 * 0.10 = 5.00 exato, nunca 4.999999999999999
  });

  it("cancelamento total (installmentNumber null) zera o valor pendente/liquidado dessa parcela — nunca conta como recebível ativo", () => {
    const day = conciliation({
      sales: [{ acquirerTransactionKey: "CANC", authorizationCode: "A", authorizedAt: "", capturedAt: "", cardFlow: "debito", installmentsCount: 1, grossAmount: 100, netAmount: 0, feeAmount: 0, brandId: 1, terminalSerialNumber: null, cancellations: [{ operationKey: "OP1", installmentNumber: null, amount: 100, occurredAt: "2026-07-24" }], raw: {} as never }],
      expectedPayments: [expectedPayment({ saleExternalReference: "CANC", amount: 97, expectedPaymentDate: "2026-07-25" })],
    });
    const schedule = buildFinancialSchedule([day], "2026-07-24", "2026-07-24");
    const bucket = schedule.daily[0];
    expect(bucket.pendingAmount).toBe(0);
    expect(bucket.overdueAmount).toBe(0);
    expect(bucket.settledAmount).toBe(0);
  });
});
