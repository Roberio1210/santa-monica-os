import { describe, expect, it, vi, afterEach } from "vitest";
import { sendWhatsAppText } from "@/lib/integrations/whatsapp/sendText";
import type { WhatsAppCloudApiConfig } from "@/lib/integrations/whatsapp/config";

/**
 * Missão Z6.6 — `sendWhatsAppText` extraída de `cloudApiChannel.ts` para ser reutilizada pelo
 * canal aprovado E pela resposta conversacional, sem duplicar a integração com a Meta.
 */

const config: WhatsAppCloudApiConfig = {
  phoneNumberId: "phone-id-123",
  businessAccountId: "waba-456",
  accessToken: "SENTINEL_TOKEN_NUNCA_DEVE_APARECER",
  webhookVerifyToken: "verify-abc",
  appSecret: "secret-def",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("sendWhatsAppText", () => {
  it("sucesso: devolve success:true e o externalMessageId da Meta", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.OUT1" }] }), { status: 200 }));
    const outcome = await sendWhatsAppText(config, "+5511999998888", "Oi!");
    expect(outcome).toEqual({ success: true, result: "Mensagem enviada com sucesso via WhatsApp Cloud API.", externalMessageId: "wamid.OUT1" });
  });

  it("HTTP de erro da Meta -> success:false, nunca lança", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("erro", { status: 401 }));
    const outcome = await sendWhatsAppText(config, "+5511999998888", "Oi!");
    expect(outcome.success).toBe(false);
    expect(outcome.result).toContain("401");
  });

  it("erro de rede -> success:false, nunca lança", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));
    const outcome = await sendWhatsAppText(config, "+5511999998888", "Oi!");
    expect(outcome.success).toBe(false);
  });

  it("token nunca aparece no resultado, em nenhum cenário", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("erro", { status: 500 }));
    const outcome = await sendWhatsAppText(config, "+5511999998888", "Oi!");
    expect(outcome.result).not.toContain(config.accessToken);
  });

  it("Missão Z6.7 — HTTP 400 com corpo de erro no formato documentado pela Meta ({error:{message,code,...}}): captura mensagem/código/subcódigo/fbtrace_id para diagnóstico, sem nunca incluir credencial (exemplo sintético, não representa um código real específico)", async () => {
    const metaErrorShape = { error: { message: "Exemplo sintético de mensagem de erro", type: "OAuthException", code: 99999, error_subcode: 1234567, fbtrace_id: "AbCdEfGh123" } };
    vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify(metaErrorShape), { status: 400 }));
    const outcome = await sendWhatsAppText(config, "+5511999998888", "Oi!");
    expect(outcome.success).toBe(false);
    expect(outcome.result).toContain("Exemplo sintético de mensagem de erro");
    expect(outcome.result).toContain("99999");
    expect(outcome.result).toContain("1234567");
    expect(outcome.result).toContain("AbCdEfGh123");
    expect(outcome.result).not.toContain(config.accessToken);
  });

  it("HTTP de erro sem corpo JSON válido -> ainda devolve só o status, nunca lança", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("texto simples, não é JSON", { status: 403 }));
    const outcome = await sendWhatsAppText(config, "+5511999998888", "Oi!");
    expect(outcome.success).toBe(false);
    expect(outcome.result).toContain("403");
  });
});
