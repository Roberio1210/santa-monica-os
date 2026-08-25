import "server-only";

/**
 * Missão Z6.2 — leitura de configuração da WhatsApp Cloud API (Meta), sempre FAIL CLOSED:
 * `loadWhatsappCloudApiConfig()` só devolve um objeto quando `WHATSAPP_ENABLED=true` E todas as
 * credenciais obrigatórias estão presentes; qualquer ausência (uma só que seja) ou
 * `WHATSAPP_ENABLED` diferente de `"true"` devolve `null` — nunca um objeto parcial, nunca lança.
 * Nenhum valor de credencial é logado em lugar nenhum deste módulo.
 *
 * Missão Z6.3 (achado real da auditoria) — `loadWhatsappCloudApiConfig()` deve continuar sendo
 * usado SÓ pelo caminho de ENVIO (`cloudApiChannel.ts`), nunca pelo webhook. Antes desta missão o
 * `route.ts` usava esta mesma função para o GET de verificação, o que exigiria `WHATSAPP_ENABLED=
 * true` (+ as outras 4 credenciais de envio) só para a Meta conseguir confirmar a URL de callback
 * na "Etapa 2" do painel — incompatível com a exigência explícita desta missão de nunca habilitar
 * envio real. `loadWebhookVerifyToken`/`loadWebhookAppSecret` abaixo são a leitura mínima e
 * independente que o webhook (GET/POST) realmente precisa, sem nunca tocar `WHATSAPP_ENABLED`.
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

/** Usado exclusivamente pelo canal de ENVIO (`cloudApiChannel.ts`) — nunca pelo webhook de recebimento. */
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

/** Só o que o GET de verificação do webhook precisa — independente de `WHATSAPP_ENABLED` e das credenciais de envio. */
export function loadWebhookVerifyToken(): string | null {
  return process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || null;
}

/** Só o que a validação de assinatura do POST precisa — independente de `WHATSAPP_ENABLED` e das credenciais de envio. */
export function loadWebhookAppSecret(): string | null {
  return process.env.WHATSAPP_APP_SECRET || null;
}
