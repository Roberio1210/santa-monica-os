import { describe, expect, it } from "vitest";
import { confirmPurchaseImportLine, createPurchaseImportPreview, fetchPurchaseImportPreview, listPurchaseImports, type ConfirmPurchaseLineInput } from "@/lib/inventory/purchase-import-service";
import { STOCK_TRACKED_CLASSIFICATIONS } from "@/lib/inventory/types";

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

describe("STOCK_TRACKED_CLASSIFICATIONS — Missão V4.4 (ferramenta/manutenção passam a ter controle de quantidade, patrimônio continua fora)", () => {
  it("inclui os 3 consumíveis originais + epi/ferramenta/equipamento/manutencao/material_divulgacao/brinde_cliente", () => {
    for (const c of ["quimico_volume", "solido_peso", "consumivel_unidade", "epi", "ferramenta", "equipamento", "manutencao", "material_divulgacao", "brinde_cliente"]) {
      expect(STOCK_TRACKED_CLASSIFICATIONS).toContain(c);
    }
  });

  it("nunca inclui patrimonio (escopo já existente, não alterado) nem nao_controlado", () => {
    expect(STOCK_TRACKED_CLASSIFICATIONS).not.toContain("patrimonio");
    expect(STOCK_TRACKED_CLASSIFICATIONS).not.toContain("nao_controlado");
  });
});

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

  it("criar_produto rejeita classificação que não é controlada em estoque (ex.: patrimônio, escopo já existente)", async () => {
    await expect(
      confirmPurchaseImportLine(confirmInput({ decision: "criar_produto", newProduct: { category: "Outros", brand: "Genérica", classification: "patrimonio" } })),
    ).rejects.toThrow(/não é controlada em estoque/i);
  });

  it("Missão V4.4 — criar_produto ACEITA ferramenta e manutenção (antes rejeitadas), chega até o banco", async () => {
    await expect(
      confirmPurchaseImportLine(confirmInput({ decision: "criar_produto", linkItemId: undefined, newProduct: { category: "Outros", brand: "Genérica", classification: "ferramenta" } })),
    ).rejects.toThrow(/banco/i);
    await expect(
      confirmPurchaseImportLine(confirmInput({ decision: "criar_produto", linkItemId: undefined, newProduct: { category: "Outros", brand: "Genérica", classification: "manutencao" } })),
    ).rejects.toThrow(/banco/i);
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

/**
 * Missão de Fechamento da Reconciliação dos Snow Foams — decisão "já contabilizado manualmente"
 * (linha vinculada a um produto existente cuja entrada já foi lançada fora do fluxo de
 * importação, nunca gera `inventory_movement`). Mesma limitação de ambiente das suítes acima:
 * sem Postgres configurado em teste, a validação pré-banco é o que dá para verificar de forma
 * automatizada aqui — a persistência real (matchedItemId gravado, resultingMovementId permanece
 * null, nenhum movimento/alteração de saldo, idempotência em linha já processada) foi verificada
 * ponta a ponta contra o Neon real nesta mesma missão, com dados 100% temporários criados e
 * removidos ao final (nunca tocando nas 4 linhas reais de Snow Foam nem em nenhum outro registro).
 */
describe("confirmPurchaseImportLine — decision 'ja_contabilizado_manualmente'", () => {
  it("exige o id do produto vinculado, com a mesma mensagem de vincular_existente", async () => {
    await expect(
      confirmPurchaseImportLine(confirmInput({ decision: "ja_contabilizado_manualmente", linkItemId: undefined })),
    ).rejects.toThrow(/selecione o produto/i);
  });

  it("não exige newProduct nem embalagem/quantidade (não há conversão a calcular) — com o id do produto, chega até a camada de banco", async () => {
    await expect(
      confirmPurchaseImportLine(confirmInput({ decision: "ja_contabilizado_manualmente", linkItemId: "item-existente-1" })),
    ).rejects.toThrow(/banco não configurado/i);
  });
});
