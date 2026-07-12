import { describe, expect, it } from "vitest";
import { StaticFinanceRepository } from "@/lib/finance/static-repository";
import { toAccountsReceivableView } from "@/lib/finance/status";
import type { CreateAccountsReceivableInput } from "@/lib/finance/types";

const baseInput: CreateAccountsReceivableInput = {
  description: "Parceria IESA/Nissan — lavações de julho/2026",
  partnerId: "iesa-nissan",
  categoryId: "receita-lavacao",
  costCenterId: "cc-estetica-automotiva",
  competenceDate: "2026-07-01",
  dueDate: "2026-08-10",
  expectedAmount: 1200,
};

describe("Criação de conta a receber", () => {
  it("cria uma conta com saldo igual ao valor previsto e status em aberto", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [] });
    const [created] = await repo.createAccountsReceivable(baseInput);

    expect(created.expectedAmount).toBe(1200);
    expect(created.receivedAmount).toBe(0);
    expect(created.outstandingAmount).toBe(1200);
    expect(created.status).toBe("open");
    expect(created.partyName).toBe("Grupo IESA/Nissan");
    expect(created.categoryName).toBe("Lavação");
    expect(created.costCenterName).toBe("Estética Automotiva");
  });
});

describe("Edição de conta a receber", () => {
  it("atualiza a descrição e o valor, recalculando o saldo", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [] });
    const [created] = await repo.createAccountsReceivable(baseInput);

    const updated = await repo.updateAccountsReceivable({ id: created.id, description: "Parceria IESA — corrigido", expectedAmount: 1500 });

    expect(updated.description).toBe("Parceria IESA — corrigido");
    expect(updated.expectedAmount).toBe(1500);
    expect(updated.outstandingAmount).toBe(1500);
  });
});

describe("Parcelamento", () => {
  it("receita parcelada em 4x cria 4 contas vinculadas pelo mesmo installmentGroupId", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [] });
    const created = await repo.createAccountsReceivable({ ...baseInput, description: "Estacionamento avulso — 4x Stone", expectedAmount: 1200, installmentTotal: 4 });

    expect(created).toHaveLength(4);
    const groupId = created[0].installmentGroupId;
    expect(groupId).not.toBeNull();
    expect(created.every((c) => c.installmentGroupId === groupId)).toBe(true);
    expect(created.map((c) => c.installmentNumber)).toEqual([1, 2, 3, 4]);
    expect(created.map((c) => c.installmentTotal)).toEqual([4, 4, 4, 4]);

    const total = created.reduce((sum, c) => sum + c.expectedAmount, 0);
    expect(Math.round(total * 100) / 100).toBe(1200);
  });
});

describe("Recebimento parcial e total, com taxa", () => {
  it("recebimento parcial reduz o saldo e muda o status para partially_paid", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [] });
    const [created] = await repo.createAccountsReceivable(baseInput);

    const updated = await repo.recordReceivablePayment({ accountsReceivableId: created.id, amount: 500, paidAt: "2026-08-05", method: "pix" });

    expect(updated.receivedAmount).toBe(500);
    expect(updated.outstandingAmount).toBe(700);
    expect(toAccountsReceivableView(updated, "2026-08-05").computedStatus).toBe("partially_paid");
  });

  it("recebimento total com taxa Stone calcula o valor líquido corretamente", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [] });
    const [created] = await repo.createAccountsReceivable(baseInput);

    const updated = await repo.recordReceivablePayment({
      accountsReceivableId: created.id,
      amount: 1200,
      paidAt: "2026-08-10",
      method: "credito",
      feeAmount: 36,
    });

    expect(updated.outstandingAmount).toBe(0);
    expect(updated.feeAmount).toBe(36);
    expect(updated.netAmount).toBe(1164);
    expect(toAccountsReceivableView(updated, "2026-08-10").computedStatus).toBe("paid");
  });

  it("sem taxa informada, valor líquido é igual ao valor recebido", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [] });
    const [created] = await repo.createAccountsReceivable(baseInput);

    const updated = await repo.recordReceivablePayment({ accountsReceivableId: created.id, amount: 1200, paidAt: "2026-08-10", method: "dinheiro" });

    expect(updated.netAmount).toBe(1200);
    expect(updated.feeAmount).toBeNull();
  });
});

describe("Impedimento de recebimento acima do saldo", () => {
  it("lança ReceivableOverpaymentError quando o valor excede o saldo sem confirmação", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [] });
    const [created] = await repo.createAccountsReceivable(baseInput);

    await expect(
      repo.recordReceivablePayment({ accountsReceivableId: created.id, amount: 9999, paidAt: "2026-08-05", method: "pix" }),
    ).rejects.toThrow(/excede o saldo/);
  });

  it("permite recebimento acima do saldo quando allowOverpayment é confirmado explicitamente", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [] });
    const [created] = await repo.createAccountsReceivable(baseInput);

    const updated = await repo.recordReceivablePayment({
      accountsReceivableId: created.id,
      amount: 1500,
      paidAt: "2026-08-05",
      method: "pix",
      allowOverpayment: true,
    });
    expect(updated.receivedAmount).toBe(1500);
  });
});

describe("Estorno de recebimento", () => {
  it("restaura o saldo e marca a conta como status manual 'reversed' (estornado)", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [] });
    const [created] = await repo.createAccountsReceivable(baseInput);

    await repo.recordReceivablePayment({ accountsReceivableId: created.id, amount: 1200, paidAt: "2026-08-10", method: "pix" });
    const [settlement] = await repo.listReceivableSettlements(created.id);
    expect(settlement.reversed).toBe(false);

    const reverted = await repo.reverseReceivableSettlement(settlement.id);

    expect(reverted.receivedAmount).toBe(0);
    expect(reverted.outstandingAmount).toBe(1200);
    expect(reverted.status).toBe("reversed");
    expect(toAccountsReceivableView(reverted, "2026-08-11").computedStatus).toBe("reversed");

    const [settlementAfter] = await repo.listReceivableSettlements(created.id);
    expect(settlementAfter.reversed).toBe(true);
  });

  it("não permite estornar o mesmo recebimento duas vezes", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [] });
    const [created] = await repo.createAccountsReceivable(baseInput);
    await repo.recordReceivablePayment({ accountsReceivableId: created.id, amount: 1200, paidAt: "2026-08-10", method: "pix" });
    const [settlement] = await repo.listReceivableSettlements(created.id);

    await repo.reverseReceivableSettlement(settlement.id);
    await expect(repo.reverseReceivableSettlement(settlement.id)).rejects.toThrow(/já foi estornado/);
  });
});

describe("Cancelamento", () => {
  it("marca a conta como cancelada sem apagar o registro", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [] });
    const [created] = await repo.createAccountsReceivable(baseInput);

    const cancelled = await repo.cancelAccountsReceivable(created.id);
    expect(cancelled.status).toBe("cancelled");

    const stillThere = await repo.getAccountsReceivable(created.id);
    expect(stillThere).not.toBeNull();
  });
});

describe("Exclusão definitiva", () => {
  it("permite excluir quando não há recebimentos registrados", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [] });
    const [created] = await repo.createAccountsReceivable(baseInput);

    await repo.deleteAccountsReceivable(created.id);
    expect(await repo.getAccountsReceivable(created.id)).toBeNull();
  });

  it("impede excluir quando já existe recebimento — mesmo estornado — preferindo cancelar", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [] });
    const [created] = await repo.createAccountsReceivable(baseInput);
    await repo.recordReceivablePayment({ accountsReceivableId: created.id, amount: 500, paidAt: "2026-08-05", method: "pix" });

    await expect(repo.deleteAccountsReceivable(created.id)).rejects.toThrow(/Use cancelar/);
  });
});

describe("Auditoria", () => {
  it("registra create, receive e reverse_payment no log de auditoria", async () => {
    const repo = new StaticFinanceRepository({ accountsReceivable: [] });
    const [created] = await repo.createAccountsReceivable(baseInput);
    await repo.recordReceivablePayment({ accountsReceivableId: created.id, amount: 1200, paidAt: "2026-08-10", method: "pix" });
    const [settlement] = await repo.listReceivableSettlements(created.id);
    await repo.reverseReceivableSettlement(settlement.id);

    const log = await repo.listAuditLog("accounts_receivable", created.id);
    expect(log.map((entry) => entry.action)).toEqual(["create", "receive", "reverse_payment"]);
  });
});
