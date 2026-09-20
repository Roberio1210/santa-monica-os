import { describe, expect, it } from "vitest";
import { groupPaymentsByCategory, summarizePersonnelCost } from "@/lib/hr/costSummary";

describe("summarizePersonnelCost — Missão 86 (nunca soma tudo como salário)", () => {
  it("5) diária/freelancer nunca é somada como salário fixo — cada categoria fica separada", () => {
    const summary = summarizePersonnelCost([
      { category: "salario_fixo", amount: 1500 },
      { category: "diaria_freelancer", amount: 80 },
    ]);
    expect(summary.porCategoria.salario_fixo).toBe(1500);
    expect(summary.porCategoria.diaria_freelancer).toBe(80);
    expect(summary.totalGeral).toBe(1580);
  });

  it("6) adiantamento nunca é somado como salário fixo", () => {
    const summary = summarizePersonnelCost([
      { category: "salario_fixo", amount: 1500 },
      { category: "adiantamento", amount: 100 },
    ]);
    expect(summary.porCategoria.salario_fixo).toBe(1500);
    expect(summary.porCategoria.adiantamento).toBe(100);
  });

  it("7) encargo (FGTS) nunca é somado como salário", () => {
    const summary = summarizePersonnelCost([
      { category: "salario_fixo", amount: 1500 },
      { category: "encargo", amount: 235.56 },
    ]);
    expect(summary.porCategoria.salario_fixo).toBe(1500);
    expect(summary.porCategoria.encargo).toBe(235.56);
    expect(summary.totalGeral).toBe(1735.56);
  });

  it("8) cálculo mensal de custo de pessoal soma corretamente todas as categorias presentes", () => {
    const summary = summarizePersonnelCost([
      { category: "salario_fixo", amount: 1500 },
      { category: "comissao", amount: 200 },
      { category: "bonus", amount: 50 },
      { category: "diaria_freelancer", amount: 80 },
      { category: "adiantamento", amount: 100 },
      { category: "encargo", amount: 235.56 },
    ]);
    expect(summary.totalGeral).toBe(2165.56);
    // categorias não usadas ficam em zero, nunca undefined/NaN
    expect(summary.porCategoria.rescisao).toBe(0);
    expect(summary.porCategoria.ferias).toBe(0);
  });

  it("9) benefício/auxílio (transporte+lanche) fica em categoria própria, nunca somado a salário/fixo, comissão ou bônus — Missão DP 20/09/2026", () => {
    const summary = summarizePersonnelCost([
      { category: "salario_fixo", amount: 2150 },
      { category: "beneficio_auxilio", amount: 450 },
      { category: "comissao", amount: 300 },
      { category: "bonus", amount: 50 },
    ]);
    expect(summary.porCategoria.beneficio_auxilio).toBe(450);
    expect(summary.porCategoria.salario_fixo).toBe(2150);
    expect(summary.porCategoria.comissao).toBe(300);
    expect(summary.porCategoria.bonus).toBe(50);
    // entra no custo total de pessoal
    expect(summary.totalGeral).toBe(2950);
  });

  it("lista vazia -> tudo zero, nunca NaN/undefined", () => {
    const summary = summarizePersonnelCost([]);
    expect(summary.totalGeral).toBe(0);
    expect(summary.porCategoria.salario_fixo).toBe(0);
  });
});

describe("groupPaymentsByCategory — Missão 86 (histórico do colaborador nunca soma cega)", () => {
  it("distingue diária/adiantamento/pagamento normal de um mesmo colaborador", () => {
    const payments = [
      { category: "diaria_freelancer" as const, amount: 80, id: "1" },
      { category: "adiantamento" as const, amount: 100, id: "2" },
      { category: "comissao" as const, amount: 1950, id: "3" },
    ];
    const grouped = groupPaymentsByCategory(payments);
    expect(grouped.diaria_freelancer).toHaveLength(1);
    expect(grouped.adiantamento).toHaveLength(1);
    expect(grouped.comissao).toHaveLength(1);
    expect(grouped.salario_fixo).toHaveLength(0);
  });

  it("beneficio_auxilio é reconhecido pelo domínio e agrupa separado de salario_fixo — Missão DP 20/09/2026", () => {
    const payments = [
      { category: "beneficio_auxilio" as const, amount: 450, id: "1" },
      { category: "salario_fixo" as const, amount: 2150, id: "2" },
    ];
    const grouped = groupPaymentsByCategory(payments);
    expect(grouped.beneficio_auxilio).toHaveLength(1);
    expect(grouped.beneficio_auxilio[0].amount).toBe(450);
    expect(grouped.salario_fixo).toHaveLength(1);
  });
});
