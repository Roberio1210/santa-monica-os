import { describe, expect, it } from "vitest";
import { parseConciliationXml } from "@/lib/integrations/stone/xml";
import { formatStoneDate, normalizeConciliation } from "@/lib/integrations/stone/normalize";
import { OFFICIAL_SAMPLE_XML } from "@/lib/integrations/stone/__fixtures__/official-sample";

function normalizedSample() {
  const file = parseConciliationXml(OFFICIAL_SAMPLE_XML, "XML2_4");
  return normalizeConciliation(file);
}

describe("formatStoneDate — Sprint 7.0, Z2", () => {
  it("converte aaaammdd para aaaa-mm-dd", () => {
    expect(formatStoneDate("20260722")).toBe("2026-07-22");
  });

  it("converte aaaammddHHmmss para ISO 8601", () => {
    expect(formatStoneDate("20260722100005")).toBe("2026-07-22T10:00:05");
  });

  it("formato desconhecido devolve o valor como veio, nunca lança", () => {
    expect(formatStoneDate("abc")).toBe("abc");
  });
});

describe("normalizeConciliation — teste 1 (arquivo oficial completo, fixture derivada da documentação)", () => {
  it("normaliza o cabeçalho e o período do arquivo", () => {
    const n = normalizedSample();
    expect(n.referenceDate).toBe("2026-07-22");
    expect(n.establishmentCode).toBe("900000001");
    expect(n.layout).toBe("XML2_4");
  });

  it("normaliza as 4 vendas do arquivo", () => {
    const n = normalizedSample();
    expect(n.sales).toHaveLength(4);
  });

  it("teste 6 — transação de débito é classificada como débito", () => {
    const n = normalizedSample();
    const sale = n.sales.find((s) => s.acquirerTransactionKey === "NSU-ANON-0001")!;
    expect(sale.cardFlow).toBe("debito");
    expect(sale.grossAmount).toBe(100);
    expect(sale.netAmount).toBe(97.5);
    expect(sale.feeAmount).toBeCloseTo(2.5);
    expect(sale.terminalSerialNumber).toBe("TERM-ANON-01");
  });

  it("teste 7 — crédito à vista é classificado como crédito, uma parcela só", () => {
    const n = normalizedSample();
    const sale = n.sales.find((s) => s.acquirerTransactionKey === "NSU-ANON-0002")!;
    expect(sale.cardFlow).toBe("credito");
    expect(sale.installmentsCount).toBe(1);
  });

  it("teste 8 — crédito parcelado (3x) preserva o número de parcelas e o valor líquido somado", () => {
    const n = normalizedSample();
    const sale = n.sales.find((s) => s.acquirerTransactionKey === "NSU-ANON-0003")!;
    expect(sale.cardFlow).toBe("credito");
    expect(sale.installmentsCount).toBe(3);
    expect(sale.raw.installments).toHaveLength(3);
    expect(sale.netAmount).toBeCloseTo(291); // 97 + 97 + 97
  });

  it("teste 9 — cancelamento aparece na venda correspondente", () => {
    const n = normalizedSample();
    const sale = n.sales.find((s) => s.acquirerTransactionKey === "NSU-ANON-0004")!;
    expect(sale.cancellations).toHaveLength(1);
    expect(sale.cancellations[0]).toMatchObject({ operationKey: "OP-ANON-01", amount: 50 });
  });

  it("teste 11 — chargeback é normalizado com referência à venda de origem", () => {
    const n = normalizedSample();
    expect(n.chargebacks).toHaveLength(1);
    expect(n.chargebacks[0]).toMatchObject({ id: "CB-ANON-01", saleExternalReference: "NSU-ANON-0003", amount: 97 });
  });

  it("teste 10 — estorno (chargeback refund) é normalizado com referência à venda de origem", () => {
    const n = normalizedSample();
    expect(n.chargebackRefunds).toHaveLength(1);
    expect(n.chargebackRefunds[0]).toMatchObject({ id: "CBR-ANON-01", saleExternalReference: "NSU-ANON-0003", amount: 97 });
  });

  it("antecipação identificada via FinancialTransactionsAccounts.advanceRateAmount", () => {
    const n = normalizedSample();
    expect(n.advances).toHaveLength(1);
    expect(n.advances[0]).toMatchObject({ saleExternalReference: "NSU-ANON-0003", advanceFeeAmount: 1.5, settledPaymentDate: "2026-07-23" });
  });

  it("teste 13 — pagamento realizado só conta quando Payment.Id está presente", () => {
    const n = normalizedSample();
    expect(n.realizedPayments).toHaveLength(1);
    expect(n.realizedPayments[0]).toMatchObject({ paymentId: "PAY-ANON-01", amount: 397.5 });
    expect(n.realizedPayments[0].bankAccount).toEqual({ bankCode: "0341", bankBranch: "0001", accountNumber: "999999" });
  });

  it("terminais distintos são coletados (nunca duplicados)", () => {
    const n = normalizedSample();
    expect(n.terminalSerialNumbers.sort()).toEqual(["TERM-ANON-01", "TERM-ANON-02"]);
  });

  it("posição financeira normalizada nunca usa o nome WalletPosition — sempre financialPositions/renomeado", () => {
    const n = normalizedSample();
    expect(n.financialPositions).toEqual([{ amount: 5000, category: "Default", walletTypeId: 3 }]);
  });

  it("expectedPayments reaproveita PrevisionPaymentDate renomeado para expectedPaymentDate, uma entrada por parcela", () => {
    const n = normalizedSample();
    // 1 (venda 1) + 1 (venda 2) + 3 (venda 3, parcelada) + 1 (venda 4, cancelada) = 6
    expect(n.expectedPayments).toHaveLength(6);
    const first = n.expectedPayments.find((p) => p.saleExternalReference === "NSU-ANON-0001")!;
    expect(first.expectedPaymentDate).toBe("2026-07-23");
  });

  it("teste 2 — arquivo sem WalletPosition (Layout 2.2) normaliza financialPositions como lista vazia", () => {
    const minimal = `<Conciliation><Header><GenerationDateTime>20260721053000</GenerationDateTime><StoneCode>1</StoneCode><LayoutVersion>2.2</LayoutVersion><FileId>1</FileId><ReferenceDate>20260720</ReferenceDate></Header><Trailer><CapturedTransactionsQuantity>0</CapturedTransactionsQuantity><CanceledTransactionsQuantity>0</CanceledTransactionsQuantity><PaidInstallmentsQuantity>0</PaidInstallmentsQuantity><ChargedCancellationsQuantity>0</ChargedCancellationsQuantity><ChargebacksQuantity>0</ChargebacksQuantity><ChargebacksRefundQuantity>0</ChargebacksRefundQuantity><ChargedChargebacksQuantity>0</ChargedChargebacksQuantity><PaidChargebacksRefundQuantity>0</PaidChargebacksRefundQuantity><PaidEventsQuantity>0</PaidEventsQuantity><ChargedEventsQuantity>0</ChargedEventsQuantity></Trailer></Conciliation>`;
    const file = parseConciliationXml(minimal, "XML2_2");
    const n = normalizeConciliation(file);
    expect(n.financialPositions).toEqual([]);
    expect(n.sales).toEqual([]);
  });
});
