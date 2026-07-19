import { describe, expect, it } from "vitest";
import { inferObjective } from "@/lib/zezinho/objective/infer";
import { EMPTY_REASONING_SESSION } from "@/lib/zezinho/memory/types";
import type { ReasoningSession } from "@/lib/zezinho/memory/types";
import type { ExtractedEntities } from "@/lib/zezinho/intent/types";

function entities(overrides: Partial<ExtractedEntities> = {}): ExtractedEntities {
  return { comparison: null, singlePeriod: null, areaFilter: null, packageMentioned: null, topic: null, ...overrides };
}

describe("inferObjective — mapeamento direto de entidade", () => {
  it("pacote Silver mencionado -> improve_service_mix", () => {
    const result = inferObjective("evaluate_decision", entities({ packageMentioned: "Silver" }), EMPTY_REASONING_SESSION);
    expect(result.objective).toBe("improve_service_mix");
    expect(result.dataAvailability).toBe("real");
  });

  it("tópico preço -> evaluate_pricing", () => {
    const result = inferObjective("evaluate_decision", entities({ topic: "preco" }), EMPTY_REASONING_SESSION);
    expect(result.objective).toBe("evaluate_pricing");
  });

  it("tópico equipe -> staffing_capacity, marcado como proxy_only (sem módulo de RH real)", () => {
    const result = inferObjective("evaluate_decision", entities({ topic: "equipe" }), EMPTY_REASONING_SESSION);
    expect(result.objective).toBe("staffing_capacity");
    expect(result.dataAvailability).toBe("proxy_only");
  });

  it("tópico clientes -> client_retention, real (fetchCrmCustomers já existe)", () => {
    const result = inferObjective("recommend", entities({ topic: "clientes" }), EMPTY_REASONING_SESSION);
    expect(result.objective).toBe("client_retention");
    expect(result.dataAvailability).toBe("real");
  });

  it("tópico caixa -> improve_cash_flow", () => {
    const result = inferObjective("diagnose", entities({ topic: "caixa" }), EMPTY_REASONING_SESSION);
    expect(result.objective).toBe("improve_cash_flow");
  });
});

describe("inferObjective — reaproveitamento de contexto (bug fix da sprint anterior)", () => {
  it("'recommend' sem entidade nova reaproveita o objetivo da última análise, não reinfere", () => {
    const memory: ReasoningSession = { ...EMPTY_REASONING_SESSION, activeObjective: "improve_service_mix" };
    const result = inferObjective("recommend", entities(), memory);
    expect(result.objective).toBe("improve_service_mix");
    expect(result.reused).toBe(true);
  });

  it("'recommend' sem entidade nova e sem objetivo herdado cai no padrão business_health", () => {
    const result = inferObjective("recommend", entities(), EMPTY_REASONING_SESSION);
    expect(result.objective).toBe("business_health");
    expect(result.reused).toBe(false);
  });

  it("'explain' sem entidade nova reaproveita o objetivo da análise em andamento", () => {
    const memory: ReasoningSession = { ...EMPTY_REASONING_SESSION, activeObjective: "evaluate_pricing" };
    const result = inferObjective("explain", entities(), memory);
    expect(result.objective).toBe("evaluate_pricing");
    expect(result.reused).toBe(true);
  });

  it("uma entidade nova (ex.: pacote citado) tem prioridade sobre o objetivo herdado", () => {
    const memory: ReasoningSession = { ...EMPTY_REASONING_SESSION, activeObjective: "improve_cash_flow" };
    const result = inferObjective("recommend", entities({ packageMentioned: "Gold" }), memory);
    expect(result.objective).toBe("improve_service_mix");
    expect(result.reused).toBe(false);
  });
});

describe("inferObjective — fallback padrão", () => {
  it("diagnose sem nenhuma entidade -> business_health", () => {
    const result = inferObjective("diagnose", entities(), EMPTY_REASONING_SESSION);
    expect(result.objective).toBe("business_health");
  });

  it("inform nunca precisa de objetivo derivado", () => {
    const result = inferObjective("inform", entities(), EMPTY_REASONING_SESSION);
    expect(result.objective).toBeNull();
  });

  it("clarify_needed nunca precisa de objetivo derivado", () => {
    const result = inferObjective("clarify_needed", entities(), EMPTY_REASONING_SESSION);
    expect(result.objective).toBeNull();
  });
});
