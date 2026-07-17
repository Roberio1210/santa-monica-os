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
