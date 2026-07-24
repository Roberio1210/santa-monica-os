import { describe, expect, it } from "vitest";
import { BUSINESS_INTENTS } from "@/lib/zezinho/intent/managerial";
import { CAPABILITY_TOOL, capabilitiesForIntent, capabilitiesForRecommendation, INTENT_CAPABILITIES } from "@/lib/zezinho/planner/capabilities";
import { TOOL_REGISTRY } from "@/lib/zezinho/tools/registry";

describe("CAPABILITY_TOOL — toda capacidade aponta para uma ferramenta real do catálogo", () => {
  it("cada Capability tem um ToolId que existe em TOOL_REGISTRY", () => {
    for (const toolId of Object.values(CAPABILITY_TOOL)) {
      expect(TOOL_REGISTRY[toolId]).toBeDefined();
    }
  });
});

describe("INTENT_CAPABILITIES — matriz intenção -> capacidades (seção 4)", () => {
  it("toda intenção de negócio (exceto recommendation, resolvida por domínio) tem uma entrada na matriz", () => {
    for (const intent of BUSINESS_INTENTS) {
      if (intent === "recommendation") continue;
      expect(INTENT_CAPABILITIES[intent]).toBeDefined();
      expect(INTENT_CAPABILITIES[intent]!.length).toBeGreaterThan(0);
    }
  });

  it("inventory_status nunca inclui weather_forecast nem client_retention (seção 4: 'nunca weather_forecast sem relação explícita')", () => {
    expect(INTENT_CAPABILITIES.inventory_status).toEqual(["inventory_status"]);
  });

  it("client_retention busca só crm_summary — nunca JumpPark ou caixa", () => {
    expect(INTENT_CAPABILITIES.client_retention).toEqual(["crm_summary"]);
  });

  it("outlook combina histórico, clima, meta, agenda e capacidade operacional", () => {
    const caps = INTENT_CAPABILITIES.outlook!;
    expect(caps).toContain("historical_pattern");
    expect(caps).toContain("weather_forecast");
    expect(caps).toContain("goal_progress");
    expect(caps).toContain("staffing_capacity");
  });

  it("status_check e business_health usam a mesma lista ampla do exemplo do checkpoint", () => {
    expect(INTENT_CAPABILITIES.status_check).toEqual(INTENT_CAPABILITIES.business_health);
    expect(INTENT_CAPABILITIES.business_health).toEqual(
      expect.arrayContaining(["situational_context", "jumppark_period_summary", "historical_pattern", "goal_progress", "weather_forecast", "central_alerts", "cash_ledger_totals"]),
    );
  });
});

describe("capabilitiesForRecommendation — domínio primeiro, fontes depois (seção 4)", () => {
  it("domínio 'clientes' -> crm_summary + unanswered_clients, nunca estoque ou clima", () => {
    const caps = capabilitiesForRecommendation("clientes");
    expect(caps).toEqual(["crm_summary", "unanswered_clients"]);
  });

  it("domínio 'estoque' -> só inventory_status", () => {
    expect(capabilitiesForRecommendation("estoque")).toEqual(["inventory_status"]);
  });

  it("sem domínio reconhecido, usa o conjunto amplo de business_health — nunca uma recomendação sem nenhuma fonte", () => {
    const caps = capabilitiesForRecommendation(null);
    expect(caps.length).toBeGreaterThan(0);
  });
});

describe("capabilitiesForIntent — ponte única entre intenção e capacidades", () => {
  it("'recommendation' delega para capabilitiesForRecommendation com o tópico", () => {
    expect(capabilitiesForIntent("recommendation", "estoque")).toEqual(capabilitiesForRecommendation("estoque"));
  });

  it("intenção sem entrada na matriz devolve lista vazia, nunca lança", () => {
    expect(capabilitiesForIntent("greeting", null)).toEqual([]);
  });
});
