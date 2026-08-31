import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmBankStatementImport } from "@/lib/finance/bankStatement/importService";
import { listPixStoneReceivedLines } from "@/lib/finance/bankStatement/pixStoneQueries";
import { getBankStatementRepository, resetBankStatementRepositoryForTests } from "@/lib/finance/bankStatement/repository-factory";

async function seedFirstLineId(csv: string): Promise<string> {
  const result = await confirmBankStatementImport({ financialAccountId: "conta-stone", fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });
  const lines = await getBankStatementRepository().listLines({ financialAccountId: "conta-stone" });
  const seeded = lines.find((l) => l.importId === result.id);
  if (!seeded) throw new Error("linha não encontrada");
  return seeded.id;
}

const STONE_ACCOUNT_ID = "conta-stone";

beforeEach(() => resetBankStatementRepositoryForTests());
afterEach(() => resetBankStatementRepositoryForTests());

/**
 * Missão Financeiro V7 (saneamento de auditoria, 30/08/2026) — regressão do incidente real: três
 * Pix recebidos via maquininha Stone foram declarados "não localizados na Stone" numa auditoria
 * porque a consulta usada só olhava `type = "pix_recebido"`. As três linhas eram "Pix |
 * Maquininha" — classificadas como `recebimento_venda_stone` por decisão deliberada da Missão
 * V2.3, nunca um erro de importação. Este teste prova que `listPixStoneReceivedLines` encontra as
 * duas representações, para que essa classe de erro não se repita.
 */
describe("listPixStoneReceivedLines — nunca perde Pix por causa da representação interna", () => {
  it("encontra Pix classificados como recebimento_venda_stone (padrão 'Pix | Maquininha') e como pix_recebido, na mesma consulta", async () => {
    const csv = [
      "data,descricao,contraparte,valor,tipo",
      "2026-08-03,Cliente Teste Um / Pix | Maquininha,Cliente Teste Um,120.00,entrada",
      "2026-08-07,Cliente Teste Dois / Pix | Maquininha,Cliente Teste Dois,240.00,entrada",
      "2026-08-08,Cliente Teste Três / Pix | Maquininha,Cliente Teste Três,250.00,entrada",
      "2026-08-20,Pix - Cliente Ja Encontrado Antes,Cliente Ja Encontrado Antes,45.00,entrada",
    ].join("\n");
    await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });

    const allLines = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    expect(allLines.filter((l) => l.type === "recebimento_venda_stone")).toHaveLength(3);
    expect(allLines.filter((l) => l.type === "pix_recebido")).toHaveLength(1);

    const found = await listPixStoneReceivedLines(STONE_ACCOUNT_ID);
    expect(found).toHaveLength(4);
    const amounts = found.map((l) => l.amount).sort((a, b) => a - b);
    expect(amounts).toEqual([45, 120, 240, 250]);
  });

  it("uma consulta ingênua por type único (pix_recebido) perderia as linhas Pix Maquininha — prova do bug original", async () => {
    const csv = ["data,descricao,contraparte,valor,tipo", "2026-08-03,Cliente Teste Um / Pix | Maquininha,Cliente Teste Um,120.00,entrada"].join("\n");
    await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });

    const naive = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID, type: "pix_recebido" });
    expect(naive).toHaveLength(0); // exatamente o bug: a busca "ingênua" não encontra nada

    const canonical = await listPixStoneReceivedLines(STONE_ACCOUNT_ID);
    expect(canonical).toHaveLength(1); // a busca canônica encontra
  });

  it("respeita filtro de data (dateFrom/dateTo)", async () => {
    const csv = [
      "data,descricao,contraparte,valor,tipo",
      "2026-08-03,Cliente Teste Um / Pix | Maquininha,Cliente Teste Um,120.00,entrada",
      "2026-08-25,Cliente Fora Do Periodo / Pix | Maquininha,Cliente Fora Do Periodo,80.00,entrada",
    ].join("\n");
    await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });

    const found = await listPixStoneReceivedLines(STONE_ACCOUNT_ID, "2026-08-01", "2026-08-10");
    expect(found).toHaveLength(1);
    expect(found[0].amount).toBe(120);
  });

  it("nunca inclui saídas (pix_enviado)", async () => {
    const csv = ["data,descricao,contraparte,valor,tipo", "2026-08-03,Pix - Fornecedor Exemplo,Fornecedor Exemplo,50.00,saida"].join("\n");
    await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });

    const found = await listPixStoneReceivedLines(STONE_ACCOUNT_ID);
    expect(found).toHaveLength(0);
  });

  /**
   * Achado real durante a construção deste fix: `recebimento_venda_stone` NÃO é exclusivo de
   * Pix — também cobre lotes de liquidação de cartão ("Recebimento vendas / Antecipação",
   * "Recebível de Cartão"). Uma primeira versão desta função incluía essas linhas por engano
   * (102 de 110 linhas do tipo em agosto/2026 eram cartão, não Pix). Este teste prova que a
   * versão final as exclui corretamente.
   */
  it("nunca inclui lotes de liquidação de cartão classificados como recebimento_venda_stone sem 'Pix' na descrição", async () => {
    const csv = [
      "data,descricao,contraparte,valor,tipo",
      "2026-08-05,Recebimento vendas / Antecipação | Crédito,,321.36,entrada",
      "2026-08-19,Recebível de Cartão,,138.43,entrada",
      "2026-08-08,Cliente Teste Três / Pix | Maquininha,Cliente Teste Três,250.00,entrada",
    ].join("\n");
    await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });

    const found = await listPixStoneReceivedLines(STONE_ACCOUNT_ID);
    expect(found).toHaveLength(1);
    expect(found[0].amount).toBe(250);
  });
});

/**
 * Revisão pré-commit (30/08/2026) — testes negativos exigidos explicitamente: provar, um a um,
 * que nenhuma das saídas/movimentações não-operacionais listadas no checkpoint da revisão pode
 * ser confundida com um Pix recebido de cliente.
 */
describe("listPixStoneReceivedLines — testes negativos (nunca retorna estas movimentações)", () => {
  it("nunca retorna Pix enviado (saída)", async () => {
    const csv = ["data,descricao,contraparte,valor,tipo", "2026-08-10,Pix - Fornecedor Teste,Fornecedor Teste,150.00,saida"].join("\n");
    await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });
    const [line] = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    expect(line.type).toBe("pix_enviado"); // confirma a premissa do teste antes de checar a consulta

    const found = await listPixStoneReceivedLines(STONE_ACCOUNT_ID);
    expect(found).toHaveLength(0);
  });

  it("nunca retorna retirada de sócio", async () => {
    const lineId = await seedFirstLineId(["data,descricao,contraparte,valor,tipo", "2026-08-27,Pix - Sócio Teste,Sócio Teste,1500.00,saida"].join("\n"));
    await getBankStatementRepository().updateLine({ id: lineId, type: "retirada" });

    const found = await listPixStoneReceivedLines(STONE_ACCOUNT_ID);
    expect(found).toHaveLength(0);
  });

  it("nunca retorna devolução/estorno, mesmo quando a direção é entrada", async () => {
    const csv = ["data,descricao,contraparte,valor,tipo", "2026-08-10,Devolução do proprietário para a empresa,Sócio Teste,740.00,entrada"].join("\n");
    await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });
    const [line] = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    expect(line.type).toBe("devolucao");

    const found = await listPixStoneReceivedLines(STONE_ACCOUNT_ID);
    expect(found).toHaveLength(0);
  });

  it("nunca retorna transferência de saída entre contas próprias", async () => {
    const csv = ["data,descricao,contraparte,valor,tipo", "2026-08-20,Transferência entre contas - Ailos,Ailos,2141.00,saida"].join("\n");
    await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });
    const [line] = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    expect(line.type).toBe("transferencia_saida");

    const found = await listPixStoneReceivedLines(STONE_ACCOUNT_ID);
    expect(found).toHaveLength(0);
  });

  it("nunca retorna aporte de sócio (entrada, mas não é venda a cliente)", async () => {
    const lineId = await seedFirstLineId(["data,descricao,contraparte,valor,tipo", "2026-08-06,Pix - Sócio Teste,Sócio Teste,1100.00,entrada"].join("\n"));
    await getBankStatementRepository().updateLine({ id: lineId, type: "aporte" });

    const found = await listPixStoneReceivedLines(STONE_ACCOUNT_ID);
    expect(found).toHaveLength(0);
  });

  it("nunca retorna tarifa nem pagamento a fornecedor", async () => {
    const csv = [
      "data,descricao,contraparte,valor,tipo",
      "2026-08-05,Tarifa de manutenção de conta,,12.00,saida",
      "2026-08-05,Pagamento a fornecedor,Fornecedor Exemplo,300.00,saida",
    ].join("\n");
    await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });

    const found = await listPixStoneReceivedLines(STONE_ACCOUNT_ID);
    expect(found).toHaveLength(0);
  });
});
