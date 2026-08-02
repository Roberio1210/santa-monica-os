import { describe, expect, it } from "vitest";
import { RECOMMENDATION_CATEGORIES, recommendationCategoryLabel } from "@/lib/attendance/catalog";

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
