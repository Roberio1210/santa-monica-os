import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSubscription, verifyMetaWebhookSignature, parseInboundWhatsAppPayload } from "@/lib/integrations/whatsapp/webhook";

/** Missão Z6.2 (testes obrigatórios 11, 12, 13). Pura, sem I/O — nenhuma rota é chamada aqui. */

describe("verifyWebhookSubscription — teste obrigatório 11 (GET de verificação)", () => {
  it("mode=subscribe + token correto -> devolve o challenge exatamente como recebido", () => {
    const result = verifyWebhookSubscription({ mode: "subscribe", token: "meu-token", challenge: "12345" }, "meu-token");
    expect(result).toBe("12345");
  });

  it("token incorreto -> null", () => {
    expect(verifyWebhookSubscription({ mode: "subscribe", token: "errado", challenge: "12345" }, "meu-token")).toBeNull();
  });

  it("mode diferente de subscribe -> null, mesmo com token correto", () => {
    expect(verifyWebhookSubscription({ mode: "unsubscribe", token: "meu-token", challenge: "12345" }, "meu-token")).toBeNull();
  });

  it("parâmetro ausente -> null, nunca lança", () => {
    expect(verifyWebhookSubscription({ mode: null, token: "meu-token", challenge: "12345" }, "meu-token")).toBeNull();
    expect(verifyWebhookSubscription({ mode: "subscribe", token: null, challenge: "12345" }, "meu-token")).toBeNull();
    expect(verifyWebhookSubscription({ mode: "subscribe", token: "meu-token", challenge: null }, "meu-token")).toBeNull();
  });
});

describe("verifyMetaWebhookSignature — teste obrigatório 13 (assinatura inválida rejeitada)", () => {
  const secret = "app-secret-xyz";
  const body = JSON.stringify({ hello: "world" });

  function sign(payload: string, s: string): string {
    return `sha256=${createHmac("sha256", s).update(payload, "utf-8").digest("hex")}`;
  }

  it("assinatura correta -> true", () => {
    expect(verifyMetaWebhookSignature(body, sign(body, secret), secret)).toBe(true);
  });

  it("assinatura de outro segredo -> false", () => {
    expect(verifyMetaWebhookSignature(body, sign(body, "outro-segredo"), secret)).toBe(false);
  });

  it("corpo alterado depois de assinado -> false", () => {
    expect(verifyMetaWebhookSignature(body + "adulterado", sign(body, secret), secret)).toBe(false);
  });

  it("header ausente -> false, nunca lança", () => {
    expect(verifyMetaWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyMetaWebhookSignature(body, undefined, secret)).toBe(false);
  });

  it("header sem o prefixo sha256= -> false", () => {
    expect(verifyMetaWebhookSignature(body, "abc123", secret)).toBe(false);
  });
});

describe("parseInboundWhatsAppPayload — teste obrigatório 12 (webhook POST válido)", () => {
  it("payload real da Meta (formato documentado) -> extrai telefone/message_id/tipo/texto/timestamp", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "entry-1",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                messages: [{ from: "5511999998888", id: "wamid.ABC123", timestamp: "1700000000", type: "text", text: { body: "Oi Zézinho" } }],
              },
            },
          ],
        },
      ],
    };
    const result = parseInboundWhatsAppPayload(payload);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ phoneRaw: "5511999998888", externalMessageId: "wamid.ABC123", type: "text", textBody: "Oi Zézinho" });
    expect(result[0].receivedAt).toEqual(new Date(1700000000 * 1000));
  });

  it("mensagem sem type=text (ex.: imagem) -> textBody null, resto preenchido", () => {
    const payload = { entry: [{ changes: [{ value: { messages: [{ from: "5511999998888", id: "wamid.IMG1", timestamp: "1700000000", type: "image" }] } }] }] };
    const result = parseInboundWhatsAppPayload(payload);
    expect(result[0].textBody).toBeNull();
    expect(result[0].type).toBe("image");
  });

  it("mensagem sem 'from'/'id'/'type'/'timestamp' -> descartada silenciosamente, nunca vira registro incompleto", () => {
    const payload = { entry: [{ changes: [{ value: { messages: [{ id: "wamid.SEMFROM", timestamp: "1700000000", type: "text" }] } }] }] };
    expect(parseInboundWhatsAppPayload(payload)).toEqual([]);
  });

  it("payload malformado/vazio/nulo -> lista vazia, nunca lança", () => {
    expect(parseInboundWhatsAppPayload(null)).toEqual([]);
    expect(parseInboundWhatsAppPayload({})).toEqual([]);
    expect(parseInboundWhatsAppPayload({ entry: "não é array" })).toEqual([]);
    expect(parseInboundWhatsAppPayload("string qualquer")).toEqual([]);
  });

  it("múltiplas mensagens em múltiplos entries/changes -> todas extraídas", () => {
    const payload = {
      entry: [
        { changes: [{ value: { messages: [{ from: "5511999998888", id: "wamid.1", timestamp: "1700000000", type: "text", text: { body: "a" } }] } }] },
        { changes: [{ value: { messages: [{ from: "5521988887777", id: "wamid.2", timestamp: "1700000100", type: "text", text: { body: "b" } }] } }] },
      ],
    };
    expect(parseInboundWhatsAppPayload(payload)).toHaveLength(2);
  });
});
