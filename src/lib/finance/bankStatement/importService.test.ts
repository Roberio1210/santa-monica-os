import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { confirmBankStatementImport, dryRunBankStatementImport } from "@/lib/finance/bankStatement/importService";
import { getBankStatementRepository, resetBankStatementRepositoryForTests } from "@/lib/finance/bankStatement/repository-factory";

const STONE_ACCOUNT_ID = "conta-stone";

const SAMPLE_CSV = [
  "data,descricao,contraparte,valor,tipo",
  "2026-08-01,Recebimento vendas,,\"5000,00\",entrada",
  "2026-08-01,Pix recebido,João Silva,\"150,00\",entrada",
  "2026-08-02,Tarifa,,\"12,90\",saida",
  "2026-08-02,Pagamento fornecedor,Fornecedor X,\"300,00\",saida",
].join("\n");

beforeEach(() => resetBankStatementRepositoryForTests());
afterEach(() => resetBankStatementRepositoryForTests());

describe("dryRunBankStatementImport — nunca escreve no banco", () => {
  it("calcula contagens corretas sem persistir nada", async () => {
    const result = await dryRunBankStatementImport(STONE_ACCOUNT_ID, SAMPLE_CSV);
    expect(result.summary.totalRows).toBe(4);
    expect(result.summary.validRows).toBe(4);
    expect(result.summary.newRows).toBe(4);
    expect(result.summary.duplicateRows).toBe(0);

    const imports = await getBankStatementRepository().listImports(STONE_ACCOUNT_ID);
    expect(imports).toHaveLength(0); // dry-run nunca persiste
  });

  it("sugere o tipo de cada linha a partir da descrição", async () => {
    const result = await dryRunBankStatementImport(STONE_ACCOUNT_ID, SAMPLE_CSV);
    expect(result.lines[0].inferredType).toBe("recebimento_venda_stone");
    expect(result.lines[1].inferredType).toBe("pix_recebido");
    expect(result.lines[2].inferredType).toBe("tarifa");
  });
});

describe("confirmBankStatementImport — importação idempotente, nunca duplica", () => {
  it("primeira importação persiste todas as linhas novas", async () => {
    const result = await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato-01.csv", importedBy: "Gestor", csvContent: SAMPLE_CSV });
    expect(result.newRowCount).toBe(4);
    expect(result.duplicateRowCount).toBe(0);

    const lines = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    expect(lines).toHaveLength(4);
  });

  it("reimportar o MESMO arquivo não duplica nenhuma linha", async () => {
    await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato-01.csv", importedBy: "Gestor", csvContent: SAMPLE_CSV });
    const second = await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato-01-reenvio.csv", importedBy: "Gestor", csvContent: SAMPLE_CSV });

    expect(second.newRowCount).toBe(0);
    expect(second.duplicateRowCount).toBe(4);

    const lines = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    expect(lines).toHaveLength(4); // continua 4, nunca 8
  });

  it("duas transações genuinamente idênticas no mesmo dia (mesmo conteúdo) NÃO são tratadas como duplicata uma da outra", async () => {
    const csv = ["data,descricao,valor,tipo", "2026-08-01,Pix recebido,\"50,00\",entrada", "2026-08-01,Pix recebido,\"50,00\",entrada"].join("\n");
    const result = await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });
    expect(result.newRowCount).toBe(2);
  });

  it("linhas inválidas (sem data/valor) não são persistidas nem contam como novas", async () => {
    const csv = ["data,descricao,valor,tipo", ",Recebimento sem data,\"100,00\",entrada", "2026-08-01,Recebimento válido,\"100,00\",entrada"].join("\n");
    const result = await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato.csv", importedBy: "Gestor", csvContent: csv });
    expect(result.newRowCount).toBe(1);
  });

  it("importação sem responsável lança erro claro", async () => {
    await expect(confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "x.csv", importedBy: "", csvContent: SAMPLE_CSV })).rejects.toThrow(/responsável/i);
  });
});
