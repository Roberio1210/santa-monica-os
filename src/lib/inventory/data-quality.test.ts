import { describe, expect, it } from "vitest";
import { fetchDataQualitySummary } from "@/lib/inventory/data-quality";

describe("fetchDataQualitySummary (modo memória — 48 itens reais da contagem de 10/07/2026)", () => {
  it("identifica exatamente os 2 itens com medição pendente da contagem real, nunca inventados", async () => {
    const dq = await fetchDataQualitySummary();
    const ids = dq.measurementPending.map((i) => i.id).sort();
    expect(ids).toEqual(["composto-polidor-extra-forte-corte-farben", "hard-cleaner-wax-xtreme-expert"].sort());
  });

  it("nenhum item da contagem original tem custo ou estoque mínimo cadastrado — nunca inventados na Fase A", async () => {
    const dq = await fetchDataQualitySummary();
    expect(dq.withoutCost).toHaveLength(48);
    expect(dq.withoutMinimum).toHaveLength(48);
  });

  it("sem Postgres configurado, serviços/receitas/mapeamentos ficam honestamente vazios — nunca mocados", async () => {
    const dq = await fetchDataQualitySummary();
    expect(dq.servicesWithoutRecipe).toEqual([]);
    expect(dq.pendingMappings).toEqual([]);
  });
});
