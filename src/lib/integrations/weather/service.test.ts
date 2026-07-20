import { describe, expect, it } from "vitest";
import { summarizeDay } from "@/lib/integrations/weather/service";
import type { RawForecastSlot } from "@/lib/integrations/weather/client";

function slot(overrides: Partial<RawForecastSlot> = {}): RawForecastSlot {
  return {
    dt_txt: "2026-07-20 12:00:00",
    main: { temp_min: 18, temp_max: 20 },
    weather: [{ description: "céu limpo" }],
    pop: 0.1,
    wind: { speed: 3 },
    ...overrides,
  };
}

describe("summarizeDay — agregação pura de previsão do tempo", () => {
  it("sem nenhum slot -> null, nunca inventa previsão", () => {
    expect(summarizeDay("2026-07-20", [])).toBeNull();
  });

  it("agrega min/max de temperatura e vento entre os passos de 3h", () => {
    const summary = summarizeDay("2026-07-20", [
      slot({ main: { temp_min: 15, temp_max: 18 }, wind: { speed: 2 } }),
      slot({ main: { temp_min: 20, temp_max: 24 }, wind: { speed: 8 } }),
    ]);
    expect(summary!.minTemp).toBe(15);
    expect(summary!.maxTemp).toBe(24);
    expect(summary!.windSpeedMaxKmh).toBe(Math.round(8 * 3.6));
  });

  it("chuva provável quando algum passo do dia tem probabilidade >= 40%", () => {
    const summary = summarizeDay("2026-07-20", [slot({ pop: 0.1 }), slot({ pop: 0.55 })]);
    expect(summary!.willRain).toBe(true);
    expect(summary!.maxPrecipitationProbability).toBe(0.55);
  });

  it("tempo firme quando nenhum passo passa do limiar de chuva", () => {
    const summary = summarizeDay("2026-07-20", [slot({ pop: 0.1 }), slot({ pop: 0.2 })]);
    expect(summary!.willRain).toBe(false);
  });

  it("condição predominante é a mais frequente entre os passos do dia", () => {
    const summary = summarizeDay("2026-07-20", [slot({ weather: [{ description: "chuva leve" }] }), slot({ weather: [{ description: "céu limpo" }] }), slot({ weather: [{ description: "céu limpo" }] })]);
    expect(summary!.dominantCondition).toBe("céu limpo");
  });
});
