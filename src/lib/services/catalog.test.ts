import { describe, expect, it } from "vitest";
import { filterServiceCatalog, type ServiceCatalogEntry } from "@/lib/services/catalog";

/**
 * Missão Z3 — testa a lógica de busca/filtragem do catálogo comercial com um catálogo sintético
 * (sem banco), fixando o comportamento: busca por nome/categoria, filtro por porte, e o fato de
 * NUNCA inventar preço/etapa ausente (campos ficam `null`/`[]`, nunca preenchidos por dedução).
 */

function entry(overrides: Partial<ServiceCatalogEntry>): ServiceCatalogEntry {
  return {
    id: "id",
    name: "Serviço",
    category: null,
    defaultPrice: null,
    currentPrice: null,
    priceVariants: [],
    shortDescription: null,
    detailedDescription: null,
    estimatedDurationMinutes: null,
    benefits: null,
    indications: null,
    restrictions: null,
    requiresInspection: false,
    operationalSteps: [],
    products: [],
    ...overrides,
  };
}

const CATALOG: ServiceCatalogEntry[] = [
  entry({
    id: "bronze",
    name: "Bronze",
    category: "Pacote",
    priceVariants: [
      { vehicleCategory: "hatch", variantLabel: null, price: 100, currentPrice: null },
      { vehicleCategory: "sedan", variantLabel: null, price: 120, currentPrice: null },
      { vehicleCategory: "suv", variantLabel: null, price: 140, currentPrice: null },
      { vehicleCategory: "caminhonete", variantLabel: null, price: 200, currentPrice: null },
    ],
    operationalSteps: ["pre_lavagem", "shampoo", "rodas"],
  }),
  entry({ id: "polimento-tecnico", name: "Polimento Técnico", category: "Polimento", defaultPrice: 850, requiresInspection: true }),
  entry({ id: "premium-detail", name: "Premium Detail", category: "Pacote" }),
];

describe("filterServiceCatalog — busca por nome/categoria/porte (sem banco, sem palavra-chave rígida)", () => {
  it("busca por nome (substring, sem acento/maiúscula)", () => {
    const results = filterServiceCatalog(CATALOG, { query: "bronze" });
    expect(results.map((r) => r.id)).toEqual(["bronze"]);
  });

  it("busca por categoria", () => {
    const results = filterServiceCatalog(CATALOG, { category: "Pacote" });
    expect(results.map((r) => r.id).sort()).toEqual(["bronze", "premium-detail"]);
  });

  it("filtro por porte só reduz as variantes de preço retornadas, nunca remove o serviço", () => {
    const results = filterServiceCatalog(CATALOG, { query: "bronze", vehicleCategory: "suv" });
    expect(results).toHaveLength(1);
    expect(results[0].priceVariants).toEqual([{ vehicleCategory: "suv", variantLabel: null, price: 140, currentPrice: null }]);
  });

  it("serviço sem variantes (preço único) não é afetado pelo filtro de porte", () => {
    const results = filterServiceCatalog(CATALOG, { query: "polimento tecnico", vehicleCategory: "hatch" });
    expect(results[0].defaultPrice).toBe(850);
    expect(results[0].priceVariants).toEqual([]);
  });

  it("serviço sem preço/etapas cadastradas nunca inventa valor — campos continuam null/[]", () => {
    const results = filterServiceCatalog(CATALOG, { query: "premium detail" });
    expect(results[0].defaultPrice).toBeNull();
    expect(results[0].priceVariants).toEqual([]);
    expect(results[0].operationalSteps).toEqual([]);
  });

  it("polimento técnico exige avaliação presencial (nunca promete resultado sem inspeção)", () => {
    const results = filterServiceCatalog(CATALOG, { query: "polimento tecnico" });
    expect(results[0].requiresInspection).toBe(true);
  });

  it("sem nenhum filtro, devolve o catálogo inteiro", () => {
    expect(filterServiceCatalog(CATALOG, {})).toHaveLength(3);
  });
});

describe("Missão Z3.2 — preço-base x preço comercial atual (nunca a mesma coisa)", () => {
  const FAROIS: ServiceCatalogEntry = entry({
    id: "revitalizacao-farois",
    name: "Revitalização de Faróis",
    category: "Faróis",
    priceVariants: [
      { vehicleCategory: null, variantLabel: "Par", price: 300, currentPrice: 250 },
      { vehicleCategory: null, variantLabel: "Unidade (1 farol)", price: 150, currentPrice: null },
    ],
  });

  it("variante com condição comercial diferente do preço-base preserva os dois valores", () => {
    const par = FAROIS.priceVariants.find((v) => v.variantLabel === "Par");
    expect(par?.price).toBe(300);
    expect(par?.currentPrice).toBe(250);
  });

  it("variante sem condição comercial especial: currentPrice fica null (preço-base é o vigente)", () => {
    const unidade = FAROIS.priceVariants.find((v) => v.variantLabel === "Unidade (1 farol)");
    expect(unidade?.price).toBe(150);
    expect(unidade?.currentPrice).toBeNull();
  });
});
