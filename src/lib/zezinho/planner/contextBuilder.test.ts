import { describe, expect, it } from "vitest";
import { buildOperationalContext } from "@/lib/zezinho/planner/contextBuilder";
import { EMPTY_REASONING_SESSION } from "@/lib/zezinho/memory/types";
import type { ExtractedEntities } from "@/lib/zezinho/intent/types";

function entities(overrides: Partial<ExtractedEntities> = {}): ExtractedEntities {
  return { comparison: null, singlePeriod: null, areaFilter: null, packageMentioned: null, topic: null, ...overrides };
}

describe("buildOperationalContext — deduplicação de ferramentas (Sprint 4.0, Z3, seção 5)", () => {
  it("duas capacidades que apontam para a mesma ferramenta (staffing_capacity e jumppark_period_summary) só chamam a ferramenta uma vez", async () => {
    const context = await buildOperationalContext(["staffing_capacity", "jumppark_period_summary"], entities({ singlePeriod: { key: "today", from: "2026-07-24", to: "2026-07-24", label: "Hoje" } }), EMPTY_REASONING_SESSION, "admin");
    const jumpparkCalls = context.toolCalls.filter((c) => c.id === "jumppark_period_summary");
    expect(jumpparkCalls.length).toBe(1);
    expect(context.byCapability.staffing_capacity).toBe(context.byCapability.jumppark_period_summary);
  });

  it("crm_summary reaproveita o mesmo resultado da ferramenta crm_customers", async () => {
    const context = await buildOperationalContext(["crm_summary"], entities(), EMPTY_REASONING_SESSION, "admin");
    expect(context.byCapability.crm_summary?.id).toBe("crm_customers");
  });

  it("ferramentas que exigem período nunca são chamadas sem nenhum período resolvido", async () => {
    const context = await buildOperationalContext(["jumppark_period_summary"], entities(), EMPTY_REASONING_SESSION, "admin");
    expect(context.toolCalls).toEqual([]);
    expect(context.periodResolved).toBe(false);
  });

  it("situational_context nunca depende de período nem de JumpPark — sempre responde", async () => {
    const context = await buildOperationalContext(["situational_context"], entities(), EMPTY_REASONING_SESSION, "admin");
    expect(context.byCapability.situational_context?.status).toBe("ok");
  });

  it("capacidades sem fonte real (agenda_summary, marketing_summary, unanswered_clients) sempre voltam not_configured, nunca inventam dado", async () => {
    const context = await buildOperationalContext(["agenda_summary", "marketing_summary", "unanswered_clients"], entities(), EMPTY_REASONING_SESSION, "admin");
    expect(context.byCapability.agenda_summary?.status).toBe("not_configured");
    expect(context.byCapability.marketing_summary?.status).toBe("not_configured");
    expect(context.byCapability.unanswered_clients?.status).toBe("not_configured");
  });

  it("lista de capacidades vazia não chama nenhuma ferramenta", async () => {
    const context = await buildOperationalContext([], entities(), EMPTY_REASONING_SESSION, "admin");
    expect(context.toolCalls).toEqual([]);
    expect(context.toolResults).toEqual([]);
  });
});
