import { describe, expect, it } from "vitest";
import { computeAccountBalanceFromBankStatement, computeAccountsReceivableStatus, computeNetAmount, computeOutstanding, resolveContractValue } from "@/lib/finance/status";
import type { ContractValuePeriod } from "@/lib/finance/types";

describe("computeOutstanding", () => {
  it("calcula o saldo como expected - received", () => {
    expect(computeOutstanding(900, 0)).toBe(900);
    expect(computeOutstanding(900, 400)).toBe(500);
  });

  it("nunca retorna saldo negativo mesmo com pagamento a maior", () => {
    expect(computeOutstanding(900, 950)).toBe(0);
  });

  it("chega a zero quando totalmente pago", () => {
    expect(computeOutstanding(900, 900)).toBe(0);
  });
});

describe("computeAccountsReceivableStatus", () => {
  const base = { receivedAmount: 0, outstandingAmount: 900, dueDate: "2026-07-10" } as const;

  it("mantém draft/cancelled sem recalcular — são decisões manuais", () => {
    expect(computeAccountsReceivableStatus({ ...base, status: "draft" }, "2026-08-01")).toBe("draft");
    expect(computeAccountsReceivableStatus({ ...base, status: "cancelled" }, "2026-08-01")).toBe("cancelled");
  });

  it("conta paga: outstandingAmount = 0 vira paid, mesmo depois do vencimento", () => {
    expect(
      computeAccountsReceivableStatus({ status: "open", receivedAmount: 900, outstandingAmount: 0, dueDate: "2026-07-10" }, "2026-08-01"),
    ).toBe("paid");
  });

  it("conta vencida: dueDate no passado e outstanding > 0 vira overdue", () => {
    expect(computeAccountsReceivableStatus({ ...base, status: "open" }, "2026-07-11")).toBe("overdue");
  });

  it("pagamento parcial: outstanding > 0 e receivedAmount > 0, dentro do prazo, vira partially_paid", () => {
    expect(
      computeAccountsReceivableStatus(
        { status: "open", receivedAmount: 400, outstandingAmount: 500, dueDate: "2026-07-10" },
        "2026-07-05",
      ),
    ).toBe("partially_paid");
  });

  it("pagamento parcial vencido vira overdue, não partially_paid", () => {
    expect(
      computeAccountsReceivableStatus(
        { status: "open", receivedAmount: 400, outstandingAmount: 500, dueDate: "2026-07-10" },
        "2026-07-15",
      ),
    ).toBe("overdue");
  });

  it("sem pagamento e dentro do prazo permanece open", () => {
    expect(computeAccountsReceivableStatus({ ...base, status: "open" }, "2026-07-01")).toBe("open");
  });

  it("mantém reversed sem recalcular — é uma decisão manual, mesmo com saldo em aberto novamente", () => {
    expect(computeAccountsReceivableStatus({ ...base, status: "reversed" }, "2026-08-01")).toBe("reversed");
  });
});

describe("computeNetAmount — valor líquido após taxa (ex.: taxa Stone)", () => {
  it("subtrai a taxa do valor recebido", () => {
    expect(computeNetAmount(1200, 36)).toBe(1164);
  });

  it("sem taxa informada (null), retorna o próprio valor recebido — nunca inventa uma taxa", () => {
    expect(computeNetAmount(1200, null)).toBe(1200);
  });

  it("nunca retorna valor líquido negativo, mesmo com taxa maior que o valor recebido", () => {
    expect(computeNetAmount(50, 80)).toBe(0);
  });
});

describe("resolveContractValue — vigência do contrato Don Juan", () => {
  const donJuanPeriods: ContractValuePeriod[] = [
    {
      id: "don-juan-valor-550",
      contractId: "contrato-don-juan-fast-burger",
      amount: 550,
      effectiveFrom: null,
      effectiveUntil: "2026-07-15",
      notes: null,
    },
    {
      id: "don-juan-valor-800",
      contractId: "contrato-don-juan-fast-burger",
      amount: 800,
      effectiveFrom: "2026-08-15",
      effectiveUntil: null,
      notes: null,
    },
  ];

  it("retorna R$ 550,00 antes/até 15/07/2026", () => {
    expect(resolveContractValue(donJuanPeriods, "2026-07-01")).toBe(550);
    expect(resolveContractValue(donJuanPeriods, "2026-07-15")).toBe(550);
  });

  it("retorna R$ 800,00 a partir de 15/08/2026", () => {
    expect(resolveContractValue(donJuanPeriods, "2026-08-15")).toBe(800);
    expect(resolveContractValue(donJuanPeriods, "2026-09-01")).toBe(800);
  });

  it("não inventa valor para a lacuna entre 16/07/2026 e 14/08/2026", () => {
    expect(resolveContractValue(donJuanPeriods, "2026-07-20")).toBeNull();
    expect(resolveContractValue(donJuanPeriods, "2026-08-14")).toBeNull();
  });
});

/**
 * Missão Financeiro V4.0 — saldo real a partir do extrato bancário bruto, não só das linhas já
 * convertidas em cash_movements (achado da auditoria: só 29% das linhas Stone reais tinham virado
 * cash_movements, produzindo um saldo artificialmente negativo, sem relação com a realidade).
 */
describe("computeAccountBalanceFromBankStatement", () => {
  it("usa todas as linhas reais (não só as classificadas) para somar o saldo", () => {
    const result = computeAccountBalanceFromBankStatement([
      { direction: "entrada", amount: 1000, status: "conciliado", date: "2026-07-01" },
      { direction: "entrada", amount: 500, status: "a_classificar", date: "2026-07-05" }, // ainda não classificada, mas é dinheiro real
      { direction: "saida", amount: 200, status: "nao_conciliado", date: "2026-07-10" },
    ]);
    expect(result.balance).toBe(1300); // 1000 + 500 - 200, mesmo com 2 delas não classificadas
  });

  it("exclui linhas 'ignorado' do saldo — são as únicas marcadas com justificativa explícita de exclusão", () => {
    const result = computeAccountBalanceFromBankStatement([
      { direction: "entrada", amount: 1000, status: "conciliado", date: "2026-07-01" },
      { direction: "entrada", amount: 999999, status: "ignorado", date: "2026-07-02" },
    ]);
    expect(result.balance).toBe(1000);
    expect(result.totalCount).toBe(1); // a linha ignorada nem conta no total
  });

  it("cobertura de classificação é separada do saldo — % conciliado, mas o saldo já usa 100% das linhas reais", () => {
    const result = computeAccountBalanceFromBankStatement([
      { direction: "entrada", amount: 100, status: "conciliado", date: "2026-07-01" },
      { direction: "entrada", amount: 100, status: "a_classificar", date: "2026-07-02" },
      { direction: "entrada", amount: 100, status: "nao_conciliado", date: "2026-07-03" },
      { direction: "entrada", amount: 100, status: "conciliado", date: "2026-07-04" },
    ]);
    expect(result.balance).toBe(400); // 100% das linhas reais entram no saldo
    expect(result.classifiedCount).toBe(2);
    expect(result.totalCount).toBe(4);
    expect(result.classifiedPercent).toBe(50); // só a cobertura de classificação é parcial
  });

  it("período coberto é o intervalo real das linhas — nunca presume data anterior à importação", () => {
    const result = computeAccountBalanceFromBankStatement([
      { direction: "entrada", amount: 100, status: "conciliado", date: "2026-03-05" },
      { direction: "saida", amount: 50, status: "conciliado", date: "2026-08-14" },
    ]);
    expect(result.importPeriodFrom).toBe("2026-03-05");
    expect(result.importPeriodTo).toBe("2026-08-14");
  });

  it("sem nenhuma linha real, cobertura percentual é null (nunca 0/0 fabricado) e saldo é 0", () => {
    const result = computeAccountBalanceFromBankStatement([]);
    expect(result.balance).toBe(0);
    expect(result.classifiedPercent).toBeNull();
    expect(result.importPeriodFrom).toBeNull();
    expect(result.importPeriodTo).toBeNull();
  });
});
