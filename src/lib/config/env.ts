/**
 * Acesso centralizado a variáveis de ambiente sensíveis.
 * Este módulo NUNCA deve ser importado por Client Components.
 */

export interface JumpParkEnv {
  baseUrl: string;
  token: string;
  userId: string;
  establishmentId: string;
  /** Origem autorizada no painel JumpPark para Origin/Referer. Opcional. */
  origin: string | null;
}

export function getJumpParkEnv(): JumpParkEnv | null {
  const baseUrl = process.env.JUMPPARK_API_BASE_URL;
  const token = process.env.JUMPPARK_API_TOKEN;
  const userId = process.env.JUMPPARK_API_USER_ID;
  const establishmentId = process.env.JUMPPARK_ESTABLISHMENT_ID;
  const origin = process.env.JUMPPARK_API_ORIGIN || null;

  if (!baseUrl || !token || !userId || !establishmentId) {
    return null;
  }

  return { baseUrl, token, userId, establishmentId, origin };
}

export function isJumpParkConfigured(): boolean {
  return getJumpParkEnv() !== null;
}

export interface WeatherEnv {
  apiKey: string;
  /** Cidade/UF/país no formato aceito pela API (ex.: "Florianópolis,SC,BR") ou "lat,lon". */
  location: string;
}

const DEFAULT_WEATHER_LOCATION = "Florianópolis,SC,BR";

/**
 * Aceita `OPENWEATHER_API_KEY` (nome atual, preferido) ou `WEATHER_API_KEY` (nome usado no
 * checkpoint anterior) — compatibilidade segura para nunca quebrar um ambiente que já tenha
 * cadastrado a chave com o nome antigo. Nunca loga nem expõe o valor da chave.
 */
export function getWeatherEnv(): WeatherEnv | null {
  const apiKey = process.env.OPENWEATHER_API_KEY || process.env.WEATHER_API_KEY;
  if (!apiKey) return null;
  const location = process.env.WEATHER_LOCATION || DEFAULT_WEATHER_LOCATION;
  return { apiKey, location };
}

export function isWeatherConfigured(): boolean {
  return getWeatherEnv() !== null;
}

export interface StoneEnv {
  apiKey: string;
  /** StoneCode/affiliationCode do estabelecimento. */
  affiliationCode: string;
}

/**
 * Autenticação Cliente Stone: API key do Portal Stone (não é OAuth, não é fluxo de parceiro
 * conciliador) — ver docs/stone-integration-architecture.md, seção 1.1. Nunca loga o valor da
 * chave.
 */
export function getStoneEnv(): StoneEnv | null {
  const apiKey = process.env.STONE_API_KEY;
  const affiliationCode = process.env.STONE_ACCOUNT_ID;
  if (!apiKey || !affiliationCode) return null;
  return { apiKey, affiliationCode };
}

export function isStoneConfigured(): boolean {
  return getStoneEnv() !== null;
}

export type InventoryConsumptionMode = "disabled" | "preview_only" | "preview_and_confirm";

const VALID_CONSUMPTION_MODES: InventoryConsumptionMode[] = ["disabled", "preview_only", "preview_and_confirm"];

/**
 * Modo de operação da integração de consumo JumpPark → estoque (Fase D, seção 10). Nunca
 * assume um modo automático: se a variável estiver ausente ou tiver um valor desconhecido,
 * cai para "preview_only" (o estado mais seguro que ainda permite visualizar prévias).
 */
export function getInventoryConsumptionMode(): InventoryConsumptionMode {
  const raw = process.env.INVENTORY_CONSUMPTION_MODE;
  if (raw && (VALID_CONSUMPTION_MODES as string[]).includes(raw)) {
    return raw as InventoryConsumptionMode;
  }
  return "preview_only";
}
