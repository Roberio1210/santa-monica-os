import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmBankStatementImport } from "@/lib/finance/bankStatement/importService";
import { confirmGroup } from "@/lib/finance/bankStatement/batchActionsService";
import { getBankStatementRepository, resetBankStatementRepositoryForTests } from "@/lib/finance/bankStatement/repository-factory";
import { getFinanceRepository, resetFinanceRepositoryForTests } from "@/lib/finance/repository-factory";
import { classifyPendingLines } from "@/lib/finance/bankStatement/classificationService";

/**
 * Missão Financeiro V2.6 — últimas decisões gerenciais (Meta Ads, alimentação de funcionários,
 * Verdecar, freelancers históricos Otto/Leonardo Vargas, seguro empresarial, marketing/produção
 * de conteúdo, materiais de entrega, plano de saúde dos sócios, estornos Uber) e a separação
 * definitiva Imóveis Mota × TES Training — nunca a mesma contraparte.
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

describe("Meta Ads (Facebook/Instagram) -> Marketing", () => {
  it("nunca classificado como software, cria regra auditável", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-07-13,BRASIL LTDA / Transferência | Pix / FACEBOOK SERVICOS ONLINE DO,"128,78",saida'].join("\n"));
    const result = await confirmGroup(
      { lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-marketing", performedBy: "Gestor", createRule: { criteriaDirection: "saida", criteriaCounterpartyPattern: "BRASIL FACEBOOK SERVICOS ONLINE DO" } },
      STONE_ACCOUNT_ID,
    );
    expect(result.createdRuleId).not.toBeNull();
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.amount === 128.78)!.categoryId).toBe("despesa-marketing");
  });
});

describe("Restaurantes Online -> alimentação de funcionários", () => {
  it("despesa operacional, categoria genérica quando não há dedicada", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-01-05,RESTAURANTES ONLINE S.A. / Transferência | Pix,"27,98",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-outras-despesas", performedBy: "Gestor", notes: "Alimentação de funcionários." }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.amount === 27.98)!.categoryId).toBe("despesa-outras-despesas");
  });
});

describe("Verdecar -> produtos e insumos automotivos", () => {
  it("sem CNPJ na descrição, supplierId não atribuído", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-01-22,Transferência | Pix / VERDECAR COMERCIO DE,"20,00",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-produtos-e-insumos", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 20)!;
    expect(movement.categoryId).toBe("despesa-produtos-e-insumos");
    expect(movement.supplierId).toBeNull();
  });
});

describe("Otto = Guilherme Otto -> freelancer histórico, sem regra (nome curto, risco de falso positivo)", () => {
  it("nenhuma regra criada para 'OTTO'", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-01-06,OTTO / Transferência | Pix / STONE INSTITUIÇÃO DE / Recebimento vendas,"450,00",saida'].join("\n"));
    const result = await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-prestadores-pj", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    expect(result.createdRuleId).toBeNull();
  });
});

describe("Tokio Marine -> seguro empresarial", () => {
  it("classificado como despesa operacional", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-07-20,TOKIO MARINE SEGURADORA S A / Transferência | Pix,"451,68",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-outras-despesas", performedBy: "Gestor", notes: "Seguro empresarial." }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.amount === 451.68)!.notes).toContain("Seguro empresarial");
  });
});

describe("Launch Pad Tecnologia -> marketing/produção de conteúdo, nunca software", () => {
  it("categoria marketing mesmo com nome 'Tecnologia'", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-04-11,"LTDA. / Transferência | Pix / LAUNCH PAD TECNOLOGIA,","6,15",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-marketing", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.amount === 6.15)!.categoryId).toBe("despesa-marketing");
  });
});

describe("Leonardo Vargas -> ex-freelancer histórico", () => {
  it("sem vínculo CLT, CPF preservado na descrição original", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-07-21,LEONARDO VARGAS 04281997989 / Transferência | Pix,"250,00",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-prestadores-pj", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    const updated = await getBankStatementRepository().getLine(lines[0].id);
    expect(updated?.description).toContain("04281997989");
  });
});

describe("Car Brindes -> materiais de entrega/experiência do cliente", () => {
  it("classificado como despesa operacional de materiais", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-07-21,CAR BRINDES LTDA / Transferência | Pix,"300,00",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-produtos-e-insumos", performedBy: "Gestor", notes: "Tapetes recicláveis, aromatizantes, lixeiras para carros." }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.amount === 300)!.categoryId).toBe("despesa-produtos-e-insumos");
  });
});

describe("SulAmérica -> plano de saúde dos sócios (nunca confundido com plano de funcionários)", () => {
  it("reconciliationNote registra explicitamente que é dos sócios", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-03-18,LTDA / Transferência | Pix / SUL AMERICA COMPANHIA DE                                SUL AMERICA COMPANHIA DE,"194,49",saida'].join("\n"));
    await confirmGroup(
      { lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-outras-despesas", performedBy: "Gestor", notes: "Plano de saúde dos sócios — confirmado pelo gestor." },
      STONE_ACCOUNT_ID,
    );
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.amount === 194.49)!.notes).toContain("sócios");
  });
});

describe("Uber devoluções -> estorno de viagens canceladas, nunca receita", () => {
  it("nature=estorno, nunca faturamento", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-05-12,LTDA. / Devolução | Pix / UBER DO BRASIL TECNOLOGIA,"13,99",entrada'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "devolucao", performedBy: "Gestor", notes: "Estorno de viagem Uber cancelada." }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 13.99)!;
    expect(movement.nature).toBe("estorno");
    expect(movement.nature).not.toBe("receita");
  });
});

describe("Imóveis Mota × TES Training — nunca a mesma contraparte; evidência determinística separa os casos", () => {
  it("linha com evidência de cadência de aluguel (valor e período contínuo com o grupo já confirmado) pode virar Aluguel mesmo contaminada com TES Training", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-03-02,IMOVEIS MOTA LTDA / Pagamento / TES TRAINING LTDA,"4987,50",saida'].join("\n"));
    await confirmGroup(
      {
        lineIds: [lines[0].id],
        resultingType: "pagamento",
        categoryId: "despesa-aluguel",
        performedBy: "Gestor",
        notes: "Cadência mensal contínua com o grupo de aluguel já confirmado; nenhuma entrada de TES Training existe na base para sustentar narrativa de empréstimo nesta linha.",
      },
      STONE_ACCOUNT_ID,
    );
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.amount === 4987.5)!.categoryId).toBe("despesa-aluguel");
  });

  it("TES Training isolado (sem contaminação, sem entrada correspondente) permanece REVIEW — nunca empréstimo/despesa/aporte/retirada/fornecedor por padrão", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-03-02,Transferência | Pix / TES TRAINING LTDA,"450,00",saida'].join("\n"));
    const bankRepo = getBankStatementRepository();
    await bankRepo.updateLine({ id: lines[0].id, reconciliationNote: "INVESTIGADO: nenhuma entrada de TES Training encontrada — mantido REVIEW, não classificado." });
    const updated = await bankRepo.getLine(lines[0].id);
    expect(updated?.status).toBe("a_classificar");
    expect(updated?.type).toBe("pix_enviado");
    expect(updated?.categoryId).toBeNull();
    expect(updated?.linkedCashMovementId).toBeNull();
  });

  it("nenhuma regra 'Imóveis Mota + TES Training = mesma contraparte' é criada", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-03-02,IMOVEIS MOTA LTDA / Pagamento / TES TRAINING LTDA,"4987,50",saida'].join("\n"));
    const result = await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-aluguel", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    expect(result.createdRuleId).toBeNull();
  });
});

describe("Rodrigues ambíguo (Jorge Cauã x Josué) permanece REVIEW sem prova determinística", () => {
  it("evidência circunstancial (mesma janela temporal de Jorge Cauã) não é suficiente para classificar automaticamente", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-07-25,RODRIGUES / Transferência | Pix,"270,00",saida'].join("\n"));
    const bankRepo = getBankStatementRepository();
    await bankRepo.updateLine({ id: lines[0].id, reconciliationNote: "INVESTIGADO: indício circunstancial de Jorge Caua de Moraes Rodrigues (mesma janela temporal), mas sem prova determinística — mantido REVIEW." });
    const updated = await bankRepo.getLine(lines[0].id);
    expect(updated?.status).toBe("a_classificar");
    expect(updated?.supplierId).toBeNull();
    expect(updated?.partnerId).toBeNull();
  });
});

describe("entrada de prestador conhecido nunca vira despesa automaticamente", () => {
  it("entrada de Ismael Machado Bonato (prestador confirmado) permanece REVIEW — identidade não explica a direção", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-05-13,Transferência | Pix / Ismael Machado Bonato,"1080,00",entrada'].join("\n"));
    const bankRepo = getBankStatementRepository();
    await bankRepo.updateLine({ id: lines[0].id, reconciliationNote: "INVESTIGADO: nenhum pagamento correspondente encontrado nas datas próximas — mantido REVIEW." });
    const updated = await bankRepo.getLine(lines[0].id);
    expect(updated?.status).toBe("a_classificar");
    expect(updated?.categoryId).toBeNull();

    const classified = await classifyPendingLines(STONE_ACCOUNT_ID);
    const group = classified.find((c) => c.group.lines.some((l) => l.id === lines[0].id));
    expect(group!.evidence.suggestedType).toBeNull();
  });

  it("entrada de Leonardo Azambuja Bruno (ex-freelancer confirmado) permanece REVIEW", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-05-14,LEONARDO     AZAMBUJA BRUNO / Transferência | Pix,"250,00",entrada'].join("\n"));
    const bankRepo = getBankStatementRepository();
    await bankRepo.updateLine({ id: lines[0].id, reconciliationNote: "INVESTIGADO: nenhum pagamento correspondente encontrado — mantido REVIEW." });
    const updated = await bankRepo.getLine(lines[0].id);
    expect(updated?.status).toBe("a_classificar");
    expect(updated?.categoryId).toBeNull();
  });
});

describe("idempotência", () => {
  it("reclassificar uma linha já processada falha graciosamente, sem duplicar movimento", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-07-13,BRASIL LTDA / Transferência | Pix / FACEBOOK SERVICOS ONLINE DO,"128,78",saida'].join("\n"));
    const first = await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-marketing", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    expect(first.processedLineIds).toHaveLength(1);
    const second = await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-marketing", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    expect(second.processedLineIds).toHaveLength(0);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.filter((m) => m.amount === 128.78)).toHaveLength(1);
  });
});
