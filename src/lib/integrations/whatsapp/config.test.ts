import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { isWhatsappCloudApiEnabled, loadWhatsappCloudApiConfig } from "@/lib/integrations/whatsapp/config";

/**
 * Missão Z6.2 (testes obrigatórios 1, 2, 3) — `loadWhatsappCloudApiConfig()` é o único ponto de
 * decisão "habilitado ou não" — precisa devolver `null` (nunca um objeto parcial, nunca lançar)
 * sempre que `WHATSAPP_ENABLED !== "true"` OU faltar qualquer credencial obrigatória.
 */

const ENV_KEYS = ["WHATSAPP_ENABLED", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_WEBHOOK_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"] as const;

let snapshot: Record<string, string | undefined>;

beforeEach(() => {
  snapshot = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

function setFullValidConfig() {
  process.env.WHATSAPP_ENABLED = "true";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-id-123";
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "waba-456";
  process.env.WHATSAPP_ACCESS_TOKEN = "token-789";
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-abc";
  process.env.WHATSAPP_APP_SECRET = "secret-def";
}

describe("isWhatsappCloudApiEnabled / loadWhatsappCloudApiConfig", () => {
  it("teste obrigatório 1 — sem WHATSAPP_ENABLED (ausente): desabilitado, config null", () => {
    expect(isWhatsappCloudApiEnabled()).toBe(false);
    expect(loadWhatsappCloudApiConfig()).toBeNull();
  });

  it("WHATSAPP_ENABLED=false explicitamente: desabilitado, config null mesmo com credenciais completas", () => {
    setFullValidConfig();
    process.env.WHATSAPP_ENABLED = "false";
    expect(isWhatsappCloudApiEnabled()).toBe(false);
    expect(loadWhatsappCloudApiConfig()).toBeNull();
  });

  it("teste obrigatório 2 — WHATSAPP_ENABLED=true mas access token ausente: null", () => {
    setFullValidConfig();
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    expect(loadWhatsappCloudApiConfig()).toBeNull();
  });

  it("teste obrigatório 3 — WHATSAPP_ENABLED=true mas phone_number_id ausente: null", () => {
    setFullValidConfig();
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    expect(loadWhatsappCloudApiConfig()).toBeNull();
  });

  it("qualquer uma das outras credenciais ausente (business_account_id/verify_token/app_secret) também bloqueia", () => {
    for (const missing of ["WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_WEBHOOK_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"] as const) {
      setFullValidConfig();
      delete process.env[missing];
      expect(loadWhatsappCloudApiConfig()).toBeNull();
    }
  });

  it("todas as credenciais presentes + habilitado: devolve o objeto completo", () => {
    setFullValidConfig();
    expect(loadWhatsappCloudApiConfig()).toEqual({
      phoneNumberId: "phone-id-123",
      businessAccountId: "waba-456",
      accessToken: "token-789",
      webhookVerifyToken: "verify-abc",
      appSecret: "secret-def",
    });
  });
});
