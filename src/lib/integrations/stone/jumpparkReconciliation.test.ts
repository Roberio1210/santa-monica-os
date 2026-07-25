import { describe, expect, it } from "vitest";
import { reconcileStoneWithJumppark, withinProcessingWindow, type JumpparkOrderForReconciliation } from "@/lib/integrations/stone/jumpparkReconciliation";
import type { NormalizedSaleTransaction } from "@/lib/integrations/stone/normalize";
import type { StoneTransaction } from "@/lib/integrations/stone/types";

function stoneSale(overrides: Partial<NormalizedSaleTransaction> & { initiatorTransactionKey?: string | null } = {}): NormalizedSaleTransaction {
  const { initiatorTransactionKey = null, ...rest } = overrides;
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
    terminalSerialNumber: null,
    cancellations: [],
    raw: { initiatorTransactionKey } as unknown as StoneTransaction,
    ...rest,
  };
}

function order(overrides: Partial<JumpparkOrderForReconciliation> = {}): JumpparkOrderForReconciliation {
  return { externalReference: "ORDER-1", occurredAt: "2026-07-24T10:06:00", amount: 100, paymentMethod: "credito", expectedInstallments: null, ...overrides };
}

const NOW = new Date("2026-07-24T12:00:00.000Z");
const EMPTY_CHARGEBACKS = new Set<string>();

describe("withinProcessingWindow — janela de defasagem oficial da Stone (29h)", () => {
  it("dentro de 29h ainda é considerado dentro da janela", () => {
    expect(withinProcessingWindow("2026-07-23T12:00:00.000Z", NOW)).toBe(true);
  });

  it("depois de 29h já não está mais dentro da janela", () => {
    expect(withinProcessingWindow("2026-07-22T00:00:00.000Z", NOW)).toBe(false);
  });
});

describe("reconcileStoneWithJumppark — Sprint 7.0, Z3, decisão do usuário", () => {
  it("teste 16/17 — exact_match por identificador forte (InitiatorTransactionKey === referência JumpPark)", () => {
    const sale = stoneSale({ initiatorTransactionKey: "ORDER-1", grossAmount: 100 });
    const jpOrder = order({ externalReference: "ORDER-1", amount: 100 });
    const results = reconcileStoneWithJumppark([jpOrder], [sale], EMPTY_CHARGEBACKS, NOW);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("exact_match");
    expect(results[0].confidence).toBe("high");
    expect(results[0].comparedFields).toContain("initiatorTransactionKey");
  });

  it("teste 18 — probable_match quando não há identificador forte, mas valor+horário+forma batem", () => {
    const sale = stoneSale({ acquirerTransactionKey: "NSU-2", grossAmount: 150, capturedAt: "2026-07-24T14:00:00" });
    const jpOrder = order({ externalReference: "ORDER-2", amount: 150, occurredAt: "2026-07-24T14:02:00" });
    const results = reconcileStoneWithJumppark([jpOrder], [sale], EMPTY_CHARGEBACKS, NOW);
    expect(results[0].type).toBe("probable_match");
    expect(results[0].limitations.some((l) => l.toLowerCase().includes("nunca deve ser tratada como certeza"))).toBe(true);
  });

  it("teste 19 — ambiguous quando dois candidatos têm pontuação heurística equivalente", () => {
    const saleA = stoneSale({ acquirerTransactionKey: "NSU-A", grossAmount: 200, capturedAt: "2026-07-24T09:00:00" });
    const saleB = stoneSale({ acquirerTransactionKey: "NSU-B", grossAmount: 200, capturedAt: "2026-07-24T09:00:00" });
    const jpOrder = order({ externalReference: "ORDER-3", amount: 200, occurredAt: "2026-07-24T09:01:00" });
    const results = reconcileStoneWithJumppark([jpOrder], [saleA, saleB], EMPTY_CHARGEBACKS, NOW);
    const matchForOrder = results.find((r) => r.jumpparkOrder?.externalReference === "ORDER-3");
    expect(matchForOrder?.type).toBe("ambiguous");
    expect(matchForOrder?.stoneSale).toBeNull();
  });

  it("teste 20/29 — unmatched_jumppark só depois da janela de defasagem oficial", () => {
    const jpOrder = order({ externalReference: "ORDER-OLD", occurredAt: "2026-07-20T10:00:00.000Z", amount: 999 });
    const results = reconcileStoneWithJumppark([jpOrder], [], EMPTY_CHARGEBACKS, NOW);
    expect(results[0].type).toBe("unmatched_jumppark");
  });

  it("teste 21 — unmatched_stone para venda Stone sem nenhum pedido JumpPark correspondente", () => {
    const sale = stoneSale({ acquirerTransactionKey: "NSU-SOZINHA", grossAmount: 777 });
    const results = reconcileStoneWithJumppark([], [sale], EMPTY_CHARGEBACKS, NOW);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("unmatched_stone");
    expect(results[0].stoneSale?.externalReference).toBe("NSU-SOZINHA");
  });

  it("teste 22 — value_mismatch quando o melhor candidato tem valor divergente", () => {
    const sale = stoneSale({ acquirerTransactionKey: "NSU-VM", grossAmount: 100, capturedAt: "2026-07-24T10:00:00" });
    const jpOrder = order({ externalReference: "ORDER-VM", amount: 150, occurredAt: "2026-07-24T10:01:00" });
    const results = reconcileStoneWithJumppark([jpOrder], [sale], EMPTY_CHARGEBACKS, NOW);
    expect(results[0].type).toBe("value_mismatch");
  });

  it("teste 23 — payment_method_mismatch quando valor e horário batem mas a forma diverge", () => {
    const sale = stoneSale({ acquirerTransactionKey: "NSU-PM", grossAmount: 100, cardFlow: "debito", capturedAt: "2026-07-24T10:00:00" });
    const jpOrder = order({ externalReference: "ORDER-PM", amount: 100, paymentMethod: "credito", occurredAt: "2026-07-24T10:01:00" });
    const results = reconcileStoneWithJumppark([jpOrder], [sale], EMPTY_CHARGEBACKS, NOW);
    expect(results[0].type).toBe("payment_method_mismatch");
  });

  it("teste 24 — installment_mismatch quando a quantidade de parcelas esperada diverge (mecanismo pronto, hoje dormente com dado real do JumpPark)", () => {
    const sale = stoneSale({ acquirerTransactionKey: "NSU-IM", grossAmount: 100, installmentsCount: 3, capturedAt: "2026-07-24T10:00:00" });
    const jpOrder = order({ externalReference: "ORDER-IM", amount: 100, occurredAt: "2026-07-24T10:01:00", expectedInstallments: 1 });
    const results = reconcileStoneWithJumppark([jpOrder], [sale], EMPTY_CHARGEBACKS, NOW);
    expect(results[0].type).toBe("installment_mismatch");
  });

  it("teste 25 — date_mismatch quando valor e forma batem mas o horário está fora da janela de tolerância", () => {
    const sale = stoneSale({ acquirerTransactionKey: "NSU-DM", grossAmount: 100, capturedAt: "2026-07-24T08:00:00" });
    const jpOrder = order({ externalReference: "ORDER-DM", amount: 100, occurredAt: "2026-07-24T14:00:00" }); // 6h de diferença, muito além dos 90min
    const results = reconcileStoneWithJumppark([jpOrder], [sale], EMPTY_CHARGEBACKS, NOW);
    expect(results[0].type).toBe("date_mismatch");
  });

  it("teste 26/30 — duplicate quando duas vendas Stone têm mesmo valor, minuto e forma de pagamento", () => {
    const saleA = stoneSale({ acquirerTransactionKey: "NSU-DUP-A", grossAmount: 80, capturedAt: "2026-07-24T09:30:00" });
    const saleB = stoneSale({ acquirerTransactionKey: "NSU-DUP-B", grossAmount: 80, capturedAt: "2026-07-24T09:30:45" }); // mesmo minuto, segundos diferentes
    const results = reconcileStoneWithJumppark([], [saleA, saleB], EMPTY_CHARGEBACKS, NOW);
    expect(results.some((r) => r.type === "duplicate")).toBe(true);
  });

  it("teste 27 — reversed quando a venda Stone casada tem cancelamento/chargeback associado", () => {
    const sale = stoneSale({ acquirerTransactionKey: "NSU-REV", grossAmount: 100, capturedAt: "2026-07-24T10:00:00", cancellations: [{ operationKey: "OP1", installmentNumber: null, amount: 100, occurredAt: "2026-07-24T11:00:00" }] });
    const jpOrder = order({ externalReference: "ORDER-REV", amount: 100, occurredAt: "2026-07-24T10:01:00" });
    const results = reconcileStoneWithJumppark([jpOrder], [sale], EMPTY_CHARGEBACKS, NOW);
    expect(results[0].type).toBe("reversed");
  });

  it("teste 28 — pending_processing dentro da janela oficial de defasagem, nunca tratado como erro", () => {
    const jpOrder = order({ externalReference: "ORDER-RECENT", occurredAt: "2026-07-24T11:00:00.000Z", amount: 50 });
    const results = reconcileStoneWithJumppark([jpOrder], [], EMPTY_CHARGEBACKS, NOW);
    expect(results[0].type).toBe("pending_processing");
  });

  it("dinheiro e Pix nunca entram na conciliação — trilhos de pagamento diferentes, nunca uma divergência falsa", () => {
    const cashOrder = order({ externalReference: "ORDER-CASH", paymentMethod: "dinheiro" });
    const pixOrder = order({ externalReference: "ORDER-PIX", paymentMethod: "pix" });
    const results = reconcileStoneWithJumppark([cashOrder, pixOrder], [], EMPTY_CHARGEBACKS, NOW);
    expect(results).toEqual([]);
  });

  it("teste 32 — nenhum pedido e nenhuma venda produz lista vazia, nunca um resultado inventado (zero real, não ausência)", () => {
    expect(reconcileStoneWithJumppark([], [], EMPTY_CHARGEBACKS, NOW)).toEqual([]);
  });

  it("teste 31 — reprocessamento com os mesmos dados de entrada produz exatamente os mesmos resultados (determinístico)", () => {
    const sale = stoneSale({ initiatorTransactionKey: "ORDER-DET", grossAmount: 42 });
    const jpOrder = order({ externalReference: "ORDER-DET", amount: 42 });
    const first = reconcileStoneWithJumppark([jpOrder], [sale], EMPTY_CHARGEBACKS, NOW);
    const second = reconcileStoneWithJumppark([jpOrder], [sale], EMPTY_CHARGEBACKS, NOW);
    expect(second).toEqual(first);
  });

  it("heuristicScore nunca é rotulado como probabilidade — confidence é sempre um nível qualitativo", () => {
    const sale = stoneSale({ initiatorTransactionKey: "ORDER-Q", grossAmount: 10 });
    const jpOrder = order({ externalReference: "ORDER-Q", amount: 10 });
    const results = reconcileStoneWithJumppark([jpOrder], [sale], EMPTY_CHARGEBACKS, NOW);
    expect(["high", "medium", "low"]).toContain(results[0].confidence);
    expect(typeof results[0].heuristicScore).toBe("number");
  });
});
