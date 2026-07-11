import { describe, expect, it } from "vitest";
import { computeAccountsReceivableStatus, computeOutstanding, resolveContractValue } from "@/lib/finance/status";
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
