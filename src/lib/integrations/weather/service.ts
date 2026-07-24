import "server-only";
import { getWeatherEnv } from "@/lib/config/env";
import { OpenWeatherProvider } from "@/lib/integrations/weather/providers/openweather";
import { getCached, setCached } from "@/lib/integrations/weather/cache";
import { weatherLogger } from "@/lib/integrations/weather/logger";
import type { WeatherForecastResult, WeatherProvider } from "@/lib/integrations/weather/types";

/**
 * Weather Intelligence — único ponto de entrada autorizado para previsão do tempo em todo o
 * sistema. Ninguém deve chamar um provedor diretamente nem importar de `providers/`: sempre
 * `getWeatherForecast()`. Responsável por normalizar, cachear, tratar timeout/indisponibilidade e
 * logar — o restante do sistema só conhece `WeatherForecastResult` (types.ts).
 */

const CACHE_TTL_MS = 15 * 60 * 1000;
const TIMEOUT_MS = 10_000;

/** Fábrica do provedor ativo — hoje só OpenWeatherMap. Trocar de provedor é só mudar esta função. */
function getActiveProvider(apiKey: string): WeatherProvider {
  return new OpenWeatherProvider(apiKey);
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout (${ms}ms) ao consultar ${label}.`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function emptyResult(overrides: Partial<WeatherForecastResult>): WeatherForecastResult {
  return { status: "not_configured", configured: false, error: null, source: null, location: null, updatedAt: null, current: null, nextHours: [], dailyForecast: [], limitations: [], ...overrides };
}

/**
 * Previsão do tempo normalizada — nunca lança. Sem chave configurada, indisponibilidade
 * temporária ou timeout, devolve um `WeatherForecastResult` honesto (`status` + `error` +
 * `limitations`), nunca dado inventado. Resultado é cacheado por `CACHE_TTL_MS` por
 * provedor+localização, para não bater no provedor a cada pergunta do Zézinho.
 */
export async function getWeatherForecast(): Promise<WeatherForecastResult> {
  const env = getWeatherEnv();
  if (!env) {
    weatherLogger.warn("Previsão do tempo não configurada — nenhuma chave presente (OPENWEATHER_API_KEY / WEATHER_API_KEY).");
    return emptyResult({ status: "not_configured", error: "Previsão do tempo não configurada neste ambiente." });
  }

  const provider = getActiveProvider(env.apiKey);
  const cacheKey = `${provider.name}:${env.location}`;

  const cached = getCached<WeatherForecastResult>(cacheKey);
  if (cached) {
    weatherLogger.info("Previsão obtida do cache.", { location: env.location, source: provider.name });
    return cached;
  }

  try {
    const [current, forecast] = await Promise.all([
      withTimeout(provider.fetchCurrent(env.location), TIMEOUT_MS, "condição atual"),
      withTimeout(provider.fetchForecast(env.location), TIMEOUT_MS, "previsão"),
    ]);

    const result: WeatherForecastResult = {
      status: "ok",
      configured: true,
      error: null,
      source: provider.name,
      location: env.location,
      updatedAt: new Date().toISOString(),
      current,
      nextHours: forecast.nextHours,
      dailyForecast: forecast.dailyForecast,
      limitations: [],
    };
    setCached(cacheKey, result, CACHE_TTL_MS);
    weatherLogger.info("Previsão do tempo consultada com sucesso.", { location: env.location, source: provider.name });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    weatherLogger.error("Falha ao consultar previsão do tempo.", { location: env.location, source: provider.name, error: message });
    return emptyResult({
      status: "temporary_failure",
      configured: true,
      error: "Não foi possível consultar a previsão do tempo agora.",
      source: provider.name,
      location: env.location,
      limitations: ["Falha temporária na consulta ao provedor de clima — tentar novamente mais tarde."],
    });
  }
}
