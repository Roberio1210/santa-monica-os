import { describe, expect, it } from "vitest";
import { buildNormalizedTransactionRecords, buildSourceFileName, hashNormalizedConciliation } from "@/lib/integrations/stone/persistence/mapping";
import type { NormalizedAdvance, NormalizedConciliation, NormalizedExpectedPayment, NormalizedSaleTransaction, NormalizedSettlement } from "@/lib/integrations/stone/normalize";
import type { StoneTransaction } from "@/lib/integrations/stone/types";

function stoneSale(overrides: Partial<NormalizedSaleTransaction> & { initiatorTransactionKey?: string | null } = {}): NormalizedSaleTransaction {
  const { initiatorTransactionKey = "INIT-1", ...rest } = overrides;
  return {
    acquirerTransactionKey: "NSU-1",
    authorizationCode: "AUTH1",
    authorizedAt: "2026-07-24T10:00:00",
    capturedAt: "2026-07-24T10:05:00",
    cardFlow: "credito",
    installmentsCount: 1,
    grossAmount: 100,
    netAmount: 97,
    feeAmount: 3,
    brandId: 1,
    terminalSerialNumber: "TERM-1",
    cancellations: [],
    raw: {
      initiatorTransactionKey,
      installments: [{ installmentNumber: 1, grossAmount: 100, netAmount: 97, previsionPaymentDate: "2026-07-25", saleFee: null, mdrAmount: null, originalPaymentDate: null, suspendedByChargeback: null, chargeback: null, chargebackRefund: null }],
    } as unknown as StoneTransaction,
    ...rest,
  };
}

function expectedPayment(overrides: Partial<NormalizedExpectedPayment> = {}): NormalizedExpectedPayment {
  return { saleExternalReference: "NSU-1", installmentNumber: 1, grossAmount: 100, amount: 97, expectedPaymentDate: "2026-07-25", ...overrides };
}

function settlement(overrides: Partial<NormalizedSettlement> = {}): NormalizedSettlement {
  return { saleExternalReference: "NSU-1", installmentNumber: 1, netAmount: 97, settledPaymentDate: "2026-07-25", isAdvance: false, ...overrides };
}

function conciliation(overrides: Partial<NormalizedConciliation> = {}): NormalizedConciliation {
  return {
    referenceDate: "2026-07-24",
    generationDateTime: "2026-07-25T05:30:00",
    establishmentCode: "900000001",
    layout: "XML2_4",
    sales: [stoneSale()],
    chargebacks: [],
    chargebackRefunds: [],
    expectedPayments: [expectedPayment()],
    realizedPayments: [],
    advances: [],
    settlements: [],
    financialPositions: [],
    financialEvents: [],
    terminalSerialNumbers: [],
    ...overrides,
  };
}

describe("buildSourceFileName — Sprint 7.0, Z4", () => {
  it("segue o padrão confirmado na documentação oficial", () => {
    expect(buildSourceFileName("900000001", "2026-07-24", "XML2_4")).toBe("900000001-20260724-XML2_4-without_reversals.xml");
  });
});

describe("hashNormalizedConciliation — Sprint 7.0, Z4", () => {
  it("é determinístico — o mesmo conteúdo sempre produz o mesmo hash", () => {
    const day = conciliation();
    expect(hashNormalizedConciliation(day)).toBe(hashNormalizedConciliation(conciliation()));
  });

  it("conteúdo diferente produz hash diferente", () => {
    const a = conciliation();
    const b = conciliation({ expectedPayments: [expectedPayment({ amount: 50 })] });
    expect(hashNormalizedConciliation(a)).not.toBe(hashNormalizedConciliation(b));
  });
});

describe("buildNormalizedTransactionRecords — Sprint 7.0, Z4", () => {
  it("gera um registro por parcela com a chave externa determinística de identity.ts", () => {
    const records = buildNormalizedTransactionRecords(conciliation(), "2026-07-24", "run-1");
    expect(records).toHaveLength(1);
    expect(records[0].externalKey).toMatch(/^[a-f0-9]{64}$/);
    expect(records[0].importRunId).toBe("run-1");
  });

  it("liga a parcela à liquidação real quando existir", () => {
    const day = conciliation({ settlements: [settlement()] });
    const records = buildNormalizedTransactionRecords(day, "2026-07-24", null);
    expect(records[0].settledPaymentDate).toBe("2026-07-25");
    expect(records[0].settledAmount).toBe(97);
    expect(records[0].receivableState).toBe("settled_on_time");
  });

  it("parcela sem liquidação e sem cancelamento/chargeback vira 'sale'", () => {
    const records = buildNormalizedTransactionRecords(conciliation(), "2026-07-24", null);
    expect(records[0].eventType).toBe("sale");
  });

  it("parcela cancelada (venda inteira) vira eventType 'cancellation'", () => {
    const day = conciliation({ sales: [stoneSale({ cancellations: [{ operationKey: "C1", installmentNumber: null, amount: 100, occurredAt: "2026-07-24T11:00:00" }] })] });
    const records = buildNormalizedTransactionRecords(day, "2026-07-24", null);
    expect(records[0].eventType).toBe("cancellation");
    expect(records[0].receivableState).toBe("cancelled");
  });

  it("parcela com chargeback vira eventType 'chargeback', tem prioridade sobre cancelamento", () => {
    const day = conciliation({ chargebacks: [{ id: "CB1", saleExternalReference: "NSU-1", installmentNumber: 1, amount: 100, occurredAt: "2026-07-24T11:00:00" }] });
    const records = buildNormalizedTransactionRecords(day, "2026-07-24", null);
    expect(records[0].eventType).toBe("chargeback");
    expect(records[0].receivableState).toBe("chargeback");
  });

  it("nunca lança quando um expectedPayment referencia uma venda ausente do array sales (defensivo)", () => {
    const day = conciliation({ sales: [], expectedPayments: [expectedPayment()] });
    expect(() => buildNormalizedTransactionRecords(day, "2026-07-24", null)).not.toThrow();
    expect(buildNormalizedTransactionRecords(day, "2026-07-24", null)).toHaveLength(0);
  });

  it("preserva o valor bruto/taxas/líquido oficiais, sem recalcular taxa a partir de outra fórmula", () => {
    const day = conciliation({ expectedPayments: [expectedPayment({ grossAmount: 100, amount: 97 })] });
    const records = buildNormalizedTransactionRecords(day, "2026-07-24", null);
    expect(records[0].grossAmount).toBe(100);
    expect(records[0].netAmount).toBe(97);
    expect(records[0].feeAmount).toBeCloseTo(3);
  });

  it("registra o arquivo de origem no formato confirmado", () => {
    const records = buildNormalizedTransactionRecords(conciliation(), "2026-07-24", null);
    expect(records[0].sourceFile).toBe("900000001-20260724-XML2_4-without_reversals.xml");
  });
});

function advance(overrides: Partial<NormalizedAdvance> = {}): NormalizedAdvance {
  return { saleExternalReference: "NSU-1", installmentNumber: 1, advanceFeeAmount: 1.5, originalExpectedPaymentDate: "2026-07-26", settledPaymentDate: "2026-07-25", ...overrides };
}

describe("buildNormalizedTransactionRecords — campos oficiais Stone (Missão V6.1)", () => {
  it("extrai mdrAmount oficial de sale.raw.installments (FeeType != 2) por número de parcela, nunca confundido com feeAmount derivado", () => {
    const day = conciliation({
      sales: [stoneSale({ raw: { initiatorTransactionKey: "INIT-1", installments: [{ installmentNumber: 1, mdrAmount: 3.5, saleFee: null }] } as never })],
    });
    const records = buildNormalizedTransactionRecords(day, "2026-07-24", null);
    expect(records[0].mdrAmountStone).toBe(3.5);
    expect(records[0].saleFeeCombined).toBeNull();
    // o derivado continua existindo em paralelo, sem ser sobrescrito pelo oficial
    expect(records[0].feeAmount).toBeCloseTo(3, 2);
  });

  it("extrai saleFeeCombined oficial quando FeeType == 2 (taxa única combinada)", () => {
    const day = conciliation({
      sales: [stoneSale({ raw: { initiatorTransactionKey: "INIT-1", installments: [{ installmentNumber: 1, mdrAmount: null, saleFee: 4.2 }] } as never })],
    });
    const records = buildNormalizedTransactionRecords(day, "2026-07-24", null);
    expect(records[0].saleFeeCombined).toBe(4.2);
    expect(records[0].mdrAmountStone).toBeNull();
  });

  it("sem campo oficial na parcela correspondente -> mdrAmountStone/saleFeeCombined null (nunca inventa)", () => {
    const records = buildNormalizedTransactionRecords(conciliation(), "2026-07-24", null);
    expect(records[0].mdrAmountStone).toBeNull();
    expect(records[0].saleFeeCombined).toBeNull();
  });

  it("casa o número da parcela certo — parcela 2 nunca herda o campo oficial da parcela 1", () => {
    const day = conciliation({
      sales: [
        stoneSale({
          raw: {
            initiatorTransactionKey: "INIT-1",
            installments: [
              { installmentNumber: 1, mdrAmount: 3, saleFee: null },
              { installmentNumber: 2, mdrAmount: 5, saleFee: null },
            ],
          } as never,
        }),
      ],
      expectedPayments: [expectedPayment({ installmentNumber: 2, grossAmount: 100, amount: 95 })],
    });
    const records = buildNormalizedTransactionRecords(day, "2026-07-24", null);
    expect(records[0].mdrAmountStone).toBe(5); // pegou a parcela 2, não a 1
  });

  it("extrai advanceFeeAmountStone oficial de day.advances por saleExternalReference+installmentNumber", () => {
    const day = conciliation({ advances: [advance({ advanceFeeAmount: 2.1 })] });
    const records = buildNormalizedTransactionRecords(day, "2026-07-24", null);
    expect(records[0].advanceFeeAmountStone).toBe(2.1);
  });

  it("sem advance correspondente -> advanceFeeAmountStone null", () => {
    const records = buildNormalizedTransactionRecords(conciliation(), "2026-07-24", null);
    expect(records[0].advanceFeeAmountStone).toBeNull();
  });
});
