import { beforeEach, describe, expect, it } from "vitest";
import { executeTool, executeTools } from "@/lib/zezinho/tools/executor";
import type { ToolCall, ToolId } from "@/lib/zezinho/tools/types";

/**
 * Ambiente de teste nunca tem JUMPPARK_API_* nem OPENWEATHER_API_KEY/WEATHER_API_KEY definidos
 * (vitest não carrega .env.local — ver vitest.config.ts), então estes testes fixam o
 * comportamento "não configurado" de forma determinística, sem precisar mockar rede. O objetivo
 * aqui é travar a taxonomia de `status` (Sprint 4.0, Z2), não recomputar o que já é testado em
 * `comparison-engine`/`historical-pattern.test.ts`.
 */

function call(id: ToolId, overrides: Partial<ToolCall> = {}): ToolCall {
  return { id, periodA: null, periodB: null, filterKind: null, ...overrides };
}

const PERIOD = { key: "week" as const, from: "2026-07-13", to: "2026-07-19", label: "Semana atual" };

describe("executeTool — todo resultado carrega status/collectedAt/limitations (Sprint 4.0, Z2)", () => {
  it("ferramentas que dependem do JumpPark voltam not_configured quando ele não está configurado", async () => {
    const ids: ToolId[] = ["jumppark_period_summary", "jumppark_wash_packages", "full_period_comparison"];
    for (const id of ids) {
      const result = await executeTool(call(id, { periodA: PERIOD }));
      expect(result.status).toBe("not_configured");
      expect(result.collectedAt).toBeTruthy();
      expect(new Date(result.collectedAt).toString()).not.toBe("Invalid Date");
      expect(Array.isArray(result.limitations)).toBe(true);
    }
  });

  it("jumppark_period_summary sem período informado volta no_data, não not_configured", async () => {
    const result = await executeTool(call("jumppark_period_summary"));
    expect(result.status).toBe("no_data");
    expect(result.error).toMatch(/período/i);
  });

  it("crm_customers reflete jumpparkConfigured no status (not_configured, nunca 'ok' silencioso)", async () => {
    const result = await executeTool(call("crm_customers"));
    expect(result.status).toBe("not_configured");
    if (result.id === "crm_customers") expect(result.jumpparkConfigured).toBe(false);
  });

  it("weather_forecast reflete o status do WeatherForecastResult (not_configured sem chave)", async () => {
    const result = await executeTool(call("weather_forecast"));
    expect(result.status).toBe("not_configured");
    if (result.id === "weather_forecast") expect(result.forecast.configured).toBe(false);
  });

  it("historical_pattern volta not_configured quando o JumpPark não está configurado — nunca inventa padrão", async () => {
    const result = await executeTool(call("historical_pattern"));
    expect(result.status).toBe("not_configured");
    if (result.id === "historical_pattern") expect(result.pattern).toBeNull();
  });

  it("goal_progress sem meta cadastrada para o período atual volta no_data, honesto sobre a ausência", async () => {
    const result = await executeTool(call("goal_progress"));
    expect(result.status).toBe("no_data");
    if (result.id === "goal_progress") expect(result.progress).toBeNull();
  });

  it("ferramentas sobre Neon/estoque em modo memória (sem DATABASE_URL) respondem ok, nunca lançam", async () => {
    const cash = await executeTool(call("cash_ledger_totals", { periodA: PERIOD }));
    expect(cash.status).toBe("ok");
    const dre = await executeTool(call("dre_result", { periodA: PERIOD }));
    expect(dre.status).toBe("ok");
    const inventory = await executeTool(call("inventory_overview"));
    expect(inventory.status).toBe("ok");
    const alerts = await executeTool(call("central_alerts"));
    expect(alerts.status).toBe("ok");
  });
});

describe("executeTools — executa em paralelo e nunca derruba o conjunto por causa de uma ferramenta", () => {
  beforeEach(() => {
    // Nenhum estado global a resetar — todas as ferramentas leem env/serviços a cada chamada.
  });

  it("mistura de ferramentas configuradas e não configuradas retorna todos os resultados, cada um com seu próprio status", async () => {
    const results = await executeTools([call("weather_forecast"), call("inventory_overview"), call("historical_pattern")]);
    expect(results).toHaveLength(3);
    expect(results.map((r) => r.status)).toEqual(["not_configured", "ok", "not_configured"]);
  });
});
