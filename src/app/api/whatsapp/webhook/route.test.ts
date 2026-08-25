import { createHmac } from "node:crypto";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * Missão Z6.2/Z6.3 — teste de integração leve da rota (GET de verificação, POST com assinatura),
 * confirmando a fiação real (nomes de query param, nome do header, leitura do corpo bruto antes
 * do JSON.parse) além do que os testes puros de `webhook.ts` já cobrem. `recordInboundMessage` é
 * mockado — nenhum banco real é tocado.
 *
 * O ponto central desta versão (achado real da Z6.3): GET/POST agora dependem SÓ de
 * `WHATSAPP_WEBHOOK_VERIFY_TOKEN`/`WHATSAPP_APP_SECRET`, nunca de `WHATSAPP_ENABLED` — a Meta
 * precisa conseguir verificar a URL de callback ("Etapa 2" do painel) SEM que o envio real esteja
 * habilitado. O teste "GET funciona com WHATSAPP_ENABLED=false" é a prova direta disso.
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

describe("GET /api/whatsapp/webhook", () => {
  it("sem WHATSAPP_WEBHOOK_VERIFY_TOKEN configurado -> 404, nunca tenta verificar nada", async () => {
    const { GET } = await import("@/app/api/whatsapp/webhook/route");
    const response = await GET(new Request("https://x.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-abc&hub.challenge=123"));
    expect(response.status).toBe(404);
  });

  it("teste obrigatório da Z6.3 — token correto FUNCIONA mesmo com WHATSAPP_ENABLED=false (webhook independe de envio habilitado)", async () => {
    process.env.WHATSAPP_ENABLED = "false";
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-abc";
    const { GET } = await import("@/app/api/whatsapp/webhook/route");
    const response = await GET(new Request("https://x.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-abc&hub.challenge=abc123"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("abc123");
  });

  it("token correto também funciona sem NENHUMA outra variável de envio configurada (nem phone_number_id, nem access_token, etc.)", async () => {
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-abc";
    const { GET } = await import("@/app/api/whatsapp/webhook/route");
    const response = await GET(new Request("https://x.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-abc&hub.challenge=xyz"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("xyz");
  });

  it("token incorreto -> 403, nunca revela o valor esperado", async () => {
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-abc";
    const { GET } = await import("@/app/api/whatsapp/webhook/route");
    const response = await GET(new Request("https://x.test/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=abc123"));
    expect(response.status).toBe(403);
    const text = await response.text();
    expect(text).not.toContain("verify-abc");
  });
});

describe("POST /api/whatsapp/webhook", () => {
  it("sem WHATSAPP_APP_SECRET configurado -> 503 (fail closed: sem segredo, nada é processado)", async () => {
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    const response = await POST(new Request("https://x.test/api/whatsapp/webhook", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
    expect(recordInboundMessageMock).not.toHaveBeenCalled();
  });

  it("sem WHATSAPP_APP_SECRET, mesmo com WHATSAPP_ENABLED=true -> ainda 503 (POST não depende de ENABLED, depende do segredo)", async () => {
    process.env.WHATSAPP_ENABLED = "true";
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    const response = await POST(new Request("https://x.test/api/whatsapp/webhook", { method: "POST", body: "{}" }));
    expect(response.status).toBe(503);
  });

  it("teste obrigatório 13 — com APP_SECRET configurado, assinatura ausente/inválida -> 401, nunca processa o payload", async () => {
    process.env.WHATSAPP_APP_SECRET = "secret-def";
    const { POST } = await import("@/app/api/whatsapp/webhook/route");
    const response = await POST(new Request("https://x.test/api/whatsapp/webhook", { method: "POST", body: JSON.stringify({ entry: [] }) }));
    expect(response.status).toBe(401);
    expect(recordInboundMessageMock).not.toHaveBeenCalled();
  });

  it("teste obrigatório 12 — APP_SECRET configurado + assinatura válida + payload válido -> 200, grava a mensagem recebida", async () => {
    process.env.WHATSAPP_APP_SECRET = "secret-def";
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
