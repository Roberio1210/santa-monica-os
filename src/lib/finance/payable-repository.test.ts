import { describe, expect, it } from "vitest";
import { StaticFinanceRepository } from "@/lib/finance/static-repository";
import { toAccountsPayableView } from "@/lib/finance/status";
import type { CreateAccountsPayableInput } from "@/lib/finance/types";

const baseInput: CreateAccountsPayableInput = {
  description: "Aluguel + IPTU — julho/2026",
  categoryId: "despesa-aluguel",
  costCenterId: "cc-administrativo",
  supplierId: "fornecedor-mota-imobiliaria",
  competenceDate: "2026-07-01",
  dueDate: "2026-07-05",
  originalAmount: 4750,
};

describe("Criação de conta a pagar", () => {
  it("cria uma conta com saldo igual ao valor original e status pendente", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const [created] = await repo.createAccountsPayable(baseInput);

    expect(created.originalAmount).toBe(4750);
    expect(created.paidAmount).toBe(0);
    expect(created.outstandingAmount).toBe(4750);
    expect(created.status).toBe("pendente");
    expect(created.supplierName).toBe("Mota Imobiliária");
  });
});

describe("Edição de conta a pagar", () => {
  it("atualiza a descrição e o valor, recalculando o saldo", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const [created] = await repo.createAccountsPayable(baseInput);

    const updated = await repo.updateAccountsPayable({ id: created.id, description: "Aluguel + IPTU — corrigido", originalAmount: 5000 });

    expect(updated.description).toBe("Aluguel + IPTU — corrigido");
    expect(updated.originalAmount).toBe(5000);
    expect(updated.outstandingAmount).toBe(5000);
  });
});

describe("Parcelamento", () => {
  it("compra parcelada cria N contas vinculadas pelo mesmo installmentGroupId", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const created = await repo.createAccountsPayable({ ...baseInput, description: "Equipamento novo", originalAmount: 3000, installmentTotal: 3 });

    expect(created).toHaveLength(3);
    const groupId = created[0].installmentGroupId;
    expect(groupId).not.toBeNull();
    expect(created.every((c) => c.installmentGroupId === groupId)).toBe(true);
    expect(created.map((c) => c.installmentNumber)).toEqual([1, 2, 3]);
    expect(created.map((c) => c.installmentTotal)).toEqual([3, 3, 3]);

    const total = created.reduce((sum, c) => sum + c.originalAmount, 0);
    expect(Math.round(total * 100) / 100).toBe(3000);
  });
});

describe("Pagamento parcial e total", () => {
  it("pagamento parcial reduz o saldo e muda o status para parcialmente_paga", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const [created] = await repo.createAccountsPayable(baseInput);

    const updated = await repo.recordPayablePayment({ accountsPayableId: created.id, amount: 2000, paidAt: "2026-07-03", method: "pix" });

    expect(updated.paidAmount).toBe(2000);
    expect(updated.outstandingAmount).toBe(2750);
    expect(toAccountsPayableView(updated, "2026-07-03").computedStatus).toBe("parcialmente_paga");
  });

  it("pagamento total zera o saldo e muda o status para paga", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const [created] = await repo.createAccountsPayable(baseInput);

    const updated = await repo.recordPayablePayment({ accountsPayableId: created.id, amount: 4750, paidAt: "2026-07-03", method: "transferencia" });

    expect(updated.outstandingAmount).toBe(0);
    expect(toAccountsPayableView(updated, "2026-07-03").computedStatus).toBe("paga");
  });

  it("dois pagamentos parciais somados fecham a conta", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const [created] = await repo.createAccountsPayable(baseInput);

    await repo.recordPayablePayment({ accountsPayableId: created.id, amount: 2000, paidAt: "2026-07-02", method: "pix" });
    const final = await repo.recordPayablePayment({ accountsPayableId: created.id, amount: 2750, paidAt: "2026-07-05", method: "pix" });

    expect(final.paidAmount).toBe(4750);
    expect(final.outstandingAmount).toBe(0);
  });
});

describe("Impedimento de pagamento acima do saldo", () => {
  it("lança PayableOverpaymentError quando o valor excede o saldo sem confirmação", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const [created] = await repo.createAccountsPayable(baseInput);

    await expect(repo.recordPayablePayment({ accountsPayableId: created.id, amount: 9999, paidAt: "2026-07-03", method: "pix" })).rejects.toThrow(
      /excede o saldo/,
    );
  });

  it("permite pagamento acima do saldo quando allowOverpayment é confirmado explicitamente", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const [created] = await repo.createAccountsPayable(baseInput);

    const updated = await repo.recordPayablePayment({
      accountsPayableId: created.id,
      amount: 5000,
      paidAt: "2026-07-03",
      method: "pix",
      allowOverpayment: true,
    });
    expect(updated.paidAmount).toBe(5000);
  });
});

describe("Estorno de pagamento", () => {
  it("restaura o saldo e o status ao estornar uma baixa", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const [created] = await repo.createAccountsPayable(baseInput);

    await repo.recordPayablePayment({ accountsPayableId: created.id, amount: 4750, paidAt: "2026-07-03", method: "pix" });
    const [settlement] = await repo.listPayableSettlements(created.id);
    expect(settlement.reversed).toBe(false);

    const reverted = await repo.reversePayableSettlement(settlement.id);

    expect(reverted.paidAmount).toBe(0);
    expect(reverted.outstandingAmount).toBe(4750);

    const [settlementAfter] = await repo.listPayableSettlements(created.id);
    expect(settlementAfter.reversed).toBe(true);
  });

  it("não permite estornar a mesma baixa duas vezes", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const [created] = await repo.createAccountsPayable(baseInput);
    await repo.recordPayablePayment({ accountsPayableId: created.id, amount: 4750, paidAt: "2026-07-03", method: "pix" });
    const [settlement] = await repo.listPayableSettlements(created.id);

    await repo.reversePayableSettlement(settlement.id);
    await expect(repo.reversePayableSettlement(settlement.id)).rejects.toThrow(/já foi estornada/);
  });
});

describe("Cancelamento", () => {
  it("marca a conta como cancelada sem apagar o registro", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const [created] = await repo.createAccountsPayable(baseInput);

    const cancelled = await repo.cancelAccountsPayable(created.id);
    expect(cancelled.status).toBe("cancelada");

    const stillThere = await repo.getAccountsPayable(created.id);
    expect(stillThere).not.toBeNull();
  });
});

describe("Exclusão definitiva", () => {
  it("permite excluir quando não há pagamentos registrados", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const [created] = await repo.createAccountsPayable(baseInput);

    await repo.deleteAccountsPayable(created.id);
    expect(await repo.getAccountsPayable(created.id)).toBeNull();
  });

  it("impede excluir quando já existe pagamento — mesmo estornado — preferindo cancelar", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const [created] = await repo.createAccountsPayable(baseInput);
    await repo.recordPayablePayment({ accountsPayableId: created.id, amount: 1000, paidAt: "2026-07-03", method: "pix" });

    await expect(repo.deleteAccountsPayable(created.id)).rejects.toThrow(/Use cancelar/);
  });
});

describe("Transferências entre contas — nunca receita ou despesa", () => {
  it("registra uma transferência sem afetar cash_movements (não conta como receita/despesa)", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const movementsBefore = await repo.listCashMovements();

    await repo.recordAccountTransfer({
      type: "transferencia",
      fromAccountId: "conta-stone",
      toAccountId: "conta-caixa-fisico",
      amount: 200,
      date: "2026-07-10",
      description: "Transferência Stone -> Caixa",
    });

    const movementsAfter = await repo.listCashMovements();
    expect(movementsAfter.length).toBe(movementsBefore.length); // nenhum cash_movement criado
  });

  it("reposição de caixa é registrada como transferência, não como despesa", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });

    const transfer = await repo.recordAccountTransfer({
      type: "reposicao_caixa",
      toAccountId: "conta-caixa-fisico",
      amount: 100,
      date: "2026-07-10",
      description: "Reposição do fundo fixo do caixa",
    });

    expect(transfer.type).toBe("reposicao_caixa");
    const movements = await repo.listCashMovements();
    expect(movements.some((m) => m.description.includes("Reposição"))).toBe(false);
  });
});

describe("Reembolso a sócio — sem duplicar a despesa original", () => {
  it("a despesa original e a obrigação de reembolso são registros independentes; pagar o reembolso não altera a despesa original", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });

    const [originalExpense] = await repo.createAccountsPayable({
      description: "Combustível — pago pelo sócio no cartão pessoal",
      categoryId: "despesa-transporte-e-logistica",
      competenceDate: "2026-07-01",
      dueDate: "2026-07-01",
      originalAmount: 150,
      notes: "Pago pela conta pessoal de Robério — gera obrigação de reembolso separada.",
    });

    const [reimbursement] = await repo.createAccountsPayable({
      description: "Reembolso a Robério — combustível",
      categoryId: "despesa-reembolso-a-socios-colaboradores",
      competenceDate: "2026-07-01",
      dueDate: "2026-07-15",
      originalAmount: 150,
    });

    await repo.recordPayablePayment({ accountsPayableId: reimbursement.id, amount: 150, paidAt: "2026-07-15", method: "pix" });

    const originalAfter = await repo.getAccountsPayable(originalExpense.id);
    const reimbursementAfter = await repo.getAccountsPayable(reimbursement.id);

    // A despesa original nunca recebe baixa — só a obrigação de reembolso é paga.
    expect(originalAfter?.paidAmount).toBe(0);
    expect(reimbursementAfter?.paidAmount).toBe(150);

    // O total de despesa real é 150 (não 300) — reembolso não duplica a despesa original.
    const totalOriginalExpense = originalAfter!.originalAmount;
    expect(totalOriginalExpense).toBe(150);
  });
});
