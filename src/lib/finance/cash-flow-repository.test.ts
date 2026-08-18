import { describe, expect, it } from "vitest";
import { StaticFinanceRepository } from "@/lib/finance/static-repository";

describe("Lançamento manual de caixa", () => {
  it("cria um movimento e grava saldo anterior/posterior a partir do fundo fixo do caixa físico", async () => {
    const repo = new StaticFinanceRepository({ cashMovements: [] });

    const movement = await repo.createCashMovement({
      date: "2026-07-15",
      type: "saida",
      nature: "taxa_bancaria",
      amount: 20,
      description: "Taxa Stone do dia",
      financialAccountId: "conta-caixa-fisico",
    });

    expect(movement.balanceBefore).toBe(100); // fundo fixo do caixa físico
    expect(movement.balanceAfter).toBe(80);
    expect(movement.nature).toBe("taxa_bancaria");
    expect(movement.financialAccountName).toBe("Caixa físico");
  });

  it("uma entrada aumenta o saldo posterior em relação ao saldo anterior", async () => {
    const repo = new StaticFinanceRepository({ cashMovements: [] });

    const movement = await repo.createCashMovement({
      date: "2026-07-15",
      type: "entrada",
      amount: 50,
      description: "Aporte avulso registrado como entrada",
      financialAccountId: "conta-caixa-fisico",
    });

    expect(movement.balanceBefore).toBe(100);
    expect(movement.balanceAfter).toBe(150);
  });

  it("lançamentos sucessivos encadeiam o saldo (o segundo parte de onde o primeiro parou)", async () => {
    const repo = new StaticFinanceRepository({ cashMovements: [] });

    await repo.createCashMovement({ date: "2026-07-15", type: "saida", amount: 30, description: "Compra 1", financialAccountId: "conta-caixa-fisico" });
    const second = await repo.createCashMovement({ date: "2026-07-16", type: "saida", amount: 10, description: "Compra 2", financialAccountId: "conta-caixa-fisico" });

    expect(second.balanceBefore).toBe(70);
    expect(second.balanceAfter).toBe(60);
  });

  it("lança erro para conta financeira inexistente", async () => {
    const repo = new StaticFinanceRepository({ cashMovements: [] });
    await expect(
      repo.createCashMovement({ date: "2026-07-15", type: "entrada", amount: 10, description: "x", financialAccountId: "conta-inexistente" }),
    ).rejects.toThrow(/não encontrada/);
  });
});

describe("Transferências entre contas — aporte de sócios e retirada", () => {
  it("aporte de sócios (fromAccountId null) aumenta o saldo da conta de destino", async () => {
    const repo = new StaticFinanceRepository({ accountTransfers: [] });

    const transfer = await repo.recordAccountTransfer({
      type: "aporte_socios",
      toAccountId: "conta-caixa-fisico",
      amount: 500,
      date: "2026-07-15",
      description: "Aporte inicial dos sócios",
    });

    expect(transfer.fromAccountId).toBeNull();
    expect(transfer.toAccountName).toBe("Caixa físico");

    const accounts = await repo.listFinancialAccounts();
    const caixa = accounts.find((a) => a.id === "conta-caixa-fisico")!;
    expect(caixa.currentBalance).toBe(600); // 100 (fundo fixo) + 500 (aporte)
  });

  it("retirada (toAccountId null) reduz o saldo da conta de origem", async () => {
    const repo = new StaticFinanceRepository({ accountTransfers: [] });

    await repo.recordAccountTransfer({
      type: "retirada",
      fromAccountId: "conta-caixa-fisico",
      amount: 40,
      date: "2026-07-15",
      description: "Retirada de sócio",
    });

    const accounts = await repo.listFinancialAccounts();
    const caixa = accounts.find((a) => a.id === "conta-caixa-fisico")!;
    expect(caixa.currentBalance).toBe(60); // 100 - 40
  });

  it("transferência entre duas contas move o saldo de uma para a outra sem afetar o total", async () => {
    const repo = new StaticFinanceRepository({ accountTransfers: [] });

    await repo.recordAccountTransfer({
      type: "transferencia",
      fromAccountId: "conta-caixa-fisico",
      toAccountId: "conta-stone",
      amount: 50,
      date: "2026-07-15",
      description: "Transferência Caixa -> Stone",
    });

    const accounts = await repo.listFinancialAccounts();
    const caixa = accounts.find((a) => a.id === "conta-caixa-fisico")!;
    const stone = accounts.find((a) => a.id === "conta-stone")!;
    expect(caixa.currentBalance).toBe(50); // 100 - 50
    expect(stone.currentBalance).toBe(50); // 0 + 50
  });

  it("listAccountTransfers retorna as transferências registradas", async () => {
    const repo = new StaticFinanceRepository({ accountTransfers: [] });
    await repo.recordAccountTransfer({ type: "reposicao_caixa", toAccountId: "conta-caixa-fisico", amount: 20, date: "2026-07-15", description: "Reposição" });

    const all = await repo.listAccountTransfers();
    expect(all).toHaveLength(1);
    expect(all[0].type).toBe("reposicao_caixa");
  });

  it("empréstimo recebido (fromAccountId null) aumenta o saldo da conta de destino, igual a aporte — Missão V4.0", async () => {
    const repo = new StaticFinanceRepository({ accountTransfers: [] });

    const transfer = await repo.recordAccountTransfer({
      type: "emprestimo_recebido",
      toAccountId: "conta-caixa-fisico",
      amount: 900,
      date: "2026-08-11",
      description: "Empréstimo de sócio — Bruno Vainstock Monteiro",
    });

    expect(transfer.fromAccountId).toBeNull();
    expect(transfer.type).toBe("emprestimo_recebido");

    const accounts = await repo.listFinancialAccounts();
    const caixa = accounts.find((a) => a.id === "conta-caixa-fisico")!;
    expect(caixa.currentBalance).toBe(1000); // 100 (fundo fixo) + 900 (empréstimo)
  });

  it("devolução de empréstimo (toAccountId null) reduz o saldo da conta de origem, igual a retirada — Missão V4.0", async () => {
    const repo = new StaticFinanceRepository({ accountTransfers: [] });

    await repo.recordAccountTransfer({
      type: "emprestimo_devolvido",
      fromAccountId: "conta-caixa-fisico",
      amount: 30,
      date: "2026-08-15",
      description: "Devolução de empréstimo",
    });

    const accounts = await repo.listFinancialAccounts();
    const caixa = accounts.find((a) => a.id === "conta-caixa-fisico")!;
    expect(caixa.currentBalance).toBe(70); // 100 - 30
  });
});

describe("Saldo informado", () => {
  it("grava o saldo conferido manualmente e mantém o saldo calculado inalterado", async () => {
    const repo = new StaticFinanceRepository({});

    const updated = await repo.informAccountBalance({ financialAccountId: "conta-caixa-fisico", informedBalance: 95 });

    expect(updated.informedBalance).toBe(95);
    expect(updated.currentBalance).toBe(100); // saldo calculado nunca muda por uma conferência manual
  });
});

describe("linkCashMovementToReceivable — Missão Financeiro V4.2 (regularização IESA março/2026)", () => {
  it("vincula um cash_movement solto a uma accounts_receivable existente, sem criar nada novo", async () => {
    const repo = new StaticFinanceRepository({ cashMovements: [] });
    const movement = await repo.createCashMovement({ date: "2026-04-10", type: "entrada", amount: 2680, description: "Pix real", financialAccountId: "conta-caixa-fisico" });
    const [receivable] = await repo.createAccountsReceivable({
      description: "Parceria IESA/Nissan — fechamento 2026-03",
      competenceDate: "2026-03-01",
      dueDate: "2026-04-10",
      expectedAmount: 2680,
    });

    const linked = await repo.linkCashMovementToReceivable(movement.id, receivable.id);

    expect(linked.accountsReceivableId).toBe(receivable.id);
    const allMovements = await repo.listCashMovements();
    expect(allMovements).toHaveLength(1); // nenhum cash_movement novo foi criado
  });

  it("é idempotente: vincular ao mesmo AR de novo não lança erro", async () => {
    const repo = new StaticFinanceRepository({ cashMovements: [] });
    const movement = await repo.createCashMovement({ date: "2026-04-10", type: "entrada", amount: 2680, description: "Pix real", financialAccountId: "conta-caixa-fisico" });
    const [receivable] = await repo.createAccountsReceivable({ description: "x", competenceDate: "2026-03-01", dueDate: "2026-04-10", expectedAmount: 2680 });

    await repo.linkCashMovementToReceivable(movement.id, receivable.id);
    const secondLink = await repo.linkCashMovementToReceivable(movement.id, receivable.id);
    expect(secondLink.accountsReceivableId).toBe(receivable.id);
  });

  it("nunca revincula silenciosamente um movimento já ligado a OUTRA conta a receber", async () => {
    const repo = new StaticFinanceRepository({ cashMovements: [] });
    const movement = await repo.createCashMovement({ date: "2026-04-10", type: "entrada", amount: 2680, description: "Pix real", financialAccountId: "conta-caixa-fisico" });
    const [receivableA] = await repo.createAccountsReceivable({ description: "A", competenceDate: "2026-03-01", dueDate: "2026-04-10", expectedAmount: 2680 });
    const [receivableB] = await repo.createAccountsReceivable({ description: "B", competenceDate: "2026-04-01", dueDate: "2026-05-10", expectedAmount: 1360 });

    await repo.linkCashMovementToReceivable(movement.id, receivableA.id);
    await expect(repo.linkCashMovementToReceivable(movement.id, receivableB.id)).rejects.toThrow(/já está vinculado/);
  });

  it("lança erro para movimento ou conta a receber inexistentes", async () => {
    const repo = new StaticFinanceRepository({ cashMovements: [] });
    const [receivable] = await repo.createAccountsReceivable({ description: "x", competenceDate: "2026-03-01", dueDate: "2026-04-10", expectedAmount: 2680 });
    await expect(repo.linkCashMovementToReceivable("inexistente", receivable.id)).rejects.toThrow(/não encontrado/);

    const movement = await repo.createCashMovement({ date: "2026-04-10", type: "entrada", amount: 2680, description: "Pix real", financialAccountId: "conta-caixa-fisico" });
    await expect(repo.linkCashMovementToReceivable(movement.id, "inexistente")).rejects.toThrow(/não encontrada/);
  });

  it("registra 'link_to_receivable' no log de auditoria", async () => {
    const repo = new StaticFinanceRepository({ cashMovements: [] });
    const movement = await repo.createCashMovement({ date: "2026-04-10", type: "entrada", amount: 2680, description: "Pix real", financialAccountId: "conta-caixa-fisico" });
    const [receivable] = await repo.createAccountsReceivable({ description: "x", competenceDate: "2026-03-01", dueDate: "2026-04-10", expectedAmount: 2680 });

    await repo.linkCashMovementToReceivable(movement.id, receivable.id);

    const log = await repo.listAuditLog("cash_movement", movement.id);
    expect(log.map((e) => e.action)).toEqual(["create", "link_to_receivable"]);
  });
});

describe("linkCashMovementToPayable — Missão Financeiro V4.4 (compras já pagas via extrato)", () => {
  it("vincula um cash_movement solto a uma accounts_payable existente, sem criar nada novo", async () => {
    const repo = new StaticFinanceRepository({ cashMovements: [] });
    const movement = await repo.createCashMovement({ date: "2026-08-16", type: "saida", amount: 189.79, description: "Pix Mercado Livre", financialAccountId: "conta-caixa-fisico" });
    const [payable] = await repo.createAccountsPayable({ description: "Compra Mercado Livre", categoryId: "despesa-aluguel", competenceDate: "2026-08-16", dueDate: "2026-08-16", originalAmount: 189.79 });

    const linked = await repo.linkCashMovementToPayable(movement.id, payable.id);

    expect(linked.accountsPayableId).toBe(payable.id);
    const allMovements = await repo.listCashMovements();
    expect(allMovements).toHaveLength(1); // nenhum cash_movement novo foi criado
  });

  it("é idempotente: vincular ao mesmo AP de novo não lança erro", async () => {
    const repo = new StaticFinanceRepository({ cashMovements: [] });
    const movement = await repo.createCashMovement({ date: "2026-08-16", type: "saida", amount: 189.79, description: "Pix Mercado Livre", financialAccountId: "conta-caixa-fisico" });
    const [payable] = await repo.createAccountsPayable({ description: "x", categoryId: "despesa-aluguel", competenceDate: "2026-08-16", dueDate: "2026-08-16", originalAmount: 189.79 });

    await repo.linkCashMovementToPayable(movement.id, payable.id);
    const secondLink = await repo.linkCashMovementToPayable(movement.id, payable.id);
    expect(secondLink.accountsPayableId).toBe(payable.id);
  });

  it("nunca revincula silenciosamente um movimento já ligado a OUTRA conta a pagar", async () => {
    const repo = new StaticFinanceRepository({ cashMovements: [] });
    const movement = await repo.createCashMovement({ date: "2026-08-16", type: "saida", amount: 189.79, description: "Pix Mercado Livre", financialAccountId: "conta-caixa-fisico" });
    const [payableA] = await repo.createAccountsPayable({ description: "A", categoryId: "despesa-aluguel", competenceDate: "2026-08-16", dueDate: "2026-08-16", originalAmount: 189.79 });
    const [payableB] = await repo.createAccountsPayable({ description: "B", categoryId: "despesa-aluguel", competenceDate: "2026-08-17", dueDate: "2026-08-17", originalAmount: 59.9 });

    await repo.linkCashMovementToPayable(movement.id, payableA.id);
    await expect(repo.linkCashMovementToPayable(movement.id, payableB.id)).rejects.toThrow(/já está vinculado/);
  });

  it("lança erro para movimento ou conta a pagar inexistentes", async () => {
    const repo = new StaticFinanceRepository({ cashMovements: [] });
    const [payable] = await repo.createAccountsPayable({ description: "x", categoryId: "despesa-aluguel", competenceDate: "2026-08-16", dueDate: "2026-08-16", originalAmount: 189.79 });
    await expect(repo.linkCashMovementToPayable("inexistente", payable.id)).rejects.toThrow(/não encontrado/);

    const movement = await repo.createCashMovement({ date: "2026-08-16", type: "saida", amount: 189.79, description: "Pix Mercado Livre", financialAccountId: "conta-caixa-fisico" });
    await expect(repo.linkCashMovementToPayable(movement.id, "inexistente")).rejects.toThrow(/não encontrada/);
  });

  it("registra 'link_to_payable' no log de auditoria", async () => {
    const repo = new StaticFinanceRepository({ cashMovements: [] });
    const movement = await repo.createCashMovement({ date: "2026-08-16", type: "saida", amount: 189.79, description: "Pix Mercado Livre", financialAccountId: "conta-caixa-fisico" });
    const [payable] = await repo.createAccountsPayable({ description: "x", categoryId: "despesa-aluguel", competenceDate: "2026-08-16", dueDate: "2026-08-16", originalAmount: 189.79 });

    await repo.linkCashMovementToPayable(movement.id, payable.id);

    const log = await repo.listAuditLog("cash_movement", movement.id);
    expect(log.map((e) => e.action)).toEqual(["create", "link_to_payable"]);
  });

  it("combinado com recordPayablePayment sem financialAccountId, marca o AP como pago SEM criar cash_movement adicional", async () => {
    const repo = new StaticFinanceRepository({ cashMovements: [] });
    const movement = await repo.createCashMovement({ date: "2026-08-16", type: "saida", amount: 189.79, description: "Pix Mercado Livre", financialAccountId: "conta-caixa-fisico" });
    const [payable] = await repo.createAccountsPayable({ description: "Compra Mercado Livre", categoryId: "despesa-aluguel", competenceDate: "2026-08-16", dueDate: "2026-08-16", originalAmount: 189.79 });

    const paid = await repo.recordPayablePayment({ accountsPayableId: payable.id, amount: 189.79, paidAt: "2026-08-16", method: "pix" });
    await repo.linkCashMovementToPayable(movement.id, payable.id);

    expect(paid.status).toBe("paga");
    expect(paid.paidAmount).toBe(189.79);
    expect(paid.outstandingAmount).toBe(0);
    const allMovements = await repo.listCashMovements();
    expect(allMovements).toHaveLength(1); // recordPayablePayment sem financialAccountId nunca cria cash_movement
  });
});

describe("Auditoria do Fluxo de Caixa", () => {
  it("registra create para lançamento manual e inform_balance para conferência de saldo", async () => {
    const repo = new StaticFinanceRepository({ cashMovements: [] });
    const movement = await repo.createCashMovement({ date: "2026-07-15", type: "entrada", amount: 10, description: "x", financialAccountId: "conta-caixa-fisico" });
    await repo.informAccountBalance({ financialAccountId: "conta-caixa-fisico", informedBalance: 90 });

    const movementLog = await repo.listAuditLog("cash_movement", movement.id);
    expect(movementLog.map((e) => e.action)).toEqual(["create"]);

    const accountLog = await repo.listAuditLog("financial_account", "conta-caixa-fisico");
    expect(accountLog.map((e) => e.action)).toEqual(["inform_balance"]);
  });
});
