import { describe, expect, it } from "vitest";
import { reconcileDailyStoneSettlement } from "@/lib/finance/bankStatement/stoneSettlementReconciliation";

describe("reconcileDailyStoneSettlement — Missão V6.2 (Fases 3/7/8)", () => {
  it("líquido recebido em D+1 igual ao esperado -> CONFIRMADO, sem antecipação identificada", () => {
    const [row] = reconcileDailyStoneSettlement([{ date: "2026-08-14", grossAmount: 366, mdrAmount: 8.62, netExpected: 357.38 }], [{ date: "2026-08-15", amount: 357.38 }]);
    expect(row.status).toBe("CONFIRMADO");
    expect(row.netReceived).toBe(357.38);
    expect(row.difference).toBe(0);
    expect(row.antecipacaoAmount).toBe(0);
  });

  it("líquido recebido menor que o esperado (real: 17/08 venda -> 18/08 crédito) -> PARCIAL, diferença vira candidata a antecipação (nunca 'confirmada' sozinha)", () => {
    const [row] = reconcileDailyStoneSettlement([{ date: "2026-08-17", grossAmount: 3020, mdrAmount: 158.76, netExpected: 2861.24 }], [{ date: "2026-08-18", amount: 2722.8 }]);
    expect(row.status).toBe("PARCIAL");
    expect(row.difference).toBeCloseTo(138.44, 2);
    expect(row.antecipacaoAmount).toBeCloseTo(138.44, 2);
  });

  it("sem nenhum crédito bancário na data de liquidação -> NAO_CONCILIADO, nunca inventa um valor recebido", () => {
    const [row] = reconcileDailyStoneSettlement([{ date: "2026-08-05", grossAmount: 400, mdrAmount: 12.96, netExpected: 387.04 }], []);
    expect(row.status).toBe("NAO_CONCILIADO");
    expect(row.netReceived).toBeNull();
    expect(row.difference).toBeNull();
    expect(row.antecipacaoAmount).toBeNull();
  });

  it("líquido recebido MAIOR que o esperado -> diferença negativa nunca vira antecipacaoAmount (seria pareamento errado, não custo)", () => {
    const [row] = reconcileDailyStoneSettlement([{ date: "2026-08-01", grossAmount: 100, mdrAmount: 3, netExpected: 97 }], [{ date: "2026-08-02", amount: 150 }]);
    expect(row.antecipacaoAmount).toBeNull();
    expect(row.status).toBe("PARCIAL");
  });

  it("soma múltiplas linhas bancárias do mesmo dia de liquidação (Recebível de Cartão + Transferência entre contas Stone no mesmo D+1)", () => {
    const [row] = reconcileDailyStoneSettlement(
      [{ date: "2026-08-18", grossAmount: 1610, mdrAmount: 74.66, netExpected: 1535.34 }],
      [
        { date: "2026-08-19", amount: 1396.91 },
        { date: "2026-08-19", amount: 138.43 },
      ],
    );
    expect(row.netReceived).toBeCloseTo(1535.34, 2);
    expect(row.status).toBe("CONFIRMADO");
  });

  it("tolerância de 1 centavo por arredondamento — nunca marca PARCIAL por diferença de sub-centavo", () => {
    const [row] = reconcileDailyStoneSettlement([{ date: "2026-08-01", grossAmount: 100, mdrAmount: 3, netExpected: 97 }], [{ date: "2026-08-02", amount: 96.99 }]);
    expect(row.status).toBe("CONFIRMADO");
  });

  it("todo resultado carrega matchBasis explícito — nunca escondido, sempre heurístico (sem NSU/TID no extrato)", () => {
    const [row] = reconcileDailyStoneSettlement([{ date: "2026-08-01", grossAmount: 100, mdrAmount: 3, netExpected: 97 }], [{ date: "2026-08-02", amount: 97 }]);
    expect(row.matchBasis).toBe("heuristico_data_valor");
  });

  it("data de liquidação é sempre D+1 corrido (mesmo em virada de mês)", () => {
    const [row] = reconcileDailyStoneSettlement([{ date: "2026-08-31", grossAmount: 100, mdrAmount: 3, netExpected: 97 }], []);
    expect(row.settlementDate).toBe("2026-09-01");
  });

  it("ordena por data de venda, independentemente da ordem de entrada", () => {
    const rows = reconcileDailyStoneSettlement(
      [
        { date: "2026-08-10", grossAmount: 100, mdrAmount: 3, netExpected: 97 },
        { date: "2026-08-01", grossAmount: 50, mdrAmount: 1.5, netExpected: 48.5 },
      ],
      [],
    );
    expect(rows.map((r) => r.saleDate)).toEqual(["2026-08-01", "2026-08-10"]);
  });
});
