import { describe, expect, it } from "vitest";
import { buildActionPlan, buildActionPlans } from "@/lib/zezinho/directors/actionPlan";
import type { Recommendation } from "@/lib/zezinho/reasoning/types";

function recommendation(overrides: Partial<Recommendation> = {}): Recommendation {
  return { action: "Reforçar adicionais.", reason: "Ticket médio abaixo do esperado.", evidenceFactKeys: ["avgTicket"], priority: "alta", risk: null, howToVerify: "Comparar o ticket médio na próxima semana.", ...overrides };
}

describe("buildActionPlan — Plano de Ação (Sprint 5.0, Z2, decisão do usuário)", () => {
  it("todo plano recém-gerado nasce no estado 'identificado' — nenhuma transição sem persistência", () => {
    const plan = buildActionPlan("financeiro", recommendation(), 0);
    expect(plan.status).toBe("identificado");
  });

  it("responsible é sempre null — nenhum módulo de RH/equipe real existe ainda", () => {
    const plan = buildActionPlan("rh", recommendation(), 0);
    expect(plan.responsible).toBeNull();
  });

  it("suggestedDeadline é sempre null — nunca um prazo inventado sem base real", () => {
    const plan = buildActionPlan("financeiro", recommendation(), 0);
    expect(plan.suggestedDeadline).toBeNull();
  });

  it("prioridade e evidência vêm diretamente da recomendação que originou o plano", () => {
    const rec = recommendation({ priority: "media", evidenceFactKeys: ["cashEntradas", "cashSaidas"] });
    const plan = buildActionPlan("financeiro", rec, 0);
    expect(plan.priority).toBe("media");
    expect(plan.evidenceFactKeys).toEqual(["cashEntradas", "cashSaidas"]);
  });

  it("id é estável dentro da mesma execução e nunca colide entre índices diferentes", () => {
    const plan0 = buildActionPlan("financeiro", recommendation(), 0);
    const plan1 = buildActionPlan("financeiro", recommendation(), 1);
    expect(plan0.id).not.toBe(plan1.id);
  });
});

describe("buildActionPlans — um plano por recomendação", () => {
  it("gera exatamente um ActionPlan para cada Recommendation, na mesma ordem", () => {
    const recs = [recommendation({ action: "Ação 1" }), recommendation({ action: "Ação 2" })];
    const plans = buildActionPlans("estoque", recs);
    expect(plans.map((p) => p.action)).toEqual(["Ação 1", "Ação 2"]);
  });

  it("lista vazia de recomendações gera lista vazia de planos, nunca lança", () => {
    expect(buildActionPlans("estoque", [])).toEqual([]);
  });
});
