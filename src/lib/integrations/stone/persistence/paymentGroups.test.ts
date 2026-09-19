import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildPaymentGroupsForDay } from "@/lib/integrations/stone/persistence/paymentGroups";
import type { NormalizedConciliation, NormalizedRealizedPayment, NormalizedSettlement } from "@/lib/integrations/stone/normalize";

/**
 * Missão 81 (FASE 2) — prova de que `buildPaymentGroupsForDay` agrupa EXCLUSIVAMENTE por
 * `paymentId` (identidade real, Missão 77), nunca por data+valor, e nunca inventa `totalAmount`
 * (sempre o valor oficial de `Payments[].TotalAmount`, via `day.realizedPayments`).
 */

function settlement(overrides: Partial<NormalizedSettlement> = {}): NormalizedSettlement {
  return { saleExternalReference: "ACQ-1", installmentNumber: 1, netAmount: 9.888, settledPaymentDate: "2026-09-13", isAdvance: false, paymentId: "PAY-1", ...overrides };
}

function realizedPayment(overrides: Partial<NormalizedRealizedPayment> = {}): NormalizedRealizedPayment {
  return { paymentId: "PAY-1", amount: 100, walletTypeId: 3, bankAccount: null, ...overrides };
}

function day(overrides: Partial<NormalizedConciliation> = {}): NormalizedConciliation {
  return {
    referenceDate: "2026-09-13",
    generationDateTime: "2026-09-13T05:00:00",
    establishmentCode: "900000001",
    layout: "XML2_4",
    sales: [],
    chargebacks: [],
    chargebackRefunds: [],
    expectedPayments: [],
    realizedPayments: [],
    advances: [],
    settlements: [],
    financialEvents: [],
    financialPositions: [],
    terminalSerialNumbers: [],
    ...overrides,
  };
}

describe("buildPaymentGroupsForDay — Missão 81", () => {
  it("1 paymentId com várias parcelas -> 1 grupo, totalAmount OFICIAL (não a soma das parcelas)", () => {
    const d = day({
      settlements: [settlement({ netAmount: 9.888 }), settlement({ netAmount: 24.28 }), settlement({ netAmount: 38.848 })],
      realizedPayments: [realizedPayment({ amount: 543.87 })], // valor oficial, bem diferente da soma das 3 parcelas
    });
    const { groups, conflicts } = buildPaymentGroupsForDay(d, "run-1");
    expect(conflicts).toEqual([]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ paymentId: "PAY-1", paymentDate: "2026-09-13", totalAmount: 543.87, walletTypeId: 3, importRunId: "run-1" });
  });

  it("dois paymentIds distintos -> dois grupos", () => {
    const d = day({
      settlements: [settlement({ paymentId: "PAY-A" }), settlement({ paymentId: "PAY-B" })],
      realizedPayments: [realizedPayment({ paymentId: "PAY-A", amount: 50 }), realizedPayment({ paymentId: "PAY-B", amount: 70 })],
    });
    const { groups, conflicts } = buildPaymentGroupsForDay(d, null);
    expect(conflicts).toEqual([]);
    expect(groups.map((g) => g.paymentId).sort()).toEqual(["PAY-A", "PAY-B"]);
  });

  it("valores/data iguais mas paymentIds diferentes -> grupos DIFERENTES (Missão 77, caso 09/09 real: dois grupos de 135,968 cada)", () => {
    const d = day({
      settlements: [
        settlement({ saleExternalReference: "ACQ-A", paymentId: "PAY-A", netAmount: 135.968, settledPaymentDate: "2026-09-09" }),
        settlement({ saleExternalReference: "ACQ-B", paymentId: "PAY-B", netAmount: 135.968, settledPaymentDate: "2026-09-09" }),
      ],
      realizedPayments: [realizedPayment({ paymentId: "PAY-A", amount: 135.968 }), realizedPayment({ paymentId: "PAY-B", amount: 135.968 })],
    });
    const { groups } = buildPaymentGroupsForDay(d, null);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.paymentId)).size).toBe(2); // nunca colapsados num só por terem o mesmo valor/data
  });

  it("settlement sem paymentId nunca forma grupo", () => {
    const d = day({ settlements: [settlement({ paymentId: null })], realizedPayments: [realizedPayment()] });
    const { groups, conflicts } = buildPaymentGroupsForDay(d, null);
    expect(groups).toEqual([]);
    expect(conflicts).toEqual([]);
  });

  it("mesmo paymentId repetido (idêntico) em realizedPayments -> ainda 1 grupo, nunca duplicado", () => {
    const d = day({
      settlements: [settlement()],
      realizedPayments: [realizedPayment({ amount: 100 }), realizedPayment({ amount: 100 })],
    });
    const { groups, conflicts } = buildPaymentGroupsForDay(d, null);
    expect(conflicts).toEqual([]);
    expect(groups).toHaveLength(1);
  });

  it("mesmo paymentId repetido com metadata DIVERGENTE em realizedPayments -> conflito, nenhum grupo formado (nunca escolhe primeiro/último)", () => {
    const d = day({
      settlements: [settlement()],
      realizedPayments: [realizedPayment({ amount: 100 }), realizedPayment({ amount: 999 })],
    });
    const { groups, conflicts } = buildPaymentGroupsForDay(d, null);
    expect(groups).toEqual([]);
    expect(conflicts).toEqual([{ type: "duplicate_realized_payment_mismatch", paymentId: "PAY-1" }]);
  });

  it("paymentDate divergente entre parcelas do mesmo paymentId -> conflito, nunca resolvido por maioria", () => {
    const d = day({
      settlements: [settlement({ settledPaymentDate: "2026-09-13" }), settlement({ settledPaymentDate: "2026-09-14" })],
      realizedPayments: [realizedPayment()],
    });
    const { groups, conflicts } = buildPaymentGroupsForDay(d, null);
    expect(groups).toEqual([]);
    expect(conflicts).toEqual([{ type: "payment_date_mismatch", paymentId: "PAY-1", dates: ["2026-09-13", "2026-09-14"] }]);
  });

  it("paymentId sem realizedPayment correspondente -> conflito, nunca grupo sem valor oficial", () => {
    const d = day({ settlements: [settlement({ paymentId: "PAY-ORFAO" })], realizedPayments: [] });
    const { groups, conflicts } = buildPaymentGroupsForDay(d, null);
    expect(groups).toEqual([]);
    expect(conflicts).toEqual([{ type: "missing_realized_payment", paymentId: "PAY-ORFAO" }]);
  });

  it("dia sem nenhum settlement -> zero grupos, zero conflitos", () => {
    const { groups, conflicts } = buildPaymentGroupsForDay(day(), null);
    expect(groups).toEqual([]);
    expect(conflicts).toEqual([]);
  });

  it("prova estática — nunca importa persistência de cash_movements, bank_statement_lines ou conciliação", () => {
    const sourcePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "paymentGroups.ts");
    const source = readFileSync(sourcePath, "utf8");
    expect(source).not.toContain("createCashMovement");
    expect(source).not.toContain("getFinanceRepository");
    expect(source).not.toContain("getBankStatementRepository");
    expect(source).not.toContain("bank_statement");
    expect(source).not.toContain("attemptStoneSettlementReconciliation");
  });
});
