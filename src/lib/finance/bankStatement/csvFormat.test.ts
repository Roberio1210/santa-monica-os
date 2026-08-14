import { describe, expect, it } from "vitest";
import { parseBankStatementCsv } from "@/lib/finance/bankStatement/csvFormat";

describe("parseBankStatementCsv", () => {
  it("aceita data ISO, contraparte opcional e valor com vírgula decimal (campo entre aspas — CSV usa vírgula como separador de coluna)", () => {
    const csv = 'data,descricao,contraparte,valor,tipo\n2026-08-01,Recebimento vendas,,"1234,56",entrada';
    const [line] = parseBankStatementCsv(csv);
    expect(line.date).toBe("2026-08-01");
    expect(line.description).toBe("Recebimento vendas");
    expect(line.amount).toBe(1234.56);
    expect(line.direction).toBe("entrada");
    expect(line.errors).toEqual([]);
  });

  it("aceita valor com ponto decimal simples (formato mais comum em export CSV)", () => {
    const csv = "data,descricao,valor,tipo\n2026-08-01,Recebimento vendas,1234.56,entrada";
    const [line] = parseBankStatementCsv(csv);
    expect(line.amount).toBe(1234.56);
  });

  it("aceita data BR (DD/MM/AAAA)", () => {
    const csv = 'data,descricao,valor,tipo\n15/08/2026,Pagamento fornecedor,"500,00",saida';
    const [line] = parseBankStatementCsv(csv);
    expect(line.date).toBe("2026-08-15");
  });

  it("sem coluna 'tipo', usa o sinal do valor para decidir a direção", () => {
    const csv = "data,descricao,valor\n2026-08-01,Pix enviado,-100.00";
    const [line] = parseBankStatementCsv(csv);
    expect(line.direction).toBe("saida");
    expect(line.amount).toBe(100);
  });

  it("data ausente gera erro de validação, nunca inventa uma data", () => {
    const csv = "data,descricao,valor,tipo\n,Recebimento vendas,100.00,entrada";
    const [line] = parseBankStatementCsv(csv);
    expect(line.errors).toContain("Coluna 'data' ausente.");
  });

  it("valor ausente gera erro de validação", () => {
    const csv = "data,descricao,valor,tipo\n2026-08-01,Recebimento vendas,,entrada";
    const [line] = parseBankStatementCsv(csv);
    expect(line.errors.some((e) => e.includes("valor"))).toBe(true);
  });

  it("contraparte é opcional — ausência não gera erro", () => {
    const csv = "data,descricao,valor,tipo\n2026-08-01,Tarifa,10.00,saida";
    const [line] = parseBankStatementCsv(csv);
    expect(line.errors).toEqual([]);
    expect(line.counterparty).toBeNull();
  });
});
