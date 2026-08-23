import { describe, expect, it, vi } from "vitest";
import type { ServiceCatalogEntry } from "@/lib/services/catalog";

/**
 * Missão Z3.3 — gerente operacional: serviço → etapa → produto homologado → estoque real. Estes
 * testes fixam o COMPORTAMENTO da camada de mapeamento (`tools.ts`) com catálogos sintéticos —
 * nunca provam que os DADOS reais do banco de produção refletem essas regras (isso foi
 * confirmado por auditoria direta ao Postgres real, ver relatório da missão: seed idempotente
 * `service-products-operational-2026-08-23.ts` rodado com zero avisos). O que este arquivo
 * garante é que, uma vez que o catálogo diga X, o Zézinho recebe exatamente X — nunca inventa,
 * nunca esconde, nunca substitui silenciosamente.
 */

const searchServiceCatalogMock = vi.fn();

vi.mock("@/lib/services/catalog", () => ({
  searchServiceCatalog: (...args: unknown[]) => searchServiceCatalogMock(...args),
}));

function entry(overrides: Partial<ServiceCatalogEntry>): ServiceCatalogEntry {
  return {
    id: "id",
    name: "Serviço",
    category: "Pacote",
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

async function execute(entries: ServiceCatalogEntry[]) {
  searchServiceCatalogMock.mockResolvedValue(entries);
  const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
  const tools = buildZezinhoTools("operacional");
  const run = tools.service_catalog_search!.execute as (input: Record<string, unknown>) => Promise<{ servicos: Array<Record<string, unknown>> }>;
  return run({});
}

describe("Missão Z3.3 — TESTE 1: Bronze não possui cera", () => {
  it("catálogo sem a etapa 'cera' para Bronze -> etapas_incluidas nunca menciona cera", async () => {
    const result = await execute([entry({ id: "bronze", name: "Bronze", operationalSteps: ["pre_lavagem", "shampoo", "rodas", "pneus"] })]);
    expect(result.servicos[0].etapas_incluidas).not.toContain("cera");
  });
});

describe("Missão Z3.3 — TESTE 2: Silver possui cera líquida homologada", () => {
  it("produtos da Silver incluem a linha Blend (Vonixx) com papel de cera líquida", async () => {
    const result = await execute([
      entry({
        id: "silver",
        name: "Silver",
        products: [
          { productName: "Blend Cera de Carnaúba Spray", brand: "Vonixx", role: "Proteção com cera líquida — linha Blend (Vonixx)", isAlternative: false, variantLabel: null, durabilityLabel: null, estoque: { quantidadeAtual: 1000, unidade: "ml", disponivel: true, status: "ok" } },
        ],
      }),
    ]);
    const produtos = result.servicos[0].produtos as Array<Record<string, unknown>>;
    expect(produtos.some((p) => /cera líquida/i.test(p.papel as string))).toBe(true);
  });
});

describe("Missão Z3.3 — TESTE 3: Gold possui proteção de nível superior", () => {
  it("produtos da Gold incluem opção de proteção de pintura descrita como nível superior", async () => {
    const result = await execute([
      entry({
        id: "gold",
        name: "Gold",
        products: [
          { productName: "Hidrofast Nano Selante", brand: "Jaça", role: "Proteção de pintura de nível superior — Hidrofast (Jaça)", isAlternative: false, variantLabel: null, durabilityLabel: null, estoque: { quantidadeAtual: 250, unidade: "ml", disponivel: true, status: "ok" } },
        ],
      }),
    ]);
    const produtos = result.servicos[0].produtos as Array<Record<string, unknown>>;
    expect(produtos.some((p) => /nível superior/i.test(p.papel as string))).toBe(true);
  });
});

describe("Missão Z3.3 — TESTE 4: Glass Farben pode ser usado nos três pacotes", () => {
  it("Bronze, Silver e Gold recebem o mesmo produto de limpeza de vidros, sem variação artificial", async () => {
    const glass = { productName: "Glass Limpa Vidros", brand: "Farben", role: "Limpeza de vidros (comum aos três pacotes)", isAlternative: false, variantLabel: null, durabilityLabel: null, estoque: { quantidadeAtual: 6000, unidade: "ml", disponivel: true, status: "ok" as const } };
    const result = await execute([
      entry({ id: "bronze", name: "Bronze", products: [glass] }),
      entry({ id: "silver", name: "Silver", products: [glass] }),
      entry({ id: "gold", name: "Gold", products: [glass] }),
    ]);
    for (const s of result.servicos) {
      const produtos = s.produtos as Array<Record<string, unknown>>;
      expect(produtos.some((p) => p.produto === "Glass Limpa Vidros")).toBe(true);
    }
  });
});

describe("Missão Z3.3 — TESTE 5: pré-lavagem/shampoo não diferenciados entre pacotes", () => {
  it("Bronze, Silver e Gold têm exatamente os mesmos nomes de etapa 'pre_lavagem'/'shampoo', sem sufixo por pacote", async () => {
    const result = await execute([
      entry({ id: "bronze", name: "Bronze", operationalSteps: ["pre_lavagem", "shampoo"] }),
      entry({ id: "silver", name: "Silver", operationalSteps: ["pre_lavagem", "shampoo"] }),
      entry({ id: "gold", name: "Gold", operationalSteps: ["pre_lavagem", "shampoo"] }),
    ]);
    for (const s of result.servicos) {
      expect(s.etapas_incluidas).toEqual(["pre lavagem", "shampoo"]);
    }
  });
});

describe("Missão Z3.3 — TESTE 6: Gold possui revitalização de plásticos (diferencial real)", () => {
  it("produtos da Gold incluem revitalização de plásticos como diferencial explícito", async () => {
    const result = await execute([
      entry({
        id: "gold",
        name: "Gold",
        products: [{ productName: "Plástico Revitalizador de Plásticos", brand: "Farben", role: "Revitalização de plásticos — diferencial da Gold em relação a Bronze/Silver", isAlternative: false, variantLabel: null, durabilityLabel: null, estoque: { quantidadeAtual: 2500, unidade: "ml", disponivel: true, status: "ok" } }],
      }),
    ]);
    const produtos = result.servicos[0].produtos as Array<Record<string, unknown>>;
    expect(produtos.some((p) => /revitaliza..o de pl.sticos/i.test(p.papel as string) && /diferencial/i.test(p.papel as string))).toBe(true);
  });
});

describe("Missão Z3.3 — TESTE 7: Gold utiliza opção superior de produto para pneus", () => {
  it("produtos de pneu da Gold são Dub Boyz/Evo, nunca o produto padrão de Bronze/Silver", async () => {
    const result = await execute([
      entry({
        id: "gold",
        name: "Gold",
        products: [
          { productName: "Good Shine", brand: "DUB Boyz", role: "Revitalizador/pretinho de pneus — opção de nível superior (Dub Boyz)", isAlternative: false, variantLabel: null, durabilityLabel: null, estoque: { quantidadeAtual: 0, unidade: "ml", disponivel: false, status: "sem_minimo" } },
          { productName: "Luminous Black", brand: "EVO Auto", role: "Revitalizador/pretinho de pneus — opção de nível superior (Evo)", isAlternative: true, variantLabel: null, durabilityLabel: null, estoque: { quantidadeAtual: 0, unidade: "ml", disponivel: false, status: "sem_minimo" } },
        ],
      }),
    ]);
    const produtos = result.servicos[0].produtos as Array<Record<string, unknown>>;
    expect(produtos.map((p) => p.produto).sort()).toEqual(["Good Shine", "Luminous Black"]);
    expect(produtos.every((p) => !/farben/i.test(p.papel as string))).toBe(true);
  });
});

describe("Missão Z3.3 — TESTE 8: V-Plastic tem proteção de até 2 anos (correção da Z3.2)", () => {
  it("durabilidade_aproximada da Vitrificação de Plásticos é 'até 2 anos', nunca 'até 1 ano'", async () => {
    const result = await execute([
      entry({
        id: "vitrificacao-plasticos",
        name: "Vitrificação de Plásticos",
        products: [{ productName: "V-Plastic Vitrificador de Plásticos", brand: "Vonixx", role: "Vitrificador de plásticos", isAlternative: false, variantLabel: null, durabilityLabel: "até 2 anos", estoque: { quantidadeAtual: 5, unidade: "L", disponivel: true, status: "ok" } }],
      }),
    ]);
    const produtos = result.servicos[0].produtos as Array<Record<string, unknown>>;
    expect(produtos[0].durabilidade_aproximada).toBe("até 2 anos");
  });
});

describe("Missão Z3.3 — TESTE 9: Vitrificação de Couro tem as 3 opções homologadas corretas", () => {
  it("V-Leather/Pro Supera/CQuartz Leather 2.0, todas nunca cadastradas no estoque real", async () => {
    const result = await execute([
      entry({
        id: "vitrificacao-couro",
        name: "Vitrificação de Couro",
        products: [
          { productName: "V-Leather / V-Leather Pro", brand: "Vonixx", role: "Vitrificador de couro homologado", isAlternative: false, variantLabel: null, durabilityLabel: "~1 ano", estoque: null },
          { productName: "Pro Supera", brand: "Alcance", role: "Vitrificador de couro homologado", isAlternative: true, variantLabel: null, durabilityLabel: "~1 ano", estoque: null },
          { productName: "CQuartz Leather 2.0", brand: "CarPro", role: "Vitrificador de couro homologado", isAlternative: true, variantLabel: null, durabilityLabel: "1 a 2 anos", estoque: null },
        ],
      }),
    ]);
    const produtos = result.servicos[0].produtos as Array<Record<string, unknown>>;
    expect(produtos).toHaveLength(3);
    expect(produtos.every((p) => p.nunca_cadastrado_no_estoque === true && p.disponivel_em_estoque === false)).toBe(true);
    expect(produtos.map((p) => p.produto).sort()).toEqual(["CQuartz Leather 2.0", "Pro Supera", "V-Leather / V-Leather Pro"]);
  });
});

describe("Missão Z3.3 — TESTE 10: Vitrificação da pintura 1-5 anos com produtos homologados corretos", () => {
  it("cada variante de duração devolve seus próprios produtos homologados, nunca misturados entre durações", async () => {
    const result = await execute([
      entry({
        id: "vitrificacao",
        name: "Vitrificação",
        priceVariants: [
          { vehicleCategory: null, variantLabel: "1 ano", price: 1300, currentPrice: null },
          { vehicleCategory: null, variantLabel: "4 anos", price: 2800, currentPrice: null },
        ],
        products: [
          { productName: "Insignia Light Vitrificador", brand: "EasyTech", role: "Vitrificador homologado para a duração de 1 ano", isAlternative: false, variantLabel: "1 ano", durabilityLabel: null, estoque: { quantidadeAtual: 10, unidade: "unidade", disponivel: true, status: "ok" } },
          { productName: "Sonax CC Pro Paint Ceramic Coat", brand: "Sonax", role: "Vitrificador homologado para a duração de 4 anos", isAlternative: false, variantLabel: "4 anos", durabilityLabel: null, estoque: { quantidadeAtual: 37.5, unidade: "ml", disponivel: true, status: "ok" } },
          { productName: "V-Energy Pro", brand: "Vonixx", role: "Vitrificador homologado para a duração de 4 anos", isAlternative: true, variantLabel: "4 anos", durabilityLabel: null, estoque: null },
        ],
      }),
    ]);
    const produtos = result.servicos[0].produtos as Array<Record<string, unknown>>;
    const umAno = produtos.filter((p) => p.variante === "1 ano");
    const quatroAnos = produtos.filter((p) => p.variante === "4 anos");
    expect(umAno.map((p) => p.produto)).toEqual(["Insignia Light Vitrificador"]);
    expect(quatroAnos.map((p) => p.produto).sort()).toEqual(["Sonax CC Pro Paint Ceramic Coat", "V-Energy Pro"]);
  });
});

describe("Missão Z3.3 — TESTE 11: produto homologado mas zerado NUNCA é informado como disponível", () => {
  it("quantidade_atual = 0 -> disponivel_em_estoque sempre false", async () => {
    const result = await execute([
      entry({
        id: "gold",
        name: "Gold",
        products: [{ productName: "Good Shine", brand: "DUB Boyz", role: "Revitalizador de pneus", isAlternative: false, variantLabel: null, durabilityLabel: null, estoque: { quantidadeAtual: 0, unidade: "ml", disponivel: false, status: "sem_minimo" } }],
      }),
    ]);
    const produtos = result.servicos[0].produtos as Array<Record<string, unknown>>;
    expect(produtos[0].quantidade_atual).toBe(0);
    expect(produtos[0].disponivel_em_estoque).toBe(false);
  });
});

describe("Missão Z3.3 — TESTE 12: produto do estoque não homologado nunca é associado automaticamente", () => {
  it("serviço sem nenhum vínculo confirmado -> produtos null, nunca inventado a partir do estoque geral", async () => {
    const result = await execute([entry({ id: "lavagem-motor", name: "Lavagem de Motor", products: [] })]);
    expect(result.servicos[0].produtos).toBeNull();
  });
});
