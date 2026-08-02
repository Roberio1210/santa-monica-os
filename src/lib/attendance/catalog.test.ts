import { describe, expect, it } from "vitest";
import {
  AREA_PROBLEM_CATALOG,
  PAINT_PROBLEMS,
  PAINT_PROBLEM_LABELS,
  RECOMMENDATION_CATEGORIES,
  WHEEL_PROBLEMS,
  WHEEL_PROBLEM_LABELS,
  recommendationCategoryLabel,
} from "@/lib/attendance/catalog";

describe("catálogo de problemas", () => {
  it("todo problema de pintura tem rótulo em português", () => {
    for (const problem of PAINT_PROBLEMS) {
      expect(PAINT_PROBLEM_LABELS[problem]).toBeTruthy();
    }
  });

  it("todo problema de roda tem rótulo em português", () => {
    for (const problem of WHEEL_PROBLEMS) {
      expect(WHEEL_PROBLEM_LABELS[problem]).toBeTruthy();
    }
  });

  it("só Pintura e Rodas têm catálogo de problema curado", () => {
    expect(Object.keys(AREA_PROBLEM_CATALOG).sort()).toEqual(["pintura", "rodas"]);
  });

  it("Martelinho não aparece — este módulo não reusa a taxonomia do domínio operacional", () => {
    expect(PAINT_PROBLEMS).not.toContain("martelinho");
  });
});

describe("recommendationCategoryLabel", () => {
  it("traduz todas as categorias conhecidas", () => {
    for (const category of RECOMMENDATION_CATEGORIES) {
      expect(recommendationCategoryLabel(category)).not.toBe(category);
    }
  });

  it("categoria desconhecida retorna o próprio valor, nunca lança", () => {
    expect(recommendationCategoryLabel("categoria-nova")).toBe("categoria-nova");
  });
});
