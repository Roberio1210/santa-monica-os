import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearWeatherCache } from "@/lib/integrations/weather/cache";

const ORIGINAL_ENV = { ...process.env };

function rawCurrentResponse() {
  return { main: { temp: 24.3, feels_like: 25.1 }, weather: [{ description: "céu limpo" }], wind: { speed: 3 } };
}

function rawForecastResponse() {
  const slots = [];
  for (let i = 0; i < 10; i++) {
    const hour = String((i % 8) * 3).padStart(2, "0");
    slots.push({
      dt_txt: `2026-07-2${i < 8 ? "0" : "1"} ${hour}:00:00`,
      main: { temp: 22, feels_like: 22, temp_min: 20, temp_max: 25 },
      weather: [{ description: "nublado" }],
      pop: 0.5,
      wind: { speed: 5 },
      rain: { "3h": 1.2 },
    });
  }
  return { list: slots };
}

function mockFetchOnce(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
}

describe("getWeatherForecast — Weather Intelligence (Sprint 4.0, Z2)", () => {
  beforeEach(() => {
    vi.resetModules();
    clearWeatherCache();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.OPENWEATHER_API_KEY;
    delete process.env.WEATHER_API_KEY;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("sem nenhuma chave configurada, devolve status not_configured — nunca inventa dado", async () => {
    const { getWeatherForecast } = await import("@/lib/integrations/weather/service");
    const result = await getWeatherForecast();
    expect(result.status).toBe("not_configured");
    expect(result.configured).toBe(false);
    expect(result.current).toBeNull();
  });

  it("aceita WEATHER_API_KEY (nome do checkpoint anterior) quando OPENWEATHER_API_KEY não está definida", async () => {
    process.env.WEATHER_API_KEY = "legacy-key";
    vi.stubGlobal(
      "fetch",
      vi.fn((url: URL) => (url.toString().includes("/forecast") ? mockFetchOnce(200, rawForecastResponse())() : mockFetchOnce(200, rawCurrentResponse())())),
    );
    const { getWeatherForecast } = await import("@/lib/integrations/weather/service");
    const result = await getWeatherForecast();
    expect(result.status).toBe("ok");
    expect(result.configured).toBe(true);
  });

  it("com chave configurada e provedor respondendo, devolve previsão normalizada e cacheia", async () => {
    process.env.OPENWEATHER_API_KEY = "test-key";
    const fetchMock = vi.fn((url: URL) => (url.toString().includes("/forecast") ? mockFetchOnce(200, rawForecastResponse())() : mockFetchOnce(200, rawCurrentResponse())()));
    vi.stubGlobal("fetch", fetchMock);

    const { getWeatherForecast } = await import("@/lib/integrations/weather/service");
    const first = await getWeatherForecast();
    expect(first.status).toBe("ok");
    expect(first.source).toBe("OpenWeatherMap");
    expect(first.current?.temperature).toBe(24.3);
    expect(first.current?.precipitationProbability).toBeNull();
    expect(first.nextHours.length).toBeGreaterThan(0);
    expect(first.dailyForecast.length).toBeGreaterThan(0);
    expect(first.limitations).toEqual([]);

    const callsAfterFirst = fetchMock.mock.calls.length;
    const second = await getWeatherForecast();
    expect(second.status).toBe("ok");
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it("indisponibilidade do provedor devolve temporary_failure, nunca lança e nunca inventa dado", async () => {
    process.env.OPENWEATHER_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}), text: async () => "indisponível" }),
    );
    const { getWeatherForecast } = await import("@/lib/integrations/weather/service");
    const result = await getWeatherForecast();
    expect(result.status).toBe("temporary_failure");
    expect(result.current).toBeNull();
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it("nunca expõe a chave de API no resultado", async () => {
    process.env.OPENWEATHER_API_KEY = "super-secret-key";
    vi.stubGlobal(
      "fetch",
      vi.fn((url: URL) => (url.toString().includes("/forecast") ? mockFetchOnce(200, rawForecastResponse())() : mockFetchOnce(200, rawCurrentResponse())())),
    );
    const { getWeatherForecast } = await import("@/lib/integrations/weather/service");
    const result = await getWeatherForecast();
    expect(JSON.stringify(result)).not.toContain("super-secret-key");
  });
});
