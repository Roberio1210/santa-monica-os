import { describe, expect, it, vi } from "vitest";
import type { ServiceCatalogEntry } from "@/lib/services/catalog";

/**
 * Achado real da Missão Z3 (validação com chamada real ao modelo): mesmo com a instrução no
 * system prompt para nunca inventar qualificador em "etapas_incluidas", o modelo (openai/gpt-oss-
 * 20b) ainda acrescentou palavras extras (ex.: "shampoo" -> "Shampoo exterior"). Correção:
 * repetir a instrução COLADA ao próprio dado (campo `aviso_etapas_incluidas`), não só no system
 * prompt geral — modelos pequenos tendem a seguir mais uma instrução próxima do dado. Este teste
 * mocka `searchServiceCatalog` (sem precisar de banco) para travar o formato exato desse aviso.
 */

const searchServiceCatalogMock = vi.fn();

vi.mock("@/lib/services/catalog", () => ({
  searchServiceCatalog: (...args: unknown[]) => searchServiceCatalogMock(...args),
}));

function entry(overrides: Partial<ServiceCatalogEntry>): ServiceCatalogEntry {
  return {
    id: "id",
    name: "Gold",
    category: "Pacote",
    defaultPrice: null,
    priceVariants: [],
    shortDescription: null,
    detailedDescription: null,
    estimatedDurationMinutes: null,
    benefits: null,
    indications: null,
    restrictions: null,
    requiresInspection: false,
    operationalSteps: [],
    ...overrides,
  };
}

describe("service_catalog_search — etapas_incluidas nunca ganha qualificador inventado", () => {
  it("serviço com etapas cadastradas: nomes humanizados (snake_case -> espaço) + aviso explícito colado ao dado", async () => {
    searchServiceCatalogMock.mockResolvedValue([entry({ operationalSteps: ["shampoo", "protecao_externa"] })]);
    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("operacional");
    const execute = tools.service_catalog_search!.execute as (input: Record<string, unknown>) => Promise<{ servicos: Array<Record<string, unknown>> }>;

    const result = await execute({});
    expect(result.servicos[0].etapas_incluidas).toEqual(["shampoo", "protecao externa"]);
    expect(result.servicos[0].aviso_etapas_incluidas).toMatch(/EXATAMENTE/);
    expect(result.servicos[0].aviso_etapas_incluidas).toMatch(/não acrescente/i);
  });

  it("serviço sem etapas cadastradas: null em ambos os campos, nunca um aviso vazio confuso", async () => {
    searchServiceCatalogMock.mockResolvedValue([entry({ operationalSteps: [] })]);
    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("operacional");
    const execute = tools.service_catalog_search!.execute as (input: Record<string, unknown>) => Promise<{ servicos: Array<Record<string, unknown>> }>;

    const result = await execute({});
    expect(result.servicos[0].etapas_incluidas).toBeNull();
    expect(result.servicos[0].aviso_etapas_incluidas).toBeNull();
  });
});
