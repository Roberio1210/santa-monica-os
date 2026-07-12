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
});

describe("Saldo informado", () => {
  it("grava o saldo conferido manualmente e mantém o saldo calculado inalterado", async () => {
    const repo = new StaticFinanceRepository({});

    const updated = await repo.informAccountBalance({ financialAccountId: "conta-caixa-fisico", informedBalance: 95 });

    expect(updated.informedBalance).toBe(95);
    expect(updated.currentBalance).toBe(100); // saldo calculado nunca muda por uma conferência manual
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
