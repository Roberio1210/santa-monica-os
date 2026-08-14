import { describe, expect, it } from "vitest";
import { computeAccountBalance, computeAccountPeriodSummary, computeAccountsPayableStatus, computeInstallments } from "@/lib/finance/status";

describe("computeAccountsPayableStatus", () => {
  const base = { paidAmount: 0, outstandingAmount: 4750, dueDate: "2026-07-05" } as const;

  it("mantém rascunho/cancelada sem recalcular — são decisões manuais", () => {
    expect(computeAccountsPayableStatus({ ...base, status: "rascunho" }, "2026-08-01")).toBe("rascunho");
    expect(computeAccountsPayableStatus({ ...base, status: "cancelada" }, "2026-08-01")).toBe("cancelada");
  });

  it("conta paga: outstandingAmount = 0 vira paga, mesmo depois do vencimento (cálculo de vencimento correto)", () => {
    expect(computeAccountsPayableStatus({ status: "pendente", paidAmount: 4750, outstandingAmount: 0, dueDate: "2026-07-05" }, "2026-08-01")).toBe(
      "paga",
    );
  });

  it("conta vencida: dueDate no passado e saldo > 0 vira vencida (calculado pela data, nunca gravado de forma inconsistente)", () => {
    expect(computeAccountsPayableStatus({ ...base, status: "pendente" }, "2026-07-06")).toBe("vencida");
  });

  it("dentro do prazo, sem pagamento, permanece pendente", () => {
    expect(computeAccountsPayableStatus({ ...base, status: "pendente" }, "2026-07-01")).toBe("pendente");
  });

  it("pagamento parcial dentro do prazo vira parcialmente_paga", () => {
    expect(
      computeAccountsPayableStatus({ status: "pendente", paidAmount: 2000, outstandingAmount: 2750, dueDate: "2026-07-05" }, "2026-07-01"),
    ).toBe("parcialmente_paga");
  });

  it("pagamento parcial vencido vira vencida, não parcialmente_paga", () => {
    expect(
      computeAccountsPayableStatus({ status: "pendente", paidAmount: 2000, outstandingAmount: 2750, dueDate: "2026-07-05" }, "2026-07-10"),
    ).toBe("vencida");
  });
});

describe("computeInstallments — parcelamento", () => {
  it("divide em parcelas iguais quando o valor é exatamente divisível", () => {
    const installments = computeInstallments(3000, 3, "2026-08-01");
    expect(installments).toEqual([
      { number: 1, amount: 1000, dueDate: "2026-08-01" },
      { number: 2, amount: 1000, dueDate: "2026-09-01" },
      { number: 3, amount: 1000, dueDate: "2026-10-01" },
    ]);
  });

  it("a última parcela absorve o resto do arredondamento — soma sempre bate com o valor original (sem ponto flutuante impreciso)", () => {
    const installments = computeInstallments(1000, 3, "2026-08-01");
    const total = installments.reduce((sum, i) => sum + i.amount, 0);
    expect(Math.round(total * 100) / 100).toBe(1000);
    expect(installments[0].amount).toBe(333.33);
    expect(installments[1].amount).toBe(333.33);
    expect(installments[2].amount).toBe(333.34);
  });

  it("vencimentos avançam um mês por parcela", () => {
    const installments = computeInstallments(600, 3, "2026-01-31");
    expect(installments.map((i) => i.dueDate)).toEqual(["2026-01-31", "2026-03-03", "2026-03-31"]);
  });

  it("1 parcela é equivalente a não parcelar", () => {
    const installments = computeInstallments(500, 1, "2026-08-05");
    expect(installments).toEqual([{ number: 1, amount: 500, dueDate: "2026-08-05" }]);
  });
});

describe("computeAccountBalance — saldo de conta financeira", () => {
  it("caixa físico começa no fundo fixo informado, nunca inventa saldo além dele", () => {
    expect(computeAccountBalance(100, [], [], [])).toBe(100);
  });

  it("contas sem fundo fixo informado (Stone, Ailos) começam em zero, não em um valor inventado", () => {
    expect(computeAccountBalance(null, [], [], [])).toBe(0);
  });

  it("despesa paga em espécie reduz o saldo do caixa", () => {
    expect(computeAccountBalance(100, [{ type: "saida", amount: 30 }], [], [])).toBe(70);
  });

  it("reposição do caixa (transferência) aumenta o saldo sem ser receita nem despesa", () => {
    // reposição é transferência de entrada (transfersIn) — nunca um cash_movement de entrada.
    const balance = computeAccountBalance(100, [{ type: "saida", amount: 90 }], [{ amount: 50 }], []);
    expect(balance).toBe(60); // 100 - 90 + 50
  });

  it("transferência para fora (ex.: Stone -> Caixa) reduz o saldo de origem sem contar como despesa", () => {
    const balance = computeAccountBalance(null, [], [], [{ amount: 40 }]);
    expect(balance).toBe(-40);
  });

  it("alerta de saldo baixo dispara quando o saldo calculado fica abaixo do fundo fixo", () => {
    const fixedFundAmount = 100;
    const balance = computeAccountBalance(fixedFundAmount, [{ type: "saida", amount: 30 }], [], []);
    const belowThreshold = balance < fixedFundAmount;
    expect(balance).toBe(70);
    expect(belowThreshold).toBe(true);
  });
});

describe("computeAccountPeriodSummary — saldo inicial/entradas/saídas/saldo final por período (Missão Financeiro V2.1, Fase E)", () => {
  it("sem movimento nenhum, saldo inicial e final são iguais ao fundo fixo", () => {
    const summary = computeAccountPeriodSummary(null, [], [], [], "2026-08-01", "2026-08-14");
    expect(summary).toEqual({ openingBalance: 0, totalIn: 0, totalOut: 0, closingBalance: 0 });
  });

  it("movimento ANTES do período entra no saldo inicial, nunca nas entradas/saídas do período", () => {
    const summary = computeAccountPeriodSummary(
      null,
      [{ type: "entrada", amount: 500, date: "2026-07-15" }],
      [],
      [],
      "2026-08-01",
      "2026-08-14",
    );
    expect(summary.openingBalance).toBe(500);
    expect(summary.totalIn).toBe(0);
  });

  it("movimento DENTRO do período soma em entradas/saídas, saldo final reflete a soma", () => {
    const summary = computeAccountPeriodSummary(
      null,
      [
        { type: "entrada", amount: 5000, date: "2026-08-01" },
        { type: "saida", amount: 300, date: "2026-08-02" },
      ],
      [],
      [],
      "2026-08-01",
      "2026-08-14",
    );
    expect(summary.openingBalance).toBe(0);
    expect(summary.totalIn).toBe(5000);
    expect(summary.totalOut).toBe(300);
    expect(summary.closingBalance).toBe(4700);
  });

  it("movimento DEPOIS do período nunca entra no saldo final do período", () => {
    const summary = computeAccountPeriodSummary(
      null,
      [{ type: "entrada", amount: 999, date: "2026-09-01" }],
      [],
      [],
      "2026-08-01",
      "2026-08-14",
    );
    expect(summary.closingBalance).toBe(0);
  });

  it("transferências dentro do período contam como entrada/saída de caixa, mesmo nunca contando como receita/despesa na DRE", () => {
    const summary = computeAccountPeriodSummary(
      null,
      [],
      [{ amount: 1000, date: "2026-08-05" }],
      [{ amount: 200, date: "2026-08-06" }],
      "2026-08-01",
      "2026-08-14",
    );
    expect(summary.totalIn).toBe(1000);
    expect(summary.totalOut).toBe(200);
    expect(summary.closingBalance).toBe(800);
  });
});
