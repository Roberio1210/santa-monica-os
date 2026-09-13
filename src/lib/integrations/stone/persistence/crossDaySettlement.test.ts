import { describe, expect, it } from "vitest";
import { resolveCrossDaySettlement, type CrossDaySettlementCandidate, type CrossDaySettlementInput } from "@/lib/integrations/stone/persistence/crossDaySettlement";

/**
 * Missão 69 — prova pura (sem I/O) da correlação venda↔liquidação cross-day, usando fixtures
 * sintéticas inspiradas no caso real comprovado na Missão 68 (venda 22/07, liquidação 23/07,
 * mesma `acquirerTransactionKey`+`installmentNumber`, mesmo `netAmount`).
 */

function settlement(overrides: Partial<CrossDaySettlementInput> = {}): CrossDaySettlementInput {
  return { saleExternalReference: "ACQ-KEY-0001", installmentNumber: 1, netAmount: 9.888, settledPaymentDate: "2026-07-23", ...overrides };
}

function candidate(overrides: Partial<CrossDaySettlementCandidate> = {}): CrossDaySettlementCandidate {
  return { externalKey: "hash-abc123", settledPaymentDate: null, netAmount: 9.888, ...overrides };
}

describe("resolveCrossDaySettlement — Missão 69 (cenário real: venda 22/07, liquidação 23/07)", () => {
  it("1/2/14) venda em D + settlement correspondente em D+1: encontra e atualiza (mesmo netAmount do caso real 9.888)", () => {
    const result = resolveCrossDaySettlement(settlement(), [candidate()]);
    expect(result).toEqual({ status: "matched", externalKey: "hash-abc123", settledPaymentDate: "2026-07-23", settledAmount: 9.888 });
  });

  it("3) chave bate mas nenhum candidato tem exatamente essa installmentNumber -> repository não devolve candidato -> no_candidate", () => {
    // A responsabilidade de filtrar por installmentNumber é do repository (a busca já é por
    // acquirerTransactionKey+installmentNumber); aqui simulamos o resultado dessa busca vindo vazio.
    const result = resolveCrossDaySettlement(settlement({ installmentNumber: 2 }), []);
    expect(result).toEqual({ status: "no_candidate" });
  });

  it("4) chave e installment batem mas netAmount diverge além da tolerância -> conflito, nunca atualiza", () => {
    const result = resolveCrossDaySettlement(settlement({ netAmount: 50.0 }), [candidate({ netAmount: 9.888 })]);
    expect(result).toEqual({ status: "conflict", reason: "amount_mismatch", externalKey: "hash-abc123", expectedNetAmount: 9.888, settlementNetAmount: 50.0 });
  });

  it("diferença de 1 centavo (arredondamento) ainda é aceita — mesma tolerância de bankStatement/reconciliation.ts", () => {
    const result = resolveCrossDaySettlement(settlement({ netAmount: 9.89 }), [candidate({ netAmount: 9.888 })]); // 989 vs 989 cents (round) - dentro da tolerância
    expect(result.status).toBe("matched");
  });

  it("5) settlement sem nenhuma venda persistida correspondente -> no_candidate, nunca inventa associação", () => {
    const result = resolveCrossDaySettlement(settlement(), []);
    expect(result).toEqual({ status: "no_candidate" });
  });

  it("6) venda já com settledPaymentDate preenchido -> NUNCA sobrescreve, mesmo com valor batendo perfeitamente", () => {
    const result = resolveCrossDaySettlement(settlement(), [candidate({ settledPaymentDate: "2026-07-24" })]);
    expect(result).toEqual({ status: "already_settled", externalKey: "hash-abc123" });
  });

  it("8) duas vendas candidatas para a mesma identidade -> nunca escolhe arbitrariamente, trata como conflito", () => {
    const result = resolveCrossDaySettlement(settlement(), [candidate({ externalKey: "hash-A" }), candidate({ externalKey: "hash-B" })]);
    expect(result).toEqual({ status: "conflict", reason: "multiple_candidates", candidateKeys: ["hash-A", "hash-B"] });
  });

  it("nunca faz match só por valor (mesmo netAmount, mas isso não é usado como identidade — só o repository decide os candidatos por chave)", () => {
    // Este teste documenta a garantia arquitetural: resolveCrossDaySettlement nunca recebe nem usa
    // o acquirerTransactionKey do lado do candidato para "procurar" — ele só valida o(s)
    // candidato(s) que o repository JÁ filtrou pela chave real. Passar um candidato com valor
    // igual mas de uma identidade em teoria diferente ainda é tratado como o único candidato válido,
    // porque a responsabilidade de restringir por identidade é do repository, nunca desta função.
    const result = resolveCrossDaySettlement(settlement(), [candidate()]);
    expect(result.status).toBe("matched");
  });
});
