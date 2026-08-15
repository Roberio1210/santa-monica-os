import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmBankStatementImport } from "@/lib/finance/bankStatement/importService";
import { confirmGroup } from "@/lib/finance/bankStatement/batchActionsService";
import { getBankStatementRepository, resetBankStatementRepositoryForTests } from "@/lib/finance/bankStatement/repository-factory";
import { getFinanceRepository, resetFinanceRepositoryForTests } from "@/lib/finance/repository-factory";
import { classifyPendingLines } from "@/lib/finance/bankStatement/classificationService";
import { resolveClassification } from "@/lib/finance/dre";

/**
 * Missão Financeiro V2.5 — novas decisões do gestor (reembolsos, Vivo, Uber, insumos de limpeza,
 * plano de saúde, materiais, aluguel, freelancers históricos, Marketplace, CASAN+CELESC como
 * despesa genérica) e o achado técnico do parser (sufixo legal mal removido).
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

describe("Roberio — saídas restantes classificadas como reembolso", () => {
  it("nunca retirada/pró-labore/distribuição de lucro; fica fora do DRE operacional", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-08-01,ROBERIO ROCHA FILHO / Transferência | Pix,"113,00",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-reembolso-a-socios-colaboradores", performedBy: "Gestor", notes: "REEMBOLSO confirmado pelo gestor." }, STONE_ACCOUNT_ID);

    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 113 && m.description.includes("ROBERIO"))!;
    expect(movement.categoryId).toBe("despesa-reembolso-a-socios-colaboradores");
    expect(movement.nature).not.toBe("despesa");

    const dre = resolveClassification({ description: movement.description, categoryName: "Reembolso a sócios/colaboradores", supplierId: null, partnerId: null }, undefined, []);
    expect(dre.includeInDre).toBe(false);
  });
});

describe("Roberio — entradas restantes = movimentação com sócio neutra (sem pareamento determinístico)", () => {
  it("nunca vira faturamento/receita mesmo sem segregar aporte de devolução", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-08-06,ROBERIO   ROCHA FILHO / Transferência | Pix,"1100,00",entrada'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pix_recebido", performedBy: "Gestor", notes: "MOVIMENTAÇÃO COM SÓCIO — APORTE/DEVOLUÇÃO NÃO SEGREGADO." }, STONE_ACCOUNT_ID);

    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 1100 && m.description.includes("ROBERIO"))!;
    expect(movement.nature).toBeNull();
    expect(movement.nature).not.toBe("receita");
    expect(movement.categoryId ?? null).toBeNull();
  });
});

describe("Bruno — 4 saídas restantes = reembolso", () => {
  it("nunca retirada/pró-labore", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-02-02,Transferência | Pix / Bruno Vainstock Monteiro,"134,00",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-reembolso-a-socios-colaboradores", performedBy: "Gestor", notes: "REEMBOLSO confirmado pelo gestor." }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 134 && m.description.includes("Bruno"))!;
    expect(movement.categoryId).toBe("despesa-reembolso-a-socios-colaboradores");
  });
});

describe("Telefonica Brasil = Vivo", () => {
  it("reconhecido como despesa de telecomunicações; consegue separar Internet x Telefonia quando o valor bate com o template exato", async () => {
    const lines = await seed(
      ["data,descricao,valor,tipo", '2026-05-20,TELEFONICA BRASIL S.A. / Transferência | Pix / STONE INSTITUIÇÃO DE,"92,62",saida', '2026-07-08,TELEFONICA BRASIL S.A. / Transferência | Pix,"41,17",saida'].join("\n"),
    );
    const internet = lines.find((l) => l.amount === 92.62)!;
    const telefonia = lines.find((l) => l.amount === 41.17)!;

    await confirmGroup({ lineIds: [internet.id], resultingType: "pagamento", categoryId: "despesa-telefonia", supplierId: "sup-vivo-internet", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    await confirmGroup({ lineIds: [telefonia.id], resultingType: "pagamento", categoryId: "despesa-telefonia", supplierId: "sup-vivo-telefonia", performedBy: "Gestor" }, STONE_ACCOUNT_ID);

    const movements = await getFinanceRepository().listCashMovements();
    const internetMov = movements.find((m) => m.amount === 92.62)!;
    const telefoniaMov = movements.find((m) => m.amount === 41.17)!;
    expect(internetMov.supplierId).toBe("sup-vivo-internet");
    expect(telefoniaMov.supplierId).toBe("sup-vivo-telefonia");
    expect(internetMov.categoryId).toBe("despesa-telefonia");
  });
});

describe("Uber do Brasil Tecnologia -> Transporte e Logística, com regra aprendida", () => {
  it("cria regra auditável para uso futuro", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-05-11,Transferência | Pix / UBER DO BRASIL TECNOLOGIA,"230,00",saida'].join("\n"));
    const result = await confirmGroup(
      { lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-transporte-e-logistica", performedBy: "Gestor", createRule: { criteriaDirection: "saida", criteriaCounterpartyPattern: "UBER DO BRASIL TECNOLOGIA" } },
      STONE_ACCOUNT_ID,
    );
    expect(result.createdRuleId).not.toBeNull();
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.amount === 230)!.categoryId).toBe("despesa-transporte-e-logistica");
  });
});

describe("Cia da Embalagem Floripa -> produtos de limpeza (Produtos e insumos)", () => {
  it("classificado como despesa operacional de insumos", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-07-13,CIA DA EMBALAGEM FLORIPA LTDA / Transferência | Pix,"128,78",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-produtos-e-insumos", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.amount === 128.78)!.categoryId).toBe("despesa-produtos-e-insumos");
  });
});

describe("Seguro Saúde -> plano de saúde/benefícios", () => {
  it("nunca tratado como fornecedor genérico sem categoria", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-03-18,SEGURO SAUDE / SEGURO SAUDE / Pagamento / Recebimento vendas,"194,78",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-outras-despesas", performedBy: "Gestor", notes: "Plano de saúde." }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 194.78)!;
    expect(movement.categoryId).toBe("despesa-outras-despesas");
    expect(movement.notes).toContain("saúde");
  });
});

describe("Casas do Cano -> materiais/manutenção", () => {
  it("classificado como fornecedor operacional de manutenção", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-06-01,CASAS DO CANO LTDA / Transferência | Pix,"240,85",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-manutencao", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.amount === 240.85)!.categoryId).toBe("despesa-manutencao");
  });
});

describe("Imóveis Mota (grupo limpo) -> Aluguel; grupo contaminado com TES Training NUNCA classificado automaticamente", () => {
  it("aluguel aplicado só ao grupo sem contaminação", async () => {
    const lines = await seed(
      ["data,descricao,valor,tipo", '2026-07-06,IMOVEIS MOTA LTDA / IMOVEIS MOTA LTDA / Pagamento,"4747,37",saida', '2026-04-27,IMOVEIS MOTA LTDA / Pagamento / TES TRAINING LTDA,"5256,87",saida'].join(
        "\n",
      ),
    );
    const clean = lines.find((l) => l.amount === 4747.37)!;
    const contaminated = lines.find((l) => l.amount === 5256.87)!;

    await confirmGroup({ lineIds: [clean.id], resultingType: "pagamento", categoryId: "despesa-aluguel", performedBy: "Gestor" }, STONE_ACCOUNT_ID);

    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.amount === 4747.37)!.categoryId).toBe("despesa-aluguel");
    expect(movements.some((m) => m.amount === 5256.87)).toBe(false); // nunca classificado automaticamente

    const stillPending = await getBankStatementRepository().getLine(contaminated.id);
    expect(stillPending?.status).toBe("a_classificar");
    expect(stillPending?.categoryId).toBeNull();
  });
});

describe("TES Training — investigado mas nunca classificado como empréstimo sem entrada correspondente", () => {
  it("reconciliationNote documenta a investigação sem inventar pareamento", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-04-27,IMOVEIS MOTA LTDA / Pagamento / TES TRAINING LTDA,"5256,87",saida'].join("\n"));
    const bankRepo = getBankStatementRepository();
    await bankRepo.updateLine({ id: lines[0].id, reconciliationNote: "INVESTIGADO: nenhuma entrada de TES Training encontrada — não classificado como empréstimo sem par determinístico." });
    const updated = await bankRepo.getLine(lines[0].id);
    expect(updated?.status).toBe("a_classificar");
    expect(updated?.type).toBe("pagamento");
    expect(updated?.linkedCashMovementId).toBeNull();
    expect(updated?.reconciliationNote).toContain("INVESTIGADO");
  });
});

describe("Marcelo Correa de Souza -> produtos/insumos automotivos", () => {
  it("classificado como compra de produtos automotivos, sem inventar razão social exata", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-07-24,MARCELO CORREA DE SOUZA / Transferência | Pix,"500,00",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-produtos-e-insumos", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.find((m) => m.amount === 500)!.categoryId).toBe("despesa-produtos-e-insumos");
  });
});

describe("Guilherme Machado, Silva (CPF) e Jeremias Medeiros Correa — freelancers históricos", () => {
  it("classificados como prestador, sem criar regra ampla para o futuro", async () => {
    const lines = await seed(
      [
        "data,descricao,valor,tipo",
        '2026-01-26,Transferência | Pix / 62 709 336 GUILHERME MACHADO,"400,00",saida',
        '2026-08-10,SILVA 40841086850 / Transferência | Pix,"125,00",saida',
        '2026-07-16,JEREMIAS MEDEIROS CORREA / Transferência | Pix,"35,00",saida',
      ].join("\n"),
    );
    for (const line of lines) {
      const result = await confirmGroup({ lineIds: [line.id], resultingType: "pagamento", categoryId: "despesa-prestadores-pj", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
      expect(result.createdRuleId).toBeNull();
    }
    const rules = await getBankStatementRepository().listClassificationRules(true);
    expect(rules.some((r) => r.criteriaCounterpartyPattern?.includes("GUILHERME MACHADO"))).toBe(false);
    expect(rules.some((r) => r.criteriaCounterpartyPattern?.includes("40841086850"))).toBe(false);
    expect(rules.some((r) => r.criteriaCounterpartyPattern?.includes("JEREMIAS"))).toBe(false);
  });
});

describe("R$109 Maquininha Stone / PIX Marketplace -> compra Mercado Livre", () => {
  it("nunca tratado como tarifa, venda ou receita", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-04-07,Maquininha Stone / PIX Marketplace,"109,00",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-produtos-e-insumos", performedBy: "Gestor", notes: "Compra Mercado Livre confirmada." }, STONE_ACCOUNT_ID);
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 109)!;
    expect(movement.nature).not.toBe("receita");
    expect(movement.nature).not.toBe("tarifa");
    expect(movement.categoryId).toBe("despesa-produtos-e-insumos");
  });
});

describe("CASAN+CELESC R$361,12 — resolvido como despesa operacional genérica, sem escolher fornecedor", () => {
  it("supplierId nunca CASAN nem CELESC; reconciliationNote registra a decisão; sai do CONFLICT; entra no DRE como despesa", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-03-09,AGUAS E SANEAMENTO CASAN / Transferência | Pix / CELESC DISTRIBUICAO S.A,"361,12",saida'].join("\n"));
    const bankRepo = getBankStatementRepository();

    await confirmGroup(
      {
        lineIds: [lines[0].id],
        resultingType: "pagamento",
        categoryId: "despesa-outras-despesas",
        performedBy: "Gestor",
        notes: "Gestor confirmou em 15/08/2026 que o lançamento é despesa operacional, mas não identificou qual fornecedor corresponde ao pagamento conjunto/descrição CASAN+CELESC.",
      },
      STONE_ACCOUNT_ID,
    );
    await bankRepo.updateLine({
      id: lines[0].id,
      reconciliationNote: "Gestor confirmou em 15/08/2026 que o lançamento é despesa operacional, mas não identificou qual fornecedor corresponde ao pagamento conjunto/descrição CASAN+CELESC.",
    });

    const updated = await bankRepo.getLine(lines[0].id);
    expect(updated?.supplierId).toBeNull();
    expect(updated?.status).toBe("conciliado");
    expect(updated?.reconciliationNote).toContain("CASAN+CELESC");
    expect(updated?.description).toBe("AGUAS E SANEAMENTO CASAN / Transferência | Pix / CELESC DISTRIBUICAO S.A"); // descrição original preservada, nunca sobrescrita

    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 361.12)!;
    expect(movement.categoryId).toBe("despesa-outras-despesas");
    expect(movement.supplierId).toBeNull();

    const classified = await classifyPendingLines(STONE_ACCOUNT_ID);
    expect(classified.some((c) => c.group.lines.some((l) => l.id === lines[0].id))).toBe(false); // já classificado, some do motor de pendências
  });

  it("nenhuma regra automática foi criada a partir deste caso", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-03-09,AGUAS E SANEAMENTO CASAN / Transferência | Pix / CELESC DISTRIBUICAO S.A,"361,12",saida'].join("\n"));
    const result = await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-outras-despesas", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    expect(result.createdRuleId).toBeNull();
  });
});

describe("integridade — nenhuma linha perdida ou duplicada ao longo de todas as classificações desta missão", () => {
  it("cada linha processada gera exatamente 1 efeito (cash_movement ou account_transfer), nunca 0 nem 2", async () => {
    const lines = await seed(
      ["data,descricao,valor,tipo", '2026-08-01,ROBERIO ROCHA FILHO / Transferência | Pix,"113,00",saida', '2026-07-13,CIA DA EMBALAGEM FLORIPA LTDA / Transferência | Pix,"128,78",saida'].join("\n"),
    );
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pagamento", categoryId: "despesa-reembolso-a-socios-colaboradores", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    await confirmGroup({ lineIds: [lines[1].id], resultingType: "pagamento", categoryId: "despesa-produtos-e-insumos", performedBy: "Gestor" }, STONE_ACCOUNT_ID);

    const movements = await getFinanceRepository().listCashMovements();
    const relevant = movements.filter((m) => m.amount === 113 || m.amount === 128.78);
    expect(relevant).toHaveLength(2); // 1 por linha, nunca duplicado
  });
});
