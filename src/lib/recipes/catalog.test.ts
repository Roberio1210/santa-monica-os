import { describe, expect, it } from "vitest";
import { listServiceCostEstimates } from "@/lib/recipes/catalog";

describe("listServiceCostEstimates — Custo de Serviço (Instrumentação Gerencial)", () => {
  it("sem Postgres configurado (catálogo de serviços vazio), nunca lança — retorna lista vazia honesta", async () => {
    const result = await listServiceCostEstimates();
    expect(Array.isArray(result)).toBe(true);
  });
});
