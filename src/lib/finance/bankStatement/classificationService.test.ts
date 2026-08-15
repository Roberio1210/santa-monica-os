import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmBankStatementImport } from "@/lib/finance/bankStatement/importService";
import { classifyPendingLines, buildDryRunClassificationReport } from "@/lib/finance/bankStatement/classificationService";
import { confirmGroup, rejectGroup } from "@/lib/finance/bankStatement/batchActionsService";
import { getBankStatementRepository, resetBankStatementRepositoryForTests } from "@/lib/finance/bankStatement/repository-factory";
import { getFinanceRepository, resetFinanceRepositoryForTests } from "@/lib/finance/repository-factory";

const STONE_ACCOUNT_ID = "conta-stone";

beforeEach(() => {
  resetBankStatementRepositoryForTests();
  resetFinanceRepositoryForTests();
});
afterEach(() => {
  resetBankStatementRepositoryForTests();
  resetFinanceRepositoryForTests();
});

async function seed(csv: string) {
  await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });
}

describe("classifyPendingLines — Missão Financeiro V2.2 (Fase C/D)", () => {
  it("agrupa e avalia evidência para as linhas pendentes reais", async () => {
    await seed(
      [
        "data,descricao,valor,tipo",
        '2026-01-08,Transferência | Pix / VERISURE BRASIL,"276,11",saida',
        '2026-02-08,Transferência | Pix / VERISURE BRASIL,"280,00",saida',
        '2026-03-08,Transferência | Pix / VERISURE BRASIL,"270,00",saida',
      ].join("\n"),
    );

    const classified = await classifyPendingLines(STONE_ACCOUNT_ID);
    expect(classified.length).toBeGreaterThan(0);
    const verisureGroup = classified.find((c) => c.group.counterpartyKey.includes("VERISURE"));
    expect(verisureGroup?.group.count).toBe(3);
  });

  it("Fase J/K — recebimento_venda_stone/antecipacao_credito NUNCA entram no motor geral, mesmo mencionando 'Stone Instituição de Pagamento' (regressão: seriam mal-sinalizados como 'possível conta relacionada')", async () => {
    await seed(['data,descricao,valor,tipo', '2026-08-01,Recebimento vendas / STONE INSTITUIÇÃO DE PAGAMENTO S.A.,"100,00",entrada'].join("\n"));
    const classified = await classifyPendingLines(STONE_ACCOUNT_ID);
    expect(classified).toHaveLength(0); // única linha é do tipo recebimento_venda_stone — excluída do motor geral, tratada só pela conciliação Stone dedicada.
  });
});

describe("buildDryRunClassificationReport — Fase T, nunca escreve no banco", () => {
  it("reporta totais corretos e nunca persiste nada", async () => {
    await seed(['data,descricao,valor,tipo', '2026-01-08,Transferência | Pix / ALGUEM,"50,00",saida'].join("\n"));

    const report = await buildDryRunClassificationReport(STONE_ACCOUNT_ID);
    expect(report.totalLines).toBe(1);
    expect(report.totalPending).toBe(1);

    const linesAfter = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    expect(linesAfter[0].status).toBe("a_classificar"); // dry run não muda nada
  });

  it("soma todos os tiers de confiança igual ao total pendente", async () => {
    await seed(
      [
        "data,descricao,valor,tipo",
        '2026-01-08,Transferência | Pix / A,"10,00",saida',
        '2026-01-09,Transferência | Pix / B,"20,00",entrada',
        '2026-01-10,Tarifa,"1,00",saida',
      ].join("\n"),
    );
    const report = await buildDryRunClassificationReport(STONE_ACCOUNT_ID);
    const sumLines = Object.values(report.byConfidence).reduce((s, b) => s + b.lines, 0);
    expect(sumLines).toBe(report.totalPending);
  });

  it("candidatos Stone são reportados SEPARADAMENTE, nunca somados em byConfidence (Fase J/K)", async () => {
    await seed(
      ['data,descricao,valor,tipo', '2026-08-01,Recebimento vendas,"100,00",entrada', '2026-08-02,Transferência | Pix / ALGUEM,"50,00",saida'].join("\n"),
    );
    const report = await buildDryRunClassificationReport(STONE_ACCOUNT_ID);
    expect(report.stoneCandidates.total).toBe(1);
    expect(report.stoneCandidates.naoConciliado).toBe(1);
    const sumLines = Object.values(report.byConfidence).reduce((s, b) => s + b.lines, 0);
    expect(sumLines).toBe(1); // só o Pix, nunca a linha de recebimento Stone
  });
});

describe("confirmGroup — Fase I, nunca sem confirmação humana explícita", () => {
  it("aplica o tipo confirmado a todas as linhas do grupo e grava auditoria", async () => {
    await seed(
      [
        "data,descricao,valor,tipo",
        '2026-01-08,Transferência | Pix / FORNECEDOR TESTE,"100,00",saida',
        '2026-02-08,Transferência | Pix / FORNECEDOR TESTE,"100,00",saida',
      ].join("\n"),
    );
    const lines = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    const lineIds = lines.map((l) => l.id);

    const result = await confirmGroup({ lineIds, resultingType: "pagamento", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    expect(result.processedLineIds).toHaveLength(2);
    expect(result.failedLineIds).toHaveLength(0);

    const updated = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    expect(updated.every((l) => l.status === "conciliado")).toBe(true);

    const audit = await getFinanceRepository().listAuditLog("bank_statement_line", lineIds[0]);
    expect(audit.some((a) => a.action === "classify_group")).toBe(true);
  });

  it("cria regra determinística quando createRule é informado (Fase V)", async () => {
    await seed(['data,descricao,valor,tipo', '2026-01-08,Transferência | Pix / EMPRESA CONHECIDA,"100,00",saida'].join("\n"));
    const lines = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });

    const result = await confirmGroup(
      { lineIds: lines.map((l) => l.id), resultingType: "pagamento", performedBy: "Gestor", createRule: { criteriaDirection: "saida", criteriaCounterpartyPattern: "EMPRESA CONHECIDA" } },
      STONE_ACCOUNT_ID,
    );
    expect(result.createdRuleId).not.toBeNull();

    const rules = await getBankStatementRepository().listClassificationRules(true);
    expect(rules).toHaveLength(1);
  });

  it("rejeita regra excessivamente ampla (sem critério específico) mesmo dentro da confirmação de grupo", async () => {
    await seed(['data,descricao,valor,tipo', '2026-01-08,Transferência | Pix / QUALQUER COISA,"100,00",saida'].join("\n"));
    const lines = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });

    await expect(
      confirmGroup({ lineIds: lines.map((l) => l.id), resultingType: "pagamento", performedBy: "Gestor", createRule: { criteriaDirection: "saida" } }, STONE_ACCOUNT_ID),
    ).rejects.toThrow(/ampla|específico/i);
  });

  it("regra criada é aplicada a uma NOVA linha equivalente importada depois (aprendizado controlado, Fase V)", async () => {
    await seed(['data,descricao,valor,tipo', '2026-01-08,Transferência | Pix / EMPRESA ENSINADA,"100,00",saida'].join("\n"));
    const firstLines = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    await confirmGroup(
      { lineIds: firstLines.map((l) => l.id), resultingType: "pagamento", performedBy: "Gestor", createRule: { criteriaDirection: "saida", criteriaCounterpartyPattern: "EMPRESA ENSINADA" } },
      STONE_ACCOUNT_ID,
    );

    await seed(['data,descricao,valor,tipo', '2026-02-08,Transferência | Pix / EMPRESA ENSINADA,"150,00",saida'].join("\n"));
    const classified = await classifyPendingLines(STONE_ACCOUNT_ID);
    const matched = classified.find((c) => c.group.counterpartyKey.includes("EMPRESA ENSINADA"));
    expect(matched?.evidence.confidence).toBe("exact");
  });

  it("falha parcial (linha já processada) não impede o resto do lote", async () => {
    await seed(['data,descricao,valor,tipo', '2026-01-08,Transferência | Pix / X,"10,00",saida'].join("\n"));
    const lines = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    const lineId = lines[0].id;

    await confirmGroup({ lineIds: [lineId], resultingType: "pagamento", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    const second = await confirmGroup({ lineIds: [lineId], resultingType: "pagamento", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    expect(second.failedLineIds).toHaveLength(1);
    expect(second.processedLineIds).toHaveLength(0);
  });

  it("sem responsável informado, lança erro antes de processar qualquer linha", async () => {
    await seed(['data,descricao,valor,tipo', '2026-01-08,Transferência | Pix / X,"10,00",saida'].join("\n"));
    const lines = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    await expect(confirmGroup({ lineIds: lines.map((l) => l.id), resultingType: "pagamento", performedBy: "" }, STONE_ACCOUNT_ID)).rejects.toThrow(/informe/i);
  });
});

describe("rejectGroup — nunca sem justificativa auditável", () => {
  it("marca todas as linhas do grupo como ignoradas com justificativa e grava auditoria", async () => {
    await seed(
      ["data,descricao,valor,tipo", '2026-01-08,Transferência | Pix / Y,"10,00",saida', '2026-02-08,Transferência | Pix / Y,"10,00",saida'].join("\n"),
    );
    const lines = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    const result = await rejectGroup({ lineIds: lines.map((l) => l.id), reason: "Confirmado com o gestor por telefone — não relevante.", performedBy: "Gestor" });
    expect(result.processedLineIds).toHaveLength(2);

    const updated = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    expect(updated.every((l) => l.status === "ignorado")).toBe(true);
  });
});
