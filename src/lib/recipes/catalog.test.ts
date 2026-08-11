import { describe, expect, it } from "vitest";
import { listServiceCostEstimates, matchServiceCostEstimateForCategory, type ServiceCostSummary } from "@/lib/recipes/catalog";

describe("listServiceCostEstimates — Custo de Serviço (Instrumentação Gerencial)", () => {
  it("sem Postgres configurado (catálogo de serviços vazio), nunca lança — retorna lista vazia honesta", async () => {
    const result = await listServiceCostEstimates();
    expect(Array.isArray(result)).toBe(true);
  });
});

describe("matchServiceCostEstimateForCategory — conectar categoria JumpPark ao custo do serviço (Fechamento de Lacunas Operacionais)", () => {
  const estimates: ServiceCostSummary[] = [
    { serviceId: "svc-gold", serviceName: "Gold", estimate: { knownCost: 49, lines: [], isPartial: false, partialReason: null } },
  ];

  it("usa mapeamento humano confirmado quando existe", () => {
    const result = matchServiceCostEstimateForCategory(
      "Lavação Gold",
      [{ jumpparkServiceName: "Lavação Gold", canonicalServiceId: "svc-gold", status: "mapeado" }],
      estimates,
    );
    expect(result.mapped).toBe(true);
    expect(result.summary?.serviceId).toBe("svc-gold");
  });

  it("ignora mapeamento não confirmado — nunca usa status 'nao_mapeado' como se fosse real", () => {
    const result = matchServiceCostEstimateForCategory(
      "Lavação Gold",
      [{ jumpparkServiceName: "Lavação Gold", canonicalServiceId: "svc-gold", status: "nao_mapeado" }],
      estimates,
    );
    expect(result.mapped).toBe(false);
    expect(result.summary).toBeNull();
  });

  it("cai para nome exatamente igual (case/acento insensível) quando não há mapeamento confirmado", () => {
    const result = matchServiceCostEstimateForCategory("gold", [], estimates);
    expect(result.mapped).toBe(true);
    expect(result.summary?.serviceId).toBe("svc-gold");
  });

  it("nunca adivinha por aproximação — categoria sem mapeamento e sem nome exato retorna não mapeado", () => {
    const result = matchServiceCostEstimateForCategory("Lavação Premium Especial", [], estimates);
    expect(result.mapped).toBe(false);
    expect(result.summary).toBeNull();
  });
});
