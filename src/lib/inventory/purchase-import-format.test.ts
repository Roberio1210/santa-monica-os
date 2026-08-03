import { describe, expect, it } from "vitest";
import { parseCsv, parseJson, parsePurchaseImportRow } from "@/lib/inventory/purchase-import-format";

describe("parseCsv", () => {
  it("interpreta cabeçalho e linhas simples", () => {
    const csv = "produto,marca,quantidade_embalagens\nIzer,Vonixx,2";
    const rows = parseCsv(csv);
    expect(rows).toEqual([{ produto: "Izer", marca: "Vonixx", quantidade_embalagens: "2" }]);
  });

  it("suporta campos entre aspas com vírgula interna", () => {
    const csv = 'produto,observacao\n"Composto Polidor, Extra Forte","nota, com virgula"';
    const rows = parseCsv(csv);
    expect(rows[0].produto).toBe("Composto Polidor, Extra Forte");
    expect(rows[0].observacao).toBe("nota, com virgula");
  });

  it("suporta aspas escapadas (duplas) dentro de um campo entre aspas", () => {
    const csv = 'produto\n"Cera ""Premium"""';
    const rows = parseCsv(csv);
    expect(rows[0].produto).toBe('Cera "Premium"');
  });

  it("arquivo vazio retorna lista vazia", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("parseJson", () => {
  it("aceita um array de objetos e normaliza chaves para minúsculo", () => {
    const result = parseJson('[{"Produto": "Izer", "quantidade_embalagens": 2}]');
    expect("rows" in result && result.rows).toEqual([{ produto: "Izer", quantidade_embalagens: "2" }]);
  });

  it("rejeita JSON que não é array", () => {
    const result = parseJson('{"produto": "Izer"}');
    expect("error" in result).toBe(true);
  });

  it("rejeita JSON inválido sem lançar exceção", () => {
    const result = parseJson("{ isso não é json");
    expect("error" in result).toBe(true);
  });
});

describe("parsePurchaseImportRow", () => {
  it("linha completa e válida", () => {
    const parsed = parsePurchaseImportRow(0, {
      produto: "Izer",
      marca: "Vonixx",
      data: "2026-07-15",
      quantidade_embalagens: "2",
      volume_ou_peso_por_embalagem: "500",
      unidade_embalagem: "ml",
      valor_unitario_embalagem: "25,90",
      fornecedor: "Distribuidora XPTO",
    });
    expect(parsed.valid).toBe(true);
    expect(parsed.errors).toEqual([]);
    expect(parsed.fields.packageCount).toBe(2);
    expect(parsed.fields.packageQuantity).toBe(500);
    expect(parsed.fields.unitPricePerPackage).toBe(25.9);
  });

  it("aceita data em formato brasileiro DD/MM/AAAA", () => {
    const parsed = parsePurchaseImportRow(0, { produto: "Izer", data: "15/07/2026", quantidade_embalagens: "1", volume_ou_peso_por_embalagem: "500", unidade_embalagem: "ml" });
    expect(parsed.fields.date).toBe("2026-07-15");
  });

  it("linha sem produto é inválida com motivo explicado", () => {
    const parsed = parsePurchaseImportRow(0, { quantidade_embalagens: "1", volume_ou_peso_por_embalagem: "500", unidade_embalagem: "ml", data: "2026-07-15" });
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.some((e) => e.includes("Produto"))).toBe(true);
  });

  it("linha sem data é inválida", () => {
    const parsed = parsePurchaseImportRow(0, { produto: "Izer", quantidade_embalagens: "1", volume_ou_peso_por_embalagem: "500", unidade_embalagem: "ml" });
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.some((e) => e.includes("Data"))).toBe(true);
  });

  it("quantidade de embalagens zero ou ausente é inválida", () => {
    const parsed = parsePurchaseImportRow(0, { produto: "Izer", data: "2026-07-15", quantidade_embalagens: "0", volume_ou_peso_por_embalagem: "500", unidade_embalagem: "ml" });
    expect(parsed.valid).toBe(false);
  });

  it("nunca lança exceção mesmo com linha completamente vazia", () => {
    expect(() => parsePurchaseImportRow(0, {})).not.toThrow();
  });
});
