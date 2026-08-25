import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSubscription, verifyMetaWebhookSignature, parseInboundWhatsAppPayload, parseWhatsAppStatusUpdates } from "@/lib/integrations/whatsapp/webhook";

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

  it("Missão Z6.6 (prevenção de loop) — captura o número comercial de value.metadata.display_phone_number quando presente", () => {
    const payload = {
      entry: [{ changes: [{ value: { metadata: { display_phone_number: "554891741102", phone_number_id: "123" }, messages: [{ from: "5511999998888", id: "wamid.X", timestamp: "1700000000", type: "text", text: { body: "oi" } }] } }] }],
    };
    const result = parseInboundWhatsAppPayload(payload);
    expect(result[0].businessPhoneRaw).toBe("554891741102");
  });

  it("sem metadata.display_phone_number -> businessPhoneRaw null, nunca inventado", () => {
    const payload = { entry: [{ changes: [{ value: { messages: [{ from: "5511999998888", id: "wamid.Y", timestamp: "1700000000", type: "text", text: { body: "oi" } }] } }] }] };
    const result = parseInboundWhatsAppPayload(payload);
    expect(result[0].businessPhoneRaw).toBeNull();
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

/**
 * Missão Z6.7 — testes obrigatórios: "sent"/"delivered"/"read"/"failed com errors[]"/"status para
 * wamid desconhecido" (esse último é resolvido a nível de serviço, ver whatsappConversations.test.ts
 * — aqui só provamos que o PARSING extrai corretamente qualquer wamid, conhecido ou não).
 */
describe("parseWhatsAppStatusUpdates", () => {
  it('"sent" — extrai id/status/recipient_id/timestamp/conversation/pricing', () => {
    const payload = {
      entry: [{ changes: [{ value: {
        statuses: [{
          id: "wamid.OUT1", status: "sent", timestamp: "1700000000", recipient_id: "5511999998888",
          conversation: { id: "conv-abc", origin: { type: "service" } },
          pricing: { billable: true, pricing_model: "CBP", category: "service" },
        }],
      } }] }],
    };
    const result = parseWhatsAppStatusUpdates(payload);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ wamid: "wamid.OUT1", status: "sent", recipientId: "5511999998888", conversationId: "conv-abc", pricingCategory: "service" });
    expect(result[0].timestamp).toEqual(new Date(1700000000 * 1000));
    expect(result[0].errors).toEqual([]);
  });

  it('"delivered" — mesmo formato documentado oficialmente pela Meta', () => {
    const payload = {
      entry: [{ changes: [{ value: {
        statuses: [{ id: "wamid.OUT2", status: "delivered", timestamp: "1700000100", recipient_id: "5511999998888", conversation: { id: "conv-abc" }, pricing: { category: "service" } }],
      } }] }],
    };
    const result = parseWhatsAppStatusUpdates(payload);
    expect(result[0].status).toBe("delivered");
  });

  it('"read" — extraído da mesma forma', () => {
    const payload = { entry: [{ changes: [{ value: { statuses: [{ id: "wamid.OUT3", status: "read", timestamp: "1700000200", recipient_id: "5511999998888" }] } }] }] };
    const result = parseWhatsAppStatusUpdates(payload);
    expect(result[0].status).toBe("read");
  });

  it('"failed" com errors[] — captura code/title/message/href/error_data de cada erro', () => {
    const payload = {
      entry: [{ changes: [{ value: {
        statuses: [{
          id: "wamid.OUT4", status: "failed", timestamp: "1700000300", recipient_id: "5511999998888",
          errors: [{ code: 131051, title: "Unsupported message type", message: "Mensagem não suportada", href: "https://developers.facebook.com/docs/whatsapp/", error_data: { details: "detalhe real" } }],
        }],
      } }] }],
    };
    const result = parseWhatsAppStatusUpdates(payload);
    expect(result[0].status).toBe("failed");
    expect(result[0].errors).toEqual([{ code: 131051, title: "Unsupported message type", message: "Mensagem não suportada", href: "https://developers.facebook.com/docs/whatsapp/", errorData: { details: "detalhe real" } }]);
  });

  it("payload com messages[] E statuses[] na mesma value -> os dois são extraídos, cada função só olha o seu array", () => {
    const payload = {
      entry: [{ changes: [{ value: {
        messages: [{ from: "5511999998888", id: "wamid.IN1", timestamp: "1700000000", type: "text", text: { body: "oi" } }],
        statuses: [{ id: "wamid.OUT5", status: "delivered", timestamp: "1700000100", recipient_id: "5511999998888" }],
      } }] }],
    };
    expect(parseInboundWhatsAppPayload(payload)).toHaveLength(1);
    expect(parseWhatsAppStatusUpdates(payload)).toHaveLength(1);
  });

  it("status sem id ou sem status -> descartado silenciosamente, nunca vira registro incompleto", () => {
    const payload = { entry: [{ changes: [{ value: { statuses: [{ status: "sent", timestamp: "1700000000" }, { id: "wamid.SEMSTATUS", timestamp: "1700000000" }] } }] }] };
    expect(parseWhatsAppStatusUpdates(payload)).toEqual([]);
  });

  it("payload malformado/vazio/nulo -> lista vazia, nunca lança", () => {
    expect(parseWhatsAppStatusUpdates(null)).toEqual([]);
    expect(parseWhatsAppStatusUpdates({})).toEqual([]);
    expect(parseWhatsAppStatusUpdates({ entry: "não é array" })).toEqual([]);
  });

  it("wamid desconhecido (qualquer valor válido) ainda é extraído normalmente pelo parser — a correlação com o banco é responsabilidade de outra camada", () => {
    const payload = { entry: [{ changes: [{ value: { statuses: [{ id: "wamid.NUNCA_EXISTIU", status: "delivered", timestamp: "1700000000" }] } }] }] };
    const result = parseWhatsAppStatusUpdates(payload);
    expect(result[0].wamid).toBe("wamid.NUNCA_EXISTIU");
  });
});
