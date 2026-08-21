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

/** Amostra real do "Comprovante de Extrato" nativo da Stone (Missão V6.2, ago/2026) — mesmas linhas de stoneNativeCsvFormat.test.ts. */
const STONE_NATIVE_CSV = [
  "Movimentação,Tipo,Valor,Saldo antes,Saldo depois,Tarifa,Data,Horário,Situação,Nosso Número,Destino,Destino Documento,Destino Instituição,Destino Agência,Destino Conta,Origem,Origem Documento,Origem Instituição,Origem Agência,Origem Conta,Descrição",
  'Crédito,Recebível de Cartão,"253,13","R$ 562,97","R$ 816,10","R$ 0,00",21/08/2026 08:24,08:24:09.828,FINISHED,,R. B. E. ESTACIONAMENTO LTDA,57.878.430/0001-28,Stone Instituição de Pagamento S.A.,0001,46975747-0,Desconhecido,Desconhecido,Desconhecido,Desconhecido,Desconhecido,',
  'Crédito,Transferência entre contas Stone,"1.098,15","R$ 2.352,78","R$ 3.450,93","R$ 0,00",21/08/2026 03:03,03:03:03.874,Recebida,,R. B. E. ESTACIONAMENTO LTDA,57.878.430/0001-28,Stone Instituição de Pagamento S.A.,0001,46975747-0,Stone Principal,16.501.555/0001-57,STONE INSTITUIÇÃO DE PAGAMENTO S.A.,0001,30772-8,',
  'Débito,Pix,"-125,00","R$ 661,69","R$ 536,69",Grátis,21/08/2026 11:17,11:17:07.801,Enviado,,Gabriel de Abreu Goncalves da Silva,***.369.289-**,NU PAGAMENTOS S.A. - INSTITUIÇÃO DE PAGAMENTO,Desconhecido,Desconhecido,R. B. E. ESTACIONAMENTO LTDA,57.878.430/0001-28,Stone Instituição de Pagamento S.A.,0001,46975747-0,',
].join("\n");

describe("Missão Financeiro V6.2 — importação do extrato nativo da Stone, mesma idempotência do formato genérico", () => {
  it("importa o extrato real da Stone (Recebível de Cartão + Transferência entre contas Stone + Pix) sem exigir conversão manual", async () => {
    const result = await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato-stone-nativo.csv", importedBy: "Gestor", csvContent: STONE_NATIVE_CSV });
    expect(result.newRowCount).toBe(3);

    const lines = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    expect(lines.find((l) => l.description === "Recebível de Cartão")?.type).toBe("recebimento_venda_stone");
    expect(lines.find((l) => l.description === "Transferência entre contas Stone - Stone Principal")?.type).toBe("recebimento_venda_stone");
  });

  it("reimportar o MESMO extrato nativo da Stone não duplica nenhuma linha — Recebível de Cartão e Transferência entre contas Stone continuam distintos entre si, nunca fundidos nem duplicados", async () => {
    await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato-1.csv", importedBy: "Gestor", csvContent: STONE_NATIVE_CSV });
    const second = await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato-1-reenvio.csv", importedBy: "Gestor", csvContent: STONE_NATIVE_CSV });

    expect(second.newRowCount).toBe(0);
    expect(second.duplicateRowCount).toBe(3);

    const lines = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    expect(lines).toHaveLength(3); // continua 3 (1 Recebível + 1 Transferência + 1 Pix), nunca 6
  });

  it("classificação como recebimento_venda_stone nunca cria accounts_receivable/cash_movement sozinha — só confirma liquidação já existente, exige ação explícita separada", async () => {
    await confirmBankStatementImport({ financialAccountId: STONE_ACCOUNT_ID, fileFormat: "csv", filename: "extrato-1.csv", importedBy: "Gestor", csvContent: STONE_NATIVE_CSV });
    const lines = await getBankStatementRepository().listLines({ financialAccountId: STONE_ACCOUNT_ID });
    const recebivel = lines.find((l) => l.description === "Recebível de Cartão");
    expect(recebivel?.status).toBe("nao_conciliado"); // aguarda tentativa de conciliação, nunca "conciliado" automaticamente
    expect(recebivel?.linkedCashMovementId).toBeNull();
    expect(recebivel?.linkedAccountsReceivableId).toBeNull();
  });
});
