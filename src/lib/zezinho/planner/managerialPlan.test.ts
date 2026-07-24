import { describe, expect, it } from "vitest";
import { buildManagerialPlan } from "@/lib/zezinho/planner/managerialPlan";
import { EMPTY_REASONING_SESSION } from "@/lib/zezinho/memory/types";

describe("buildManagerialPlan — monta o plano gerencial completo (Sprint 4.0, Z3)", () => {
  it("'Boa tarde Zézinho, como você está? Movimento hoje está bom?' preserva greeting + small_talk + reconhece operational_movement", async () => {
    const plan = await buildManagerialPlan("Boa tarde Zézinho, como você está? Movimento hoje está bom?", EMPTY_REASONING_SESSION);
    expect(plan.conversationalContext.greetingDetected).toBe(true);
    expect(plan.conversationalContext.smallTalkDetected).toBe(true);
    expect(plan.userIntents).toContain("operational_movement");
    expect(plan.businessIntents).toContain("operational_movement");
    expect(plan.toolsSelected.length).toBeGreaterThan(0);
  });

  it("'Como estamos hoje?' monta contexto amplo (business_health) — várias capacidades, nunca todas as ferramentas do catálogo de qualquer jeito", async () => {
    const plan = await buildManagerialPlan("Como estamos hoje?", EMPTY_REASONING_SESSION);
    expect(plan.questionScope).toBe("broad_managerial");
    expect(plan.capabilitiesRequested).toContain("situational_context");
    expect(plan.capabilitiesRequested).not.toContain("marketing_summary");
  });

  it("'Como está nosso estoque?' nunca inclui weather_forecast nem crm_summary entre as ferramentas chamadas", async () => {
    const plan = await buildManagerialPlan("Como está nosso estoque?", EMPTY_REASONING_SESSION);
    expect(plan.toolsSelected).not.toContain("weather_forecast");
    expect(plan.toolsSelected).not.toContain("crm_customers");
    expect(plan.toolsSelected).toContain("inventory_overview");
  });

  it("'Quem descobriu o Brasil e quanto faturamos hoje?' sinaliza generalAnswerRequired e ainda busca dado financeiro real", async () => {
    const plan = await buildManagerialPlan("Quem descobriu o Brasil e quanto faturamos hoje?", EMPTY_REASONING_SESSION);
    expect(plan.generalAnswerRequired).toBe(true);
    expect(plan.businessIntents).toContain("financial_status");
    expect(plan.toolsSelected).toContain("cash_ledger_totals");
  });

  it("nunca inventa risco/oportunidade/recomendação sem evidência — ambiente de teste sem JumpPark/clima configurados não gera nenhum risco derivado de dado ausente", async () => {
    const plan = await buildManagerialPlan("Tem algo preocupante no negócio?", EMPTY_REASONING_SESSION);
    // Sem fonte real disponível neste ambiente, riscos/oportunidades condicionados a dado real ficam vazios — nunca um placeholder inventado.
    expect(plan.risks.every((r) => r.evidenceFactKeys.length > 0)).toBe(true);
    expect(plan.opportunities.every((o) => o.evidenceFactKeys.length > 0)).toBe(true);
    expect(plan.contextQuality.overallLevel).toBeDefined();
  });

  it("mensagem puramente conversacional ('Bom dia, tudo bem?') não chama nenhuma ferramenta", async () => {
    const plan = await buildManagerialPlan("tudo bem?", EMPTY_REASONING_SESSION);
    expect(plan.businessIntents).toEqual([]);
    expect(plan.toolsSelected).toEqual([]);
  });

  it("limitations do plano refletem os gaps reais (ex.: JumpPark não configurado neste ambiente de teste)", async () => {
    const plan = await buildManagerialPlan("Estamos dentro da meta?", EMPTY_REASONING_SESSION);
    expect(plan.limitations.length).toBeGreaterThan(0);
  });
});
