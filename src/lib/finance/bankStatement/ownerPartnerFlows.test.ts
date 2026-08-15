import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmBankStatementImport } from "@/lib/finance/bankStatement/importService";
import { confirmGroup } from "@/lib/finance/bankStatement/batchActionsService";
import { getBankStatementRepository, resetBankStatementRepositoryForTests } from "@/lib/finance/bankStatement/repository-factory";
import { getFinanceRepository, resetFinanceRepositoryForTests } from "@/lib/finance/repository-factory";
import { classifyPendingLines } from "@/lib/finance/bankStatement/classificationService";
import { resolveClassification, resolveTransferClassification } from "@/lib/finance/dre";

/**
 * Missão Financeiro V2.4 — fluxos de sócio/titular (aporte, empréstimo, reembolso, venda
 * particular via maquininha, transferência entre contas próprias) e freelancer histórico.
 * Regra fundamental testada em todo o arquivo: MOVIMENTAÇÃO FINANCEIRA ≠ FATURAMENTO — nenhum
 * desses fluxos pode aparecer como receita/despesa operacional, mas todos devem permanecer
 * reais e rastreáveis no fluxo de caixa/transferências.
 */
const STONE_ACCOUNT_ID = "conta-stone";
const AILOS_ACCOUNT_ID = "conta-ailos-credcrea";

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

describe("dois aportes iguais no mesmo dia (Roberio e Bruno) nunca são tratados como duplicidade", () => {
  it("preserva ambas as linhas, ambas viram aporte_socios, saldo afetado 2x", async () => {
    const lines = await seed(
      ["data,descricao,valor,tipo", '2026-03-02,Transferência | Pix / ROBERIO ROCHA FILHO,"834,00",entrada', '2026-03-02,Transferência | Pix / BRUNO VAINSTOCK MONTEIRO,"834,00",entrada'].join("\n"),
    );
    expect(lines).toHaveLength(2);
    expect(lines[0].id).not.toBe(lines[1].id);

    const roberio = lines.find((l) => l.description.includes("ROBERIO"))!;
    const bruno = lines.find((l) => l.description.includes("BRUNO"))!;

    await confirmGroup({ lineIds: [roberio.id], resultingType: "aporte", performedBy: "Gestor", notes: "Aporte de sócio — Roberio." }, STONE_ACCOUNT_ID);
    await confirmGroup({ lineIds: [bruno.id], resultingType: "aporte", performedBy: "Gestor", notes: "Aporte de sócio — Bruno." }, STONE_ACCOUNT_ID);

    const transfers = await getFinanceRepository().listAccountTransfers();
    expect(transfers).toHaveLength(2);
    expect(transfers.every((t) => t.type === "aporte_socios")).toBe(true);
    expect(transfers.reduce((s, t) => s + t.amount, 0)).toBe(1668); // 834 x 2, nunca deduplicado
  });
});

describe("aporte de sócio — Roberio e Bruno", () => {
  it("aporte nunca vira receita/faturamento — fica fora do DRE", async () => {
    const lines = await seed(['data,descricao,valor,tipo', "2026-03-06,Transferência | Pix / ROBERIO ROCHA FILHO,\"1450,00\",entrada"].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "aporte", performedBy: "Gestor" }, STONE_ACCOUNT_ID);

    const transfers = await getFinanceRepository().listAccountTransfers();
    expect(transfers).toHaveLength(1);
    expect(transfers[0].type).toBe("aporte_socios");
    expect(transfers[0].fromAccountId).toBeNull(); // aporte externo — dinheiro entrando pela primeira vez

    const dre = resolveTransferClassification("aporte_socios");
    expect(dre.includeInDre).toBe(false);
    expect(dre.dreLine).toBe("fora_dre");

    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.some((m) => m.description.includes("ROBERIO"))).toBe(false); // aporte é account_transfer, nunca cash_movement
  });
});

describe("empréstimo de sócio — Bruno R$900 (a devolver)", () => {
  it("nunca é receita; nature fica null; fora do DRE", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-08-11,BRUNO VAINSTOCK MONTEIRO / Transferência | Pix,"900,00",entrada'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "pix_recebido", performedBy: "Gestor", notes: "EMPRÉSTIMO DE SÓCIO — Bruno — a devolver." }, STONE_ACCOUNT_ID);

    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 900 && m.description.includes("BRUNO"))!;
    expect(movement).toBeDefined();
    expect(movement.nature).not.toBe("receita");
    expect(movement.nature).toBeNull();
    expect(movement.categoryId ?? null).toBeNull();

    const dre = resolveClassification({ description: movement.description, categoryName: null, supplierId: null, partnerId: null }, undefined, []);
    expect(dre.includeInDre).toBe(false);
  });
});

describe("RF Base Participações — empréstimo/adiantamento e devolução (holding do titular)", () => {
  it("entrada nunca é receita; devolução nunca é despesa operacional", async () => {
    const lines = await seed(
      ["data,descricao,valor,tipo", '2026-07-16,RF BASE PARTICIPACOES LTDA / Transferência | Pix,"2000,00",entrada', '2026-07-26,RF BASE PARTICIPACOES LTDA / Transferência | Pix,"2000,00",saida'].join(
        "\n",
      ),
    );
    const entrada = lines.find((l) => l.direction === "entrada")!;
    const devolucao = lines.find((l) => l.direction === "saida")!;

    await confirmGroup({ lineIds: [entrada.id], resultingType: "pix_recebido", performedBy: "Gestor", notes: "EMPRÉSTIMO/ADIANTAMENTO — RF Base." }, STONE_ACCOUNT_ID);
    await confirmGroup({ lineIds: [devolucao.id], resultingType: "pix_enviado", performedBy: "Gestor", notes: "DEVOLUÇÃO DE EMPRÉSTIMO — RF Base." }, STONE_ACCOUNT_ID);

    const movements = await getFinanceRepository().listCashMovements();
    const rfBaseMovements = movements.filter((m) => m.description.includes("RF BASE"));
    expect(rfBaseMovements).toHaveLength(2);
    expect(rfBaseMovements.every((m) => m.nature !== "receita" && m.nature !== "despesa")).toBe(true);
    expect(rfBaseMovements.every((m) => m.nature === null)).toBe(true);
  });
});

describe("transferência entre contas próprias — Stone ↔ Ailos/CredCrea (R.B.E Estacionamento)", () => {
  it("zero impacto em receita/despesa/DRE, preserva saldo nas duas contas", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-06-17,R.B.E ESTACIONAMENTO LTDA / Transferência | Pix,"1000,00",saida'].join("\n"));
    await confirmGroup({ lineIds: [lines[0].id], resultingType: "transferencia_saida", counterAccountId: AILOS_ACCOUNT_ID, performedBy: "Gestor", notes: "Transferência própria Stone -> Ailos/CredCrea." }, STONE_ACCOUNT_ID);

    const transfers = await getFinanceRepository().listAccountTransfers();
    expect(transfers).toHaveLength(1);
    expect(transfers[0].type).toBe("transferencia");
    expect(transfers[0].fromAccountId).toBe(STONE_ACCOUNT_ID);
    expect(transfers[0].toAccountId).toBe(AILOS_ACCOUNT_ID);

    const dre = resolveTransferClassification("transferencia");
    expect(dre.includeInDre).toBe(false);

    const movements = await getFinanceRepository().listCashMovements();
    expect(movements.some((m) => m.description.includes("R.B.E"))).toBe(false); // transferência nunca vira cash_movement
  });
});

describe("reembolso a sócio — piso modular comprado no cartão pessoal de Bruno", () => {
  it("nunca é retirada de sócio, pró-labore ou distribuição de lucro", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-06-02,BRUNO VAINSTOCK MONTEIRO / Transferência | Pix,"320,00",saida'].join("\n"));
    const REEMBOLSO_SOCIOS_CATEGORY = "despesa-reembolso-a-socios-colaboradores";
    await confirmGroup(
      { lineIds: [lines[0].id], resultingType: "pagamento", categoryId: REEMBOLSO_SOCIOS_CATEGORY, performedBy: "Gestor", notes: "REEMBOLSO — piso modular comprado no cartão pessoal de Bruno." },
      STONE_ACCOUNT_ID,
    );
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 320 && m.description.includes("BRUNO"))!;
    expect(movement.categoryId).toBe(REEMBOLSO_SOCIOS_CATEGORY);
    expect(movement.nature).toBeNull(); // nunca "despesa" — categoria já carrega a natureza fora_dre

    const dre = resolveClassification({ description: movement.description, categoryName: "Reembolso a sócios/colaboradores", supplierId: null, partnerId: null }, undefined, []);
    expect(dre.includeInDre).toBe(false);
    expect(dre.dreLine).toBe("fora_dre");
  });
});

describe("acerto/repasse R$679 — aparelho financiado por Bruno, pago por Ismael", () => {
  it("nunca vira retirada de sócio, pró-labore ou pagamento a fornecedor comum", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-05-18,Bruno Vainstock Monteiro / Transferência | Pix,"679,00",saida'].join("\n"));
    const REEMBOLSO_SOCIOS_CATEGORY = "despesa-reembolso-a-socios-colaboradores";
    await confirmGroup(
      { lineIds: [lines[0].id], resultingType: "pagamento", categoryId: REEMBOLSO_SOCIOS_CATEGORY, performedBy: "Gestor", notes: "ACERTO — aparelho financiado por Bruno, pago parceladamente por Ismael." },
      STONE_ACCOUNT_ID,
    );
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 679 && m.description.includes("Bruno"))!;
    expect(movement.nature).not.toBe("despesa");
    expect(movement.categoryId).toBe(REEMBOLSO_SOCIOS_CATEGORY);
    expect(movement.notes).toContain("Ismael");
  });
});

describe("Bruno R$450/R$462 — sem evidência confirmada, continuam REVIEW", () => {
  it("nunca são classificados automaticamente; reconciliationNote registra a hipótese sem mudar status/type", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-08-06,Bruno Vainstock Monteiro / Transferência | Pix,"462,00",saida'].join("\n"));
    const bankRepo = getBankStatementRepository();
    const before = await bankRepo.getLine(lines[0].id);
    await bankRepo.updateLine({ id: lines[0].id, reconciliationNote: "HIPÓTESE (não confirmada): possível parcela/reembolso de VAP comprada no cartão de Bruno." });
    const after = await bankRepo.getLine(lines[0].id);

    expect(after?.status).toBe(before?.status);
    expect(after?.type).toBe(before?.type);
    expect(after?.linkedCashMovementId).toBeNull();
    expect(after?.reconciliationNote).toContain("HIPÓTESE");

    const classified = await classifyPendingLines(STONE_ACCOUNT_ID);
    const group = classified.find((c) => c.group.lines.some((l) => l.id === lines[0].id));
    expect(group).toBeDefined();
    expect(group!.evidence.suggestedType).toBeNull(); // continua sem decisão automática
  });
});

describe("venda particular de bem/equipamento do titular via maquininha Stone", () => {
  it("permanece no fluxo de caixa, mas nunca entra como faturamento operacional/receita da estética", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-05-15,ROBERIO ROCHA FILHO / Transferência | Pix / STONE INSTITUIÇÃO DE,"13230,00",saida'].join("\n"));
    await confirmGroup(
      { lineIds: [lines[0].id], resultingType: "pix_enviado", performedBy: "Gestor", notes: "VENDA PARTICULAR — repasse de venda de bem pessoal do titular, processada via maquininha Stone. Nunca faturamento operacional." },
      STONE_ACCOUNT_ID,
    );
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.amount === 13230 && m.description.includes("ROBERIO"))!;
    expect(movement).toBeDefined(); // permanece real no fluxo de caixa
    expect(movement.nature).not.toBe("receita");
    expect(movement.nature).toBeNull();

    const dre = resolveClassification({ description: movement.description, categoryName: null, supplierId: null, partnerId: null }, undefined, []);
    expect(dre.includeInDre).toBe(false); // nunca infla receita_bruta/faturamento operacional
  });
});

describe("freelancer histórico — Moura Milanez = Rafael", () => {
  it("classificado como prestador, sem criar regra ampla para o futuro", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-05-21,MOURA MILANEZ / Transferência | Pix,"165,00",saida'].join("\n"));
    const PRESTADORES_PJ_CATEGORY = "despesa-prestadores-pj";
    const result = await confirmGroup(
      { lineIds: [lines[0].id], resultingType: "pagamento", categoryId: PRESTADORES_PJ_CATEGORY, performedBy: "Gestor", notes: "Moura Milanez = Rafael, freelancer histórico." },
      STONE_ACCOUNT_ID,
    );
    expect(result.createdRuleId).toBeNull(); // nenhuma regra criada — Rafael não trabalha mais na empresa
    const rules = await getBankStatementRepository().listClassificationRules(true);
    expect(rules.some((r) => r.criteriaCounterpartyPattern?.includes("MOURA MILANEZ"))).toBe(false);
  });
});

describe("PIX Marketplace = Mercado Livre — compra e devolução", () => {
  it("compra vira despesa (nunca receita); devolução nunca vira receita operacional nova", async () => {
    const lines = await seed(
      ["data,descricao,valor,tipo", '2026-06-15,PIX Marketplace / Transferência | Pix,"102,41",saida', '2026-06-16,PIX Marketplace / Devolução | Pix,"102,41",entrada'].join("\n"),
    );
    const compra = lines.find((l) => l.direction === "saida")!;
    const devolucao = lines.find((l) => l.direction === "entrada")!;

    await confirmGroup({ lineIds: [compra.id], resultingType: "pagamento", categoryId: "despesa-produtos-e-insumos", performedBy: "Gestor", notes: "Compra via Mercado Livre." }, STONE_ACCOUNT_ID);
    await confirmGroup({ lineIds: [devolucao.id], resultingType: "devolucao", performedBy: "Gestor", notes: "Devolução de compra Mercado Livre — corresponde à compra de 15/06." }, STONE_ACCOUNT_ID);

    const movements = await getFinanceRepository().listCashMovements();
    const devolucaoMov = movements.find((m) => m.type === "entrada" && m.amount === 102.41)!;
    expect(devolucaoMov.nature).toBe("estorno");
    expect(devolucaoMov.nature).not.toBe("receita");
  });
});

describe("CASAN+CELESC R$361,12 — permanece CONFLICT mesmo com 2 regras aprendidas ativas", () => {
  it("nunca escolhe CASAN ou CELESC automaticamente quando ambas as regras batem", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-03-09,AGUAS E SANEAMENTO CASAN / Transferência | Pix / CELESC DISTRIBUICAO S.A,"361,12",saida'].join("\n"));

    // simula as 2 regras já aprendidas nesta sessão (Celesc e CASAN) via confirmação de outros grupos
    const celescLines = await seed(['data,descricao,valor,tipo', '2026-07-16,CELESC DISTRIBUICAO S.A / Transferência | Pix,"379,62",saida'].join("\n"));
    await confirmGroup(
      { lineIds: [celescLines.find((l) => l.description.includes("CELESC"))!.id], resultingType: "pagamento", performedBy: "Gestor", createRule: { criteriaDirection: "saida", criteriaCounterpartyPattern: "CELESC DISTRIBUICAO" } },
      STONE_ACCOUNT_ID,
    );
    const casanLines = await seed(['data,descricao,valor,tipo', '2026-07-16,AGUAS E SANEAMENTO CASAN / Transferência | Pix,"580,29",saida'].join("\n"));
    await confirmGroup(
      { lineIds: [casanLines.find((l) => l.description.includes("CASAN"))!.id], resultingType: "pagamento", performedBy: "Gestor", createRule: { criteriaDirection: "saida", criteriaCounterpartyPattern: "AGUAS E SANEAMENTO CASAN" } },
      STONE_ACCOUNT_ID,
    );

    const classified = await classifyPendingLines(STONE_ACCOUNT_ID);
    const conflictLine = classified.find((c) => c.group.lines.some((l) => l.id === lines[0].id));
    expect(conflictLine).toBeDefined();
    expect(conflictLine!.evidence.confidence).toBe("conflict");
    expect(conflictLine!.evidence.suggestedSupplierId).toBeNull();

    const stillPending = await getBankStatementRepository().getLine(lines[0].id);
    expect(stillPending?.status).toBe("a_classificar");
    expect(stillPending?.categoryId).toBeNull();
    expect(stillPending?.supplierId).toBeNull();
  });
});

describe("idempotência — reprocessar linha já classificada não duplica", () => {
  it("segunda tentativa de confirmGroup na mesma linha falha graciosamente, sem segundo movimento", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-03-02,Transferência | Pix / ROBERIO ROCHA FILHO,"834,00",entrada'].join("\n"));
    const first = await confirmGroup({ lineIds: [lines[0].id], resultingType: "aporte", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    expect(first.processedLineIds).toHaveLength(1);

    const second = await confirmGroup({ lineIds: [lines[0].id], resultingType: "aporte", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    expect(second.processedLineIds).toHaveLength(0);
    expect(second.failedLineIds).toHaveLength(1);

    const transfers = await getFinanceRepository().listAccountTransfers();
    expect(transfers).toHaveLength(1); // nunca duplicado
  });
});
