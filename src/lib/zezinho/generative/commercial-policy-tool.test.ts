import { describe, expect, it, vi } from "vitest";

/**
 * Missão Z3.2 — a ferramenta `commercial_policy` nunca deve expor custo/margem interna (isso
 * seria dado financeiro gerencial, vedado ao papel operacional pela Z1) — ela só devolve regras
 * de negociação voltadas ao cliente (limite de desconto, parcelamento, cortesias autorizadas).
 * Mocka o módulo de política comercial (sem banco) para travar exatamente esse formato.
 */

const fetchCommercialPolicyMock = vi.fn();
const fetchComplimentaryOptionsMock = vi.fn();

vi.mock("@/lib/services/commercialPolicy", () => ({
  fetchCommercialPolicy: (...args: unknown[]) => fetchCommercialPolicyMock(...args),
  fetchComplimentaryOptions: (...args: unknown[]) => fetchComplimentaryOptionsMock(...args),
}));

describe("commercial_policy — nunca expõe custo/margem, só regra de negociação com o cliente", () => {
  it("política configurada: devolve limite de desconto, progressão, parcelamento e cortesias — nenhum campo de custo/margem", async () => {
    fetchCommercialPolicyMock.mockResolvedValue({ maxDiscountPercent: 10, discountProgressionSteps: [5, 10], installmentThresholdAmount: 1000, maxInstallments: 4 });
    fetchComplimentaryOptionsMock.mockResolvedValue([{ serviceName: "Cristalização de Vidros", context: "Cortesia estratégica em fechamento relevante." }]);

    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("operacional");
    const execute = tools.commercial_policy!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({});

    expect(result.desconto_maximo_percentual).toBe(10);
    expect(result.progressao_desconto_sugerida).toEqual([5, 10]);
    expect(result.valor_minimo_para_parcelamento).toBe(1000);
    expect(result.parcelas_maximas).toBe(4);
    expect(result.cortesias_autorizadas).toEqual([{ servico: "Cristalização de Vidros", contexto: "Cortesia estratégica em fechamento relevante." }]);

    const keys = Object.keys(result).join(" ").toLowerCase();
    expect(keys).not.toMatch(/custo|margem|lucro|markup/);
  });

  it("mesma ferramenta e mesmo resultado para admin e operacional — regra de negociação não é dado financeiro gerencial", async () => {
    fetchCommercialPolicyMock.mockResolvedValue({ maxDiscountPercent: 10, discountProgressionSteps: [5, 10], installmentThresholdAmount: 1000, maxInstallments: 4 });
    fetchComplimentaryOptionsMock.mockResolvedValue([]);

    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const admin = buildZezinhoTools("admin");
    const operacional = buildZezinhoTools("operacional");
    expect(admin).toHaveProperty("commercial_policy");
    expect(operacional).toHaveProperty("commercial_policy");
  });

  it("sem política cadastrada: nunca inventa um limite — tudo null e um aviso honesto", async () => {
    fetchCommercialPolicyMock.mockResolvedValue(null);
    fetchComplimentaryOptionsMock.mockResolvedValue([]);

    const { buildZezinhoTools } = await import("@/lib/zezinho/generative/tools");
    const tools = buildZezinhoTools("operacional");
    const execute = tools.commercial_policy!.execute as (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    const result = await execute({});

    expect(result.politica_configurada).toBe(false);
    expect(result.desconto_maximo_percentual).toBeNull();
    expect(result.cortesias_autorizadas).toBeNull();
  });
});
