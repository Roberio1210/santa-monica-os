import "server-only";

/**
 * Missão Z6.2 — leitura de configuração da WhatsApp Cloud API (Meta), sempre FAIL CLOSED:
 * `loadWhatsappCloudApiConfig()` só devolve um objeto quando `WHATSAPP_ENABLED=true` E todas as
 * credenciais obrigatórias estão presentes; qualquer ausência (uma só que seja) ou
 * `WHATSAPP_ENABLED` diferente de `"true"` devolve `null` — nunca um objeto parcial, nunca lança.
 * Nenhum valor de credencial é logado em lugar nenhum deste módulo.
 */
export interface WhatsAppCloudApiConfig {
  phoneNumberId: string;
  businessAccountId: string;
  accessToken: string;
  webhookVerifyToken: string;
  appSecret: string;
}

export function isWhatsappCloudApiEnabled(): boolean {
  return process.env.WHATSAPP_ENABLED === "true";
}

export function loadWhatsappCloudApiConfig(): WhatsAppCloudApiConfig | null {
  if (!isWhatsappCloudApiEnabled()) return null;

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const webhookVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!phoneNumberId || !businessAccountId || !accessToken || !webhookVerifyToken || !appSecret) {
    return null;
  }

  return { phoneNumberId, businessAccountId, accessToken, webhookVerifyToken, appSecret };
}
