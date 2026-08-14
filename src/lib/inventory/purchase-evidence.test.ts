import { describe, expect, it } from "vitest";
import { buildPurchaseEvidenceLine, sumRealTotalCents, sumListTotalCents, assertRealTotalMatches, round2 } from "@/lib/inventory/purchase-evidence";

/** Missão Estoque V2 Final — compra real Farben (14/08/2026), usada como fixture em todos os testes. */
const FARBEN_LINES = [
  { productDescription: "Nograx Lava Auto Desengraxante", brand: "Farben", packageCount: 2, packageQuantityMl: 5000, listTotalValue: 212.3, realTotalValue: 106.15 },
  { productDescription: "APC-100 Limpador Multifuncional Concentrado", brand: "Farben", productCode: "HI539.100", packageCount: 1, packageQuantityMl: 5000, listTotalValue: 77.25, realTotalValue: 38.63 },
  { productDescription: "Selanew Selante para Pneus", brand: "Farben", productCode: "HI539.150-0.5", packageCount: 4, packageQuantityMl: 500, listTotalValue: 217.2, realTotalValue: 108.6 },
  { productDescription: "Shamp Lava Auto Neutro", brand: "Farben", productCode: "HI539.020-3.0", packageCount: 3, packageQuantityMl: 3000, listTotalValue: 264.9, realTotalValue: 132.45 },
  { productDescription: "Cleather Limpador de Couro", brand: "Farben", productCode: "HI539.070-0.5", packageCount: 3, packageQuantityMl: 500, listTotalValue: 96.6, realTotalValue: 48.3 },
  { productDescription: "Polidor 3 em 1", brand: "Farben", productCode: "PO539.120-0.5", packageCount: 2, packageQuantityMl: 500, listTotalValue: 135.8, realTotalValue: 67.9 },
];

describe("buildPurchaseEvidenceLine", () => {
  it("1/4/6 — Nograx (produto existente): desconto e total calculados corretamente a partir do valor real informado, nunca derivado", () => {
    const line = buildPurchaseEvidenceLine(FARBEN_LINES[0]);
    expect(line.discountAmount).toBe(106.15);
    expect(line.realUnitPricePerPackage).toBe(53.08); // 106.15 / 2 = 53.075 -> arredonda pra cima
    expect(line.totalQuantityMl).toBe(10000);
  });

  it("6 — APC-100: valor real R$38,63 (já resolvido pelo gestor) é respeitado tal como veio, sem recalcular 77,25/2=38,625", () => {
    const line = buildPurchaseEvidenceLine(FARBEN_LINES[1]);
    expect(line.realTotalValue).toBe(38.63);
    expect(line.discountAmount).toBe(38.62); // 77.25 - 38.63, nunca 38.625
  });

  it("5 — desconto de ~50% em todas as linhas reais da compra Farben", () => {
    for (const input of FARBEN_LINES) {
      const line = buildPurchaseEvidenceLine(input);
      const ratio = line.realTotalValue / line.listTotalValue;
      expect(ratio).toBeGreaterThan(0.49);
      expect(ratio).toBeLessThan(0.51);
    }
  });

  it("2 — Selanew (produto novo): 4 embalagens de 500ml somam 2.000ml", () => {
    const line = buildPurchaseEvidenceLine(FARBEN_LINES[2]);
    expect(line.totalQuantityMl).toBe(2000);
    expect(line.realUnitPricePerPackage).toBe(27.15);
  });

  it("valida entradas — quantidade de embalagens zero ou negativa lança erro", () => {
    expect(() => buildPurchaseEvidenceLine({ ...FARBEN_LINES[0], packageCount: 0 })).toThrow();
    expect(() => buildPurchaseEvidenceLine({ ...FARBEN_LINES[0], packageCount: -1 })).toThrow();
  });

  it("valida entradas — volume de embalagem zero ou negativo lança erro", () => {
    expect(() => buildPurchaseEvidenceLine({ ...FARBEN_LINES[0], packageQuantityMl: 0 })).toThrow();
  });

  it("valida entradas — valor real maior que o de tabela lança erro (nunca aceita 'desconto negativo' silenciosamente)", () => {
    expect(() => buildPurchaseEvidenceLine({ ...FARBEN_LINES[0], realTotalValue: 300 })).toThrow();
  });

  it("valida entradas — descrição/marca vazias lançam erro", () => {
    expect(() => buildPurchaseEvidenceLine({ ...FARBEN_LINES[0], productDescription: "  " })).toThrow();
    expect(() => buildPurchaseEvidenceLine({ ...FARBEN_LINES[0], brand: "" })).toThrow();
  });
});

describe("7 — soma total da compra Farben bate exatamente com o que o gestor informou", () => {
  it("soma real das 6 linhas = R$ 502,03, soma de tabela = R$ 1.004,05, sem diferença de centavos", () => {
    expect(sumRealTotalCents(FARBEN_LINES)).toBe(50203);
    expect(sumListTotalCents(FARBEN_LINES)).toBe(100405);
  });

  it("assertRealTotalMatches passa para o total real correto e lança para qualquer outro", () => {
    expect(() => assertRealTotalMatches(FARBEN_LINES, 502.03)).not.toThrow();
    expect(() => assertRealTotalMatches(FARBEN_LINES, 502.02)).toThrow();
    expect(() => assertRealTotalMatches(FARBEN_LINES, 1004.05)).toThrow(); // nunca confundir com o total de tabela
  });

  it("round2 nunca acumula erro de ponto flutuante ao somar 6 valores com centavos ímpares", () => {
    const total = FARBEN_LINES.reduce((sum, l) => round2(sum + l.realTotalValue), 0);
    expect(total).toBe(502.03);
  });
});
