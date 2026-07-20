export interface DayForecastSummary {
  dateIso: string;
  minTemp: number;
  maxTemp: number;
  /** Probabilidade máxima de chuva no dia, 0 a 1 (ex.: 0.6 = 60%). */
  maxPrecipitationProbability: number;
  willRain: boolean;
  /** Condição predominante do dia em português (ex.: "céu limpo", "chuva leve"). */
  dominantCondition: string;
  windSpeedMaxKmh: number;
}

export interface WeatherForecastResult {
  configured: boolean;
  error: string | null;
  location: string | null;
  today: DayForecastSummary | null;
  tomorrow: DayForecastSummary | null;
}
