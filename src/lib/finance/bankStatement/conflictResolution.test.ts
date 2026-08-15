import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmBankStatementImport } from "@/lib/finance/bankStatement/importService";
import { classifyPendingLines } from "@/lib/finance/bankStatement/classificationService";
import { confirmGroup } from "@/lib/finance/bankStatement/batchActionsService";
import { getBankStatementRepository, resetBankStatementRepositoryForTests } from "@/lib/finance/bankStatement/repository-factory";
import { getFinanceRepository, resetFinanceRepositoryForTests } from "@/lib/finance/repository-factory";

/**
 * Missão Financeiro V2.2 (revisão dos 7 conflitos reais) — testes derivados de casos reais
 * encontrados na revisão manual: Elana Casanova (cliente mensalista, nunca CASAN), Pix recebido
 * por engano + devolução (efeito líquido zero, nunca receita), contaminação de contraparte por
 * linha vizinha.
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

describe("caso real: ELANA CASANOVA nunca é confundida com fornecedor CASAN", () => {
  it("linha real de Elana Casanova nunca aparece como conflito/sugestão de fornecedor CASAN", async () => {
    await seed(['data,descricao,valor,tipo', '2026-05-14,ELANA   CASANOVA / Transferência | Pix,"550,00",entrada'].join("\n"));
    const classified = await classifyPendingLines(STONE_ACCOUNT_ID);
    const elanaGroup = classified.find((c) => c.group.counterpartyKey.includes("CASANOVA"));
    expect(elanaGroup).toBeDefined();
    expect(elanaGroup!.evidence.confidence).not.toBe("conflict");
    expect(elanaGroup!.evidence.suggestedSupplierId).toBeNull();
  });

  it("entrada de cliente identificado (nome de pessoa física) nunca vira fornecedor automaticamente — fica REVIEW para decisão humana", async () => {
    await seed(['data,descricao,valor,tipo', '2026-05-14,ELANA CASANOVA / Transferência | Pix,"550,00",entrada'].join("\n"));
    const classified = await classifyPendingLines(STONE_ACCOUNT_ID);
    const group = classified[0];
    expect(group.evidence.confidence).toBe("review");
    expect(group.evidence.suggestedType).toBeNull(); // nunca decide sozinho — precisa do contexto real que só o gestor tem
  });
});

describe("caso real: Pix recebido por engano + devolução no mesmo dia — efeito líquido zero", () => {
  it("processar as duas linhas (entrada por engano + devolução) nunca gera receita/despesa, apenas 2 movimentos de caixa que se cancelam", async () => {
    const lines = await seed(
      [
        "data,descricao,valor,tipo",
        '2026-07-17,66.434.434 ELANA CASANOVA / Transferência | Pix / FACEBOOK SERVICOS ONLINE DO,"350,00",entrada',
        '2026-07-17,66.434.434 ELANA CASANOVA / Devolução | Pix,"350,00",saida',
      ].join("\n"),
    );
    const entrada = lines.find((l) => l.direction === "entrada")!;
    const devolucao = lines.find((l) => l.direction === "saida")!;

    await confirmGroup({ lineIds: [entrada.id], resultingType: "pix_recebido", performedBy: "Gestor", notes: "Recebido por engano — devolvido no mesmo dia, efeito líquido R$0,00, nunca receita operacional." }, STONE_ACCOUNT_ID);
    await confirmGroup({ lineIds: [devolucao.id], resultingType: "devolucao", performedBy: "Gestor", notes: "Devolução do Pix recebido por engano — efeito líquido R$0,00." }, STONE_ACCOUNT_ID);

    const movements = await getFinanceRepository().listCashMovements();
    const entradaMovement = movements.find((m) => m.description.includes("FACEBOOK"));
    const devolucaoMovement = movements.find((m) => m.description.includes("Devolução"));

    expect(entradaMovement).toBeDefined();
    expect(devolucaoMovement).toBeDefined();
    expect(entradaMovement!.nature).not.toBe("receita"); // nunca receita operacional
    expect(devolucaoMovement!.nature).toBe("estorno"); // nunca despesa operacional artificial

    const netEffect = Math.round(((entradaMovement!.amount - devolucaoMovement!.amount)) * 100) / 100;
    expect(netEffect).toBe(0);

    // nenhuma accounts_receivable/accounts_payable artificial criada
    const receivables = await getFinanceRepository().listAccountsReceivable();
    const payables = await getFinanceRepository().listAccountsPayable();
    expect(receivables.some((r) => r.description.includes("ELANA"))).toBe(false);
    expect(payables.some((p) => p.description.includes("ELANA"))).toBe(false);
  });

  it("devolução nunca vira despesa operacional — nature sempre 'estorno', nunca null tratado como despesa", async () => {
    const lines = await seed(['data,descricao,valor,tipo', '2026-07-17,66.434.434 ELANA CASANOVA / Devolução | Pix,"350,00",saida'].join("\n"));
    const updated = await confirmGroup({ lineIds: [lines[0].id], resultingType: "devolucao", performedBy: "Gestor" }, STONE_ACCOUNT_ID);
    expect(updated.processedLineIds).toHaveLength(1);
    const movements = await getFinanceRepository().listCashMovements();
    const movement = movements.find((m) => m.description.includes("Devolução"));
    expect(movement?.nature).toBe("estorno");
  });
});

describe("linha vizinha nunca contamina a contraparte de outra linha (independência estrutural)", () => {
  it("duas linhas com descrições parecidas mas ids/conteúdo distintos são avaliadas de forma totalmente independente", async () => {
    const lines = await seed(
      [
        "data,descricao,valor,tipo",
        '2026-04-16,STYLUS CONTABILIDADE / Pagamento,"421,13",saida',
        '2026-04-16,Maestro | Débito / STYLUS CONTABILIDADE,"59,33",entrada',
      ].join("\n"),
    );
    expect(lines).toHaveLength(2);
    expect(lines[0].id).not.toBe(lines[1].id);

    const classified = await classifyPendingLines(STONE_ACCOUNT_ID);
    // a linha de pagamento real (saída) deve aparecer no motor geral com fornecedor sugerido
    const pagamento = classified.find((c) => c.group.direction === "saida" && c.evidence.suggestedSupplierId);
    expect(pagamento).toBeDefined();
    // a linha "Maestro | Débito" (entrada) foi corretamente classificada como recebimento_venda_stone
    // na importação (regra de bandeira) e por isso NUNCA aparece no motor geral — nunca contamina o pagamento da Stylus.
    const maestroLine = await getBankStatementRepository().getLine(lines[1].id);
    expect(maestroLine?.type).toBe("recebimento_venda_stone");
    expect(classified.some((c) => c.group.lines.some((l) => l.id === lines[1].id))).toBe(false);
  });
});

describe("Fase J/K continuam intocadas — candidatos Stone nunca entram nesta revisão", () => {
  it("recebimento_venda_stone/antecipacao_credito nunca aparecem em classifyPendingLines mesmo após as correções desta missão", async () => {
    await seed(['data,descricao,valor,tipo', '2026-08-01,Recebimento vendas,"100,00",entrada'].join("\n"));
    const classified = await classifyPendingLines(STONE_ACCOUNT_ID);
    expect(classified).toHaveLength(0);
  });
});
