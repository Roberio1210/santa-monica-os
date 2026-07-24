/**
 * Tipos normalizados da camada Weather Intelligence — o restante do sistema só conhece estes
 * tipos, nunca o formato bruto de nenhum provedor específico. Trocar de provedor (ex.: sair do
 * OpenWeatherMap) nunca deve exigir mudar nada fora de `providers/`.
 */

export interface CurrentConditions {
  temperature: number;
  feelsLike: number;
  condition: string;
  /** `null` quando o provedor não expõe probabilidade de chuva na leitura "agora" (comum — pop é um dado de previsão, não de condição atual). */
  precipitationProbability: number | null;
  windSpeedKmh: number;
}

export interface HourlyForecastPoint {
  /** Instante ISO 8601 a que este ponto se refere. */
  time: string;
  temperature: number;
  precipitationProbability: number;
  /** Volume de chuva em mm no intervalo, quando o provedor informa (ausência = sem chuva medida, nunca "desconhecido"). */
  rainVolumeMm: number | null;
  windSpeedKmh: number;
  condition: string;
}

export interface DailyForecastSummary {
  dateIso: string;
  minTemp: number;
  maxTemp: number;
  maxPrecipitationProbability: number;
  totalRainVolumeMm: number | null;
  willRain: boolean;
  dominantCondition: string;
  windSpeedMaxKmh: number;
}

export type WeatherResultStatus = "ok" | "not_configured" | "temporary_failure";

export interface WeatherForecastResult {
  status: WeatherResultStatus;
  configured: boolean;
  error: string | null;
  /** Nome do provedor que gerou este resultado (ex.: "OpenWeatherMap") — nunca a chave. */
  source: string | null;
  location: string | null;
  /** Instante em que os dados foram obtidos (não necessariamente igual ao instante de emissão do provedor). */
  updatedAt: string | null;
  current: CurrentConditions | null;
  /** Próximas horas, em passos de 3h, dentro do que o plano gratuito permite (~24-48h). */
  nextHours: HourlyForecastPoint[];
  /** Hoje + próximos dias dentro do limite do plano (até 5 no plano gratuito do OpenWeatherMap). */
  dailyForecast: DailyForecastSummary[];
  limitations: string[];
}

/**
 * Contrato que qualquer provedor de previsão do tempo precisa implementar — a camada pública
 * (`service.ts`) só conversa com isto, nunca com HTTP/JSON de um provedor específico.
 */
export interface WeatherProvider {
  readonly name: string;
  fetchCurrent(location: string): Promise<CurrentConditions>;
  fetchForecast(location: string): Promise<{ nextHours: HourlyForecastPoint[]; dailyForecast: DailyForecastSummary[] }>;
}
