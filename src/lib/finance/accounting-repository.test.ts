import { describe, expect, it } from "vitest";
import { StaticFinanceRepository } from "@/lib/finance/static-repository";

describe("Classificação manual", () => {
  it("classifica um lançamento e registra auditoria", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const [ap] = await repo.createAccountsPayable({
      description: "Aluguel",
      categoryId: "despesa-aluguel",
      competenceDate: "2026-07-01",
      dueDate: "2026-07-05",
      originalAmount: 4750,
    });

    const classification = await repo.classifyEntity({
      sourceKind: "accounts_payable",
      sourceId: ap.id,
      dreLine: "despesas_operacionais",
      nature: "despesa_operacional",
      classifiedBy: "Robério",
    });

    expect(classification.origin).toBe("manual");
    expect(classification.accountsPayableId).toBe(ap.id);

    const log = await repo.listAuditLog("financial_classification", classification.id);
    expect(log.map((e) => e.action)).toEqual(["create"]);
  });

  it("reclassificar o mesmo lançamento atualiza a linha existente (não cria duplicata)", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const [ap] = await repo.createAccountsPayable({
      description: "Aluguel",
      categoryId: "despesa-aluguel",
      competenceDate: "2026-07-01",
      dueDate: "2026-07-05",
      originalAmount: 4750,
    });

    await repo.classifyEntity({ sourceKind: "accounts_payable", sourceId: ap.id, dreLine: "despesas_operacionais", nature: "despesa_operacional" });
    await repo.classifyEntity({ sourceKind: "accounts_payable", sourceId: ap.id, dreLine: "custos_diretos", nature: "custo_direto" });

    const all = await repo.listFinancialClassifications();
    expect(all).toHaveLength(1);
    expect(all[0].dreLine).toBe("custos_diretos");

    const log = await repo.listAuditLog("financial_classification", all[0].id);
    expect(log.map((e) => e.action)).toEqual(["create", "update"]);
  });

  it("classificar com createRule também cria uma regra automática", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const [ap] = await repo.createAccountsPayable({
      description: "Aluguel",
      supplierId: "fornecedor-mota-imobiliaria",
      categoryId: "despesa-aluguel",
      competenceDate: "2026-07-01",
      dueDate: "2026-07-05",
      originalAmount: 4750,
    });

    await repo.classifyEntity({
      sourceKind: "accounts_payable",
      sourceId: ap.id,
      dreLine: "despesas_operacionais",
      nature: "despesa_operacional",
      createRule: { matchType: "fornecedor", supplierId: "fornecedor-mota-imobiliaria" },
    });

    const rules = await repo.listClassificationRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].matchType).toBe("fornecedor");
  });
});

describe("Regras de classificação", () => {
  it("cria e remove uma regra automática", async () => {
    const repo = new StaticFinanceRepository({});
    const rule = await repo.createClassificationRule({
      matchType: "categoria",
      categoryId: "despesa-energia",
      dreLine: "despesas_operacionais",
      nature: "despesa_operacional",
    });

    expect((await repo.listClassificationRules())).toHaveLength(1);

    await repo.deleteClassificationRule(rule.id);
    expect((await repo.listClassificationRules())).toHaveLength(0);
  });

  it("alteração de regra (remover + recriar) reflete na lista sem afetar classificações manuais já feitas", async () => {
    const repo = new StaticFinanceRepository({ accountsPayable: [] });
    const rule = await repo.createClassificationRule({
      matchType: "categoria",
      categoryId: "despesa-energia",
      dreLine: "despesas_operacionais",
      nature: "despesa_operacional",
    });

    const [ap] = await repo.createAccountsPayable({
      description: "Energia",
      categoryId: "despesa-energia",
      competenceDate: "2026-07-01",
      dueDate: "2026-07-05",
      originalAmount: 300,
    });
    await repo.classifyEntity({ sourceKind: "accounts_payable", sourceId: ap.id, dreLine: "custos_diretos", nature: "custo_direto" });

    await repo.deleteClassificationRule(rule.id);

    const classifications = await repo.listFinancialClassifications();
    expect(classifications).toHaveLength(1);
    expect(classifications[0].dreLine).toBe("custos_diretos"); // classificação manual não foi afetada pela remoção da regra
  });
});

describe("Rateio de despesas compartilhadas", () => {
  it("cria um rateio cuja soma dá exatamente 100%", async () => {
    const repo = new StaticFinanceRepository({});
    const rule = await repo.createAllocationRule({
      name: "Rateio administrativo",
      effectiveFrom: "2026-07-01",
      shares: [
        { costCenterId: "cc-estetica-automotiva", percentage: 60 },
        { costCenterId: "cc-estacionamento", percentage: 40 },
      ],
    });
    expect(rule.shares).toHaveLength(2);
    expect(rule.shares.reduce((sum, s) => sum + s.percentage, 0)).toBe(100);
  });

  it("bloqueia rateio cuja soma não seja 100%", async () => {
    const repo = new StaticFinanceRepository({});
    await expect(
      repo.createAllocationRule({
        name: "Rateio inválido",
        effectiveFrom: "2026-07-01",
        shares: [
          { costCenterId: "cc-estetica-automotiva", percentage: 60 },
          { costCenterId: "cc-estacionamento", percentage: 30 },
        ],
      }),
    ).rejects.toThrow(/100%/);
  });
});

describe("Fechamento de competência", () => {
  it("fecha uma competência registrando responsável e data", async () => {
    const repo = new StaticFinanceRepository({});
    const period = await repo.closeAccountingPeriod({ competenceMonth: "2026-07", closedBy: "Robério" });
    expect(period.status).toBe("fechado");
    expect(period.closedBy).toBe("Robério");
  });

  it("bloqueia fechar novamente uma competência já fechada — impede alteração silenciosa", async () => {
    const repo = new StaticFinanceRepository({});
    await repo.closeAccountingPeriod({ competenceMonth: "2026-07", closedBy: "Robério" });
    await expect(repo.closeAccountingPeriod({ competenceMonth: "2026-07", closedBy: "Robério" })).rejects.toThrow(/já está fechada/);
  });

  it("reabre uma competência fechada só com justificativa", async () => {
    const repo = new StaticFinanceRepository({});
    await repo.closeAccountingPeriod({ competenceMonth: "2026-07", closedBy: "Robério" });

    await expect(repo.reopenAccountingPeriod({ competenceMonth: "2026-07", reopenedBy: "Robério", reopenJustification: "" })).rejects.toThrow(/[Jj]ustificativa/);

    const reopened = await repo.reopenAccountingPeriod({ competenceMonth: "2026-07", reopenedBy: "Robério", reopenJustification: "Encontrado lançamento faltante" });
    expect(reopened.status).toBe("reaberto");
    expect(reopened.reopenJustification).toBe("Encontrado lançamento faltante");
  });

  it("não permite reabrir uma competência que nunca foi fechada", async () => {
    const repo = new StaticFinanceRepository({});
    await expect(repo.reopenAccountingPeriod({ competenceMonth: "2026-09", reopenedBy: "Robério", reopenJustification: "x" })).rejects.toThrow(/nunca foi fechada/);
  });

  it("histórico de fechar/reabrir fica registrado em audit_logs", async () => {
    const repo = new StaticFinanceRepository({});
    const closed = await repo.closeAccountingPeriod({ competenceMonth: "2026-07", closedBy: "Robério" });
    await repo.reopenAccountingPeriod({ competenceMonth: "2026-07", reopenedBy: "Robério", reopenJustification: "Correção" });

    const log = await repo.listAuditLog("accounting_period", closed.id);
    expect(log.map((e) => e.action)).toEqual(["close", "reopen"]);
  });
});
