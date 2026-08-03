import { describe, expect, it } from "vitest";
import { confirmPurchaseImportLine, createPurchaseImportPreview, fetchPurchaseImportPreview, listPurchaseImports, type ConfirmPurchaseLineInput } from "@/lib/inventory/purchase-import-service";

/**
 * Sem Postgres configurado neste ambiente de teste, toda validação prévia (antes de qualquer
 * leitura/escrita no banco) precisa passar e só então falhar em "Banco não configurado" — mesmo
 * padrão de confirmation.test.ts e consolidation.test.ts. A lógica transacional completa (criação
 * de produto, geração de movimentação "compra", custo médio ponderado, idempotência de linha) é
 * verificada ponta a ponta contra o Neon real na missão (dados temporários, removidos depois).
 */

function confirmInput(overrides: Partial<ConfirmPurchaseLineInput> = {}): ConfirmPurchaseLineInput {
  return {
    lineId: "line-1",
    decision: "vincular_existente",
    performedBy: "Robério",
    linkItemId: "item-1",
    ...overrides,
  };
}

describe("createPurchaseImportPreview — validações antes de qualquer leitura", () => {
  it("exige responsável pela importação", async () => {
    await expect(createPurchaseImportPreview({ fileFormat: "csv", filename: null, content: "produto\nIzer", importedBy: "  " })).rejects.toThrow(/responsável/i);
  });

  it("rejeita arquivo vazio", async () => {
    await expect(createPurchaseImportPreview({ fileFormat: "csv", filename: null, content: "   ", importedBy: "Robério" })).rejects.toThrow(/vazio/i);
  });

  it("rejeita CSV sem nenhuma linha de dados", async () => {
    await expect(createPurchaseImportPreview({ fileFormat: "csv", filename: null, content: "produto,marca", importedBy: "Robério" })).rejects.toThrow(/nenhuma linha/i);
  });

  it("rejeita JSON inválido com mensagem clara, sem lançar exceção genérica", async () => {
    await expect(createPurchaseImportPreview({ fileFormat: "json", filename: null, content: "{ isso não é json", importedBy: "Robério" })).rejects.toThrow(/JSON inválido/i);
  });

  it("rejeita JSON que não é uma lista", async () => {
    await expect(createPurchaseImportPreview({ fileFormat: "json", filename: null, content: '{"produto":"Izer"}', importedBy: "Robério" })).rejects.toThrow(/lista/i);
  });

  it("com conteúdo válido, chega até a camada de banco (prova que passou por toda a validação)", async () => {
    await expect(createPurchaseImportPreview({ fileFormat: "csv", filename: "notas.csv", content: "produto\nIzer", importedBy: "Robério" })).rejects.toThrow(/banco não configurado/i);
  });
});

describe("fetchPurchaseImportPreview / listPurchaseImports — sem banco configurado", () => {
  it("fetchPurchaseImportPreview falha com mensagem clara", async () => {
    await expect(fetchPurchaseImportPreview("import-1")).rejects.toThrow(/banco não configurado/i);
  });

  it("listPurchaseImports falha com mensagem clara", async () => {
    await expect(listPurchaseImports()).rejects.toThrow(/banco não configurado/i);
  });
});

describe("confirmPurchaseImportLine — validações antes de qualquer escrita", () => {
  it("exige responsável", async () => {
    await expect(confirmPurchaseImportLine(confirmInput({ performedBy: "  " }))).rejects.toThrow(/responsável/i);
  });

  it("vincular_existente exige o id do produto", async () => {
    await expect(confirmPurchaseImportLine(confirmInput({ decision: "vincular_existente", linkItemId: undefined }))).rejects.toThrow(/selecione o produto/i);
  });

  it("criar_produto exige categoria, marca e classificação", async () => {
    await expect(confirmPurchaseImportLine(confirmInput({ decision: "criar_produto", newProduct: undefined }))).rejects.toThrow(/categoria, marca e classificação/i);
  });

  it("criar_produto rejeita classificação que não é de consumo controlado (ex.: patrimônio)", async () => {
    await expect(
      confirmPurchaseImportLine(confirmInput({ decision: "criar_produto", newProduct: { category: "Outros", brand: "Genérica", classification: "patrimonio" } })),
    ).rejects.toThrow(/classificações de consumo/i);
  });

  it("ignorar, patrimônio, despesa/manutenção e revisar_depois não exigem produto vinculado — chegam até o banco", async () => {
    await expect(confirmPurchaseImportLine(confirmInput({ decision: "ignorar", linkItemId: undefined }))).rejects.toThrow(/banco não configurado/i);
    await expect(confirmPurchaseImportLine(confirmInput({ decision: "patrimonio", linkItemId: undefined }))).rejects.toThrow(/banco não configurado/i);
    await expect(confirmPurchaseImportLine(confirmInput({ decision: "despesa_manutencao", linkItemId: undefined }))).rejects.toThrow(/banco não configurado/i);
    await expect(confirmPurchaseImportLine(confirmInput({ decision: "revisar_depois", linkItemId: undefined }))).rejects.toThrow(/banco não configurado/i);
  });

  it("com entradas válidas de vincular_existente, chega até a camada de banco", async () => {
    await expect(confirmPurchaseImportLine(confirmInput())).rejects.toThrow(/banco não configurado/i);
  });

  it("com entradas válidas de criar_produto (classificação de consumo), chega até a camada de banco", async () => {
    await expect(
      confirmPurchaseImportLine(confirmInput({ decision: "criar_produto", linkItemId: undefined, newProduct: { category: "Polimento", brand: "Vonixx", classification: "quimico_volume" } })),
    ).rejects.toThrow(/banco não configurado/i);
  });
});
