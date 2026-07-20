import "server-only";
import { getWeatherEnv } from "@/lib/config/env";

/**
 * Cliente HTTP para a API de previsão do tempo (OpenWeatherMap — escolhida no lugar do WindGuru
 * preferido inicialmente: WindGuru não tem uma API REST pública de previsão documentada para
 * consumo de terceiros, é orientado a widgets/iframes e upload de estação pessoal, não a
 * consultas programáticas server-side; ver docs/zezinho-4.0-architecture.md, seção 13,
 * pergunta 3). Endpoint gratuito "5 day / 3 hour forecast" — não exige assinatura paga.
 *
 * Modo somente leitura. Nunca usado a partir de Client Components.
 */

const BASE_URL = "https://api.openweathermap.org/data/2.5/forecast";
const DEFAULT_TIMEOUT_MS = 10_000;

export class WeatherNotConfiguredError extends Error {
  constructor() {
    super("Weather integration is not configured");
    this.name = "WeatherNotConfiguredError";
  }
}

export class WeatherRequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "WeatherRequestError";
    this.status = status;
  }
}

export interface RawForecastSlot {
  dt_txt: string; // "YYYY-MM-DD HH:mm:ss", UTC
  main: { temp_min: number; temp_max: number };
  weather: { description: string }[];
  pop: number; // 0-1
  wind: { speed: number }; // m/s
}

export interface RawForecastResponse {
  list: RawForecastSlot[];
  city: { name: string; country: string };
}

/** Busca a previsão bruta de 5 dias / passos de 3h — lança `WeatherNotConfiguredError` sem chave configurada. */
export async function fetchRawForecast(): Promise<RawForecastResponse> {
  const env = getWeatherEnv();
  if (!env) throw new WeatherNotConfiguredError();

  const url = new URL(BASE_URL);
  url.searchParams.set("q", env.location);
  url.searchParams.set("appid", env.apiKey);
  url.searchParams.set("units", "metric");
  url.searchParams.set("lang", "pt_br");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new WeatherRequestError(response.status, body.slice(0, 200));
    }
    return (await response.json()) as RawForecastResponse;
  } finally {
    clearTimeout(timeout);
  }
}
