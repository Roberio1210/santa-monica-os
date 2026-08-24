import { createHmac } from "node:crypto";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Missão Z6.2 — teste de integração leve da rota (GET de verificação, POST com assinatura),
 * confirmando a fiação real (nomes de query param, nome do header, leitura do corpo bruto antes
 * do JSON.parse) além do que os testes puros de `webhook.ts` já cobrem. `recordInboundMessage` é
 * mockado — nenhum banco real é tocado.
 */

const recordInboundMessageMock = vi.fn();
vi.mock("@/lib/management/inboundMessages", () => ({
  recordInboundMessage: (...args: unknown[]) => recordInboundMessageMock(...args),
}));

const ENV_KEYS = ["WHATSAPP_ENABLED", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_WEBHOOK_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"] as const;
let snapshot: Record<string, string | undefined>;

beforeEach(() => {
  snapshot = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
  recordInboundMessageMock.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (snapshot[k] === undefined) delete process.env[k];
    else process.env[k] = snapshot[k];
  }
});

function enableWithValidConfig() {
  process.env.WHATSAPP_ENABLED = "true";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "phone-id-123";
  process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = "waba-456";
  process.env.WHATSAPP_ACCESS_TOKEN = "token-789";
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-abc";
  process.env.WHATSAPP_APP_SECRET = "secret-def";
}

describe("GET /api/whatsapp/webhook", () => {
  it("desabilitado (sem WHATSAPP_ENABLED) -> 404, nunca tenta verificar nada", async () => {
    const { GET } = await import("@/app/api/whatsapp/webhook/route");
    const response = await GET(new Request("https://x.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-abc&hub.challenge=123"));
    expect(response.status).toBe(404);
  });

  it("habilitado + token correto -> 200 ecoando o challenge", async () => {
    enableWithValidConfig();
    const { GET } = await import("@/app/api/whatsapp/webhook/route");
    const response = await GET(new Request("https://x.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-abc&hub.challenge=abc123"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("abc123");
  });

  it("habilitado + token incorreto -> 403", async () => {
    enableWithValidConfig();
    const { GET } = await import("@/app/api/whatsapp/webhook/route");
    const response = await GET(new Request("https://x.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=abc123"));
    expect(response.status).toBe(403);
  });
});

describe("POST /api/whatsapp/webhook", () => {
  it("desabilitado -> 404, nunca lê/valida o corpo", async () => {
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    const response = await POST(new Request("https://x.test/api/whatsapp/webhook", { method: "POST", body: "{}" }));
    expect(response.status).toBe(404);
    expect(recordInboundMessageMock).not.toHaveBeenCalled();
  });

  it("teste obrigatório 13 — assinatura ausente/inválida -> 401, nunca processa o payload", async () => {
    enableWithValidConfig();
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    const response = await POST(new Request("https://x.test/api/whatsapp/webhook", { method: "POST", body: JSON.stringify({ entry: [] }) }));
    expect(response.status).toBe(401);
    expect(recordInboundMessageMock).not.toHaveBeenCalled();
  });

  it("teste obrigatório 12 — assinatura válida + payload válido -> 200, grava a mensagem recebida", async () => {
    enableWithValidConfig();
    recordInboundMessageMock.mockResolvedValue({ id: "in-1" });

    const payload = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ from: "5511999998888", id: "wamid.ABC", timestamp: "1700000000", type: "text", text: { body: "oi" } }] } }] }],
    });
    const signature = `sha256=${createHmac("sha256", "secret-def").update(payload, "utf-8").digest("hex")}`;

    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    const response = await POST(new Request("https://x.test/api/whatsapp/webhook", { method: "POST", body: payload, headers: { "x-hub-signature-256": signature } }));

    expect(response.status).toBe(200);
    expect(recordInboundMessageMock).toHaveBeenCalledWith(expect.objectContaining({ phoneE164: "+5511999998888", externalMessageId: "wamid.ABC", textBody: "oi" }));
  });
});
