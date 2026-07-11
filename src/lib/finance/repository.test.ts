import { describe, expect, it } from "vitest";
import { StaticFinanceRepository } from "@/lib/finance/static-repository";
import { toAccountsReceivableView } from "@/lib/finance/status";
import { initialAccountsReceivable } from "@/lib/finance/data/accounts-receivable";

const openIesaAccount = {
  ...initialAccountsReceivable[0],
  receivedAmount: 0,
  outstandingAmount: 900,
  status: "open" as const,
  receivedAt: null,
};

describe("StaticFinanceRepository — pagamento parcial e conta paga", () => {
  it("registra um pagamento parcial e atualiza saldo/status corretamente", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [openIesaAccount] });

    const updated = await repo.recordPayment({
      accountsReceivableId: openIesaAccount.id,
      amount: 400,
      paidAt: "2026-07-05",
      method: "pix",
    });

    expect(updated.receivedAmount).toBe(400);
    expect(updated.outstandingAmount).toBe(500);
    expect(toAccountsReceivableView(updated, "2026-07-05").computedStatus).toBe("partially_paid");
  });

  it("registra o pagamento total e a conta vira paid", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [openIesaAccount] });

    const updated = await repo.recordPayment({
      accountsReceivableId: openIesaAccount.id,
      amount: 900,
      paidAt: "2026-07-10",
      method: "desconhecido",
    });

    expect(updated.outstandingAmount).toBe(0);
    expect(toAccountsReceivableView(updated, "2026-07-10").computedStatus).toBe("paid");
  });

  it("dois pagamentos parciais somados fecham a conta", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [openIesaAccount] });

    await repo.recordPayment({ accountsReceivableId: openIesaAccount.id, amount: 400, paidAt: "2026-07-05", method: "pix" });
    const final = await repo.recordPayment({
      accountsReceivableId: openIesaAccount.id,
      amount: 500,
      paidAt: "2026-07-08",
      method: "dinheiro",
    });

    expect(final.receivedAmount).toBe(900);
    expect(final.outstandingAmount).toBe(0);
  });
});

describe("Recebimento IESA de R$ 900,00 — sem duplicidade e sem confundir faturamento com caixa", () => {
  it("existe exatamente uma conta a receber e um movimento de caixa para o recebimento de 10/07/2026", async () => {
    const repo = new StaticFinanceRepository();
    const receivables = await repo.listAccountsReceivable();
    const cashMovements = await repo.listCashMovements();

    const iesaReceivables = receivables.filter((r) => r.externalId === "iesa-recebivel-2026-06");
    const iesaCashEntries = cashMovements.filter((m) => m.accountsReceivableId === "iesa-recebivel-2026-06");

    expect(iesaReceivables).toHaveLength(1);
    expect(iesaCashEntries).toHaveLength(1);
    expect(iesaReceivables[0].receivedAmount).toBe(900);
    expect(iesaCashEntries[0].amount).toBe(900);
  });

  it("a soma das entradas de caixa de 10/07/2026 é R$ 900,00 — não R$ 1.800,00 (sem dupla contagem)", async () => {
    const repo = new StaticFinanceRepository();
    const cashMovements = await repo.listCashMovements();
    const totalOn10th = cashMovements
      .filter((m) => m.type === "entrada" && m.date === "2026-07-10")
      .reduce((sum, m) => sum + m.amount, 0);
    expect(totalOn10th).toBe(900);
  });

  it("competência (junho/2026) é diferente da data de recebimento (10/07/2026) — nunca a mesma coisa", async () => {
    const repo = new StaticFinanceRepository();
    const iesa = await repo.getAccountsReceivable("iesa-recebivel-2026-06");
    expect(iesa).not.toBeNull();
    expect(iesa!.competenceDate).toBe("2026-06-01");
    expect(iesa!.receivedAt).toBe("2026-07-10");
    expect(iesa!.competenceDate).not.toBe(iesa!.receivedAt);
  });
});
