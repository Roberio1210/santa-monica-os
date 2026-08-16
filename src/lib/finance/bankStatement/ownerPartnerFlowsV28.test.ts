import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmBankStatementImport } from "@/lib/finance/bankStatement/importService";
import { confirmGroup } from "@/lib/finance/bankStatement/batchActionsService";
import { getBankStatementRepository, resetBankStatementRepositoryForTests } from "@/lib/finance/bankStatement/repository-factory";
import { getFinanceRepository, resetFinanceRepositoryForTests } from "@/lib/finance/repository-factory";
import { resolveClassification } from "@/lib/finance/dre";

/**
 * Missão Financeiro V2.8 — fecha o último Pareto gerencial materialmente relevante: RF Food
 * (repasse de vendas de terceiro processadas pela Stone, nunca faturamento/despesa), TES Training
 * (devoluções de empréstimo consolidadas), Imóveis Mota (aluguel com multa), Kaua (folha CLT com
 * competência ≠ pagamento), IESA/Nissan (receita real conciliada sem duplicidade), e demais
 * despesas operacionais (Valcir, CELESC, Yanagawa, Sicoob, Angeloni).
 */
const STONE_ACCOUNT_ID = "conta-stone";

async function seed(csv: string) {
  await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });
  return getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
}

beforeEach(() => {
  resetBankStatementRepositoryForTests();
  resetFinanceRepositoryForTests();
});
afterEach(() => {
  resetBankStatementRepositoryForTests();
  resetFinanceRepositoryForTests();
});

describe("RF Food — repasse de terceiro processado pela Stone", () => {
  it("nunca despesa operacional, nunca faturamento; fora do DRE", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-01-18,IMOVEIS MOTA LTDA / Pagamento / RF FOOD COMERCIO DE ALIMENTOS,"4971,00",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", performedBy: "Gestor", notes: "REPASSE DE VALORES DE TERCEIRO — RF Food, vendas processadas pela Stone." }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 4971)!;
    expect(movement.categoryId).toBeNull();
    expect(movement.nature).not.toBe("despesa");

    const dre = resolveClassification({ description: movement.description, categoryName: null, supplierId: null, partnerId: null }, undefined, []);
    expect(dre.includeInDre).toBe(false);
  });

  it("venda RF Food via Stone não compõe faturamento operacional da estética (nunca nature=receita)", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-02-06,RF FOOD COMERCIO DE / Transferência | Pix,"2068,82",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.amount === 2068.82)!.nature).not.toBe("receita");
  });
});

describe("TES Training — visão consolidada das devoluções de empréstimo", () => {
  it("todas as 5 devoluções confirmadas (2 anteriores + 3 novas) ficam fora do DRE", async () => {
    const lines = await seed(
      [
        "data,descricao,valor,tipo",
        '2026-03-02,Transferência | Pix / TES TRAINING LTDA,"450,00",saida',
        '2026-03-06,Transferência | Pix / TES TRAINING LTDA,"2550,00",saida',
        '2026-03-11,S.A. / S.A. / Pagamento / TES TRAINING LTDA,"2355,45",saida',
        '2026-04-07,PEDRO / Transferência | Pix / TES TRAINING LTDA,"2700,39",saida',
        '2026-04-15,SEGURO SAUDE / SEGURO SAUDE / Pagamento / TES TRAINING LTDA,"2243,10",saida',
      ].join("\n"),
    );
    for (const line of lines) {
      await confirmGroup({ lineIds: [line.id], resultingType: "pagamento", performedBy: "Gestor", notes: "DEVOLUÇÃO DE EMPRÉSTIMO DE PARTE RELACIONADA — TES Training." }, STONE_ACCOUNT_ID);
    }
    const movements = await getFinanceRepository().listCashMovements();
    const tesAmounts = [450, 2550, 2355.45, 2700.39, 2243.1];
    const tesMovements = movements.filter((m) => tesAmounts.includes(m.amount));
    expect(tesMovements).toHaveLength(5);
    expect(tesMovements.reduce((s, m) => s + m.amount, 0)).toBeCloseTo(10298.94, 2);
    expect(tesMovements.every((m) => m.nature !== "despesa" && m.categoryId === null)).toBe(true);
  });

  it("decisão humana explícita sobrepõe regra automática (Seguro Saúde) quando o gestor confirma outra natureza", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-04-15,SEGURO SAUDE / SEGURO SAUDE / Pagamento / TES TRAINING LTDA,"2243,10",saida'].join("\n"));
    // sem createRule — confirmação pontual, nunca generaliza a regra Seguro Saúde para TES
    const result = await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", performedBy: "Gestor", notes: "TES Training, confirmado pelo gestor — sobrepõe regra Seguro Saúde." }, STONE_ACCOUNT_ID);
    expect(result.createdRuleId).toBeNull();
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.amount === 2243.1)!.categoryId).toBeNull();
  });
});

describe("Imóveis Mota — aluguel com multa por atraso", () => {
  it("classificado como aluguel mesmo com contaminação de Facebook; nunca Meta Ads", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-06-28,IMOVEIS MOTA LTDA / Pagamento / FACEBOOK SERVICOS ONLINE DO,"5260,03",saida'].join("\n"));
    await confirmGroup(
      { lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-aluguel", performedBy: "Gestor", notes: "Aluguel com multa/encargo por atraso, sem decomposição confiável." },
      STONE_ACCOUNT_ID,
    );
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 5260.03)!;
    expect(movement.categoryId).toBe("despesa-aluguel");
    expect(movement.categoryId).not.toBe("despesa-marketing");
  });
});

describe("Kaua — folha CLT, competência abril / pagamento maio", () => {
  it("classificado como Salários CLT, competência registrada em notes, sem duplicar folha inexistente", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-05-07,PEDRO / Transferência | Pix / Mensalidade,"2685,02",saida'].join("\n"));
    await confirmGroup(
      { lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-salarios-clt", performedBy: "Gestor", notes: "Competência 04/2026, pago 07/05/2026. Sem registro de RH/folha para conciliar." },
      STONE_ACCOUNT_ID,
    );
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 2685.02)!;
    expect(movement.categoryId).toBe("despesa-salarios-clt");
    expect(movement.notes).toContain("04/2026");
  });
});

describe("IESA/Nissan — receita operacional real, sem duplicidade", () => {
  it("classificada como receita (categoria Lavação), vinculada ao parceiro; nunca Meta Ads pela contaminação Facebook", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-04-10,DUT / Transferência | Pix / FACEBOOK SERVICOS ONLINE DO,"2680,00",entrada'].join("\n"));
    await confirmGroup(
      { lineIds: [lines[0].id], resultingType: "pix_recebido", categoryId: "receita-lavacao", partnerId: "partner-iesa", performedBy: "Gestor", notes: "Lavações Nissan/Grupo IESA, Ruah Veículos Ltda." },
      STONE_ACCOUNT_ID,
    );
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 2680)!;
    expect(movement.categoryId).toBe("receita-lavacao");
    expect(movement.partnerId).toBe("partner-iesa");

    const dre = resolveClassification({ description: movement.description, categoryName: "Lavação", supplierId: null, partnerId: "partner-iesa" }, undefined, []);
    expect(dre.includeInDre).toBe(true);
    expect(dre.dreLine).toBe("receita_bruta");
  });

  it("recebimento de cliente conciliado não conta duas vezes: nenhuma accounts_receivable nova é criada pela classificação do extrato", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-04-10,DUT / Transferência | Pix / FACEBOOK SERVICOS ONLINE DO,"2680,00",entrada'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pix_recebido", categoryId: "receita-lavacao", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    const receivables = await getFinanceRepository().listAccountsReceivable();
    expect(receivables.some((r) => r.description.includes("2680"))).toBe(false);
  });
});

describe("Valcir Adolpho Bento -> manutenção/infraestrutura", () => {
  it("classificado como prestador de serviços técnicos, nunca funcionário", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-05-05,Transferência | Pix / VALCIR ADOLPHO BENTO,"2020,00",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-manutencao", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.amount === 2020)!.categoryId).toBe("despesa-manutencao");
  });
});

describe("Companhia Catarinense = CELESC -> energia elétrica (correção expressa)", () => {
  it("nunca classificado como CASAN/água", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-02-23,Transferência | Pix / COMPANHIA CATARINENSE DE,"1252,60",saida'].join("\n"));
    await confirmGroup(
      { lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-energia", supplierId: "sup-celesc", performedBy: "Gestor", notes: "Correção expressa: NÃO é CASAN, é CELESC." },
      STONE_ACCOUNT_ID,
    );
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 1252.6)!;
    expect(movement.categoryId).toBe("despesa-energia");
    expect(movement.categoryId).not.toBe("despesa-agua");
  });
});

describe("Sicoob -> pagamento de financiamento, nunca despesa operacional", () => {
  it("categoria Empréstimos e financiamentos mapeia para resultado financeiro, não despesas operacionais", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-04-13,Transferência | Pix / BANCO COOPERATIVO SICOOB / BANCO COOPERATIVO SICOOB,"650,00",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-emprestimos-e-financiamentos", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 650)!;
    expect(movement.categoryId).toBe("despesa-emprestimos-e-financiamentos");

    const dre = resolveClassification({ description: movement.description, categoryName: "Empréstimos e financiamentos", supplierId: null, partnerId: null }, undefined, []);
    expect(dre.dreLine).toBe("resultado_financeiro");
    expect(dre.dreLine).not.toBe("despesas_operacionais");
  });
});

describe("Angeloni -> despesa operacional genérica, sem inventar composição", () => {
  it("classificado sem especificar item não identificado pelo gestor", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-05-31,A. ANGELONI & CIA. LTDA / Transferência | Pix,"613,47",saida'].join("\n"));
    await confirmGroup(
      { lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-outras-despesas", performedBy: "Gestor", notes: "Compra para uso da empresa; composição dos itens não identificada pelo gestor." },
      STONE_ACCOUNT_ID,
    );
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 613.47)!;
    expect(movement.notes).toContain("não identificada");
  });
});

describe("integridade e idempotência", () => {
  it("nenhuma das classificações desta missão duplica movimento", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-01-18,IMOVEIS MOTA LTDA / Pagamento / RF FOOD COMERCIO DE ALIMENTOS,"4971,00",saida'].join("\n"));
    const first = await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    expect(first.processedLineIds).toHaveLength(1);
    const second = await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    expect(second.processedLineIds).toHaveLength(0);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.filter((m) => m.amount === 4971)).toHaveLength(1);
  });
});
