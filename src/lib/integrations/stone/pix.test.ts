import { describe, expect, it } from "vitest";
import { buildPixWebhookRegistrationInput, derivePixWebhookSecret, STONE_PIX_WEBHOOK_STATUS, validatePixNotificationPayload, verifyStonePixWebhookAuth } from "@/lib/integrations/stone/pix";

describe("pix.ts — contrato Pix (Sprint 7.0, Z4) — sem rota pública", () => {
  it("status é sempre 'aguardando_configuracao' neste checkpoint", () => {
    expect(STONE_PIX_WEBHOOK_STATUS).toBe("aguardando_configuracao");
  });

  it("derivePixWebhookSecret é determinístico — mesma chave sempre produz o mesmo segredo", () => {
    const a = derivePixWebhookSecret("chave-teste");
    const b = derivePixWebhookSecret("chave-teste");
    expect(a).toBe(b);
    expect(a).not.toBe("chave-teste");
  });

  it("chaves diferentes produzem segredos diferentes", () => {
    expect(derivePixWebhookSecret("chave-a")).not.toBe(derivePixWebhookSecret("chave-b"));
  });

  it("buildPixWebhookRegistrationInput anexa o segredo no header, nunca na URL", () => {
    const input = buildPixWebhookRegistrationInput("https://example.com/webhook", "segredo-123");
    expect(input.url).toBe("https://example.com/webhook");
    expect(Object.values(input.headers ?? {})).toContain("segredo-123");
    expect(input.url).not.toContain("segredo-123");
  });

  it("verifyStonePixWebhookAuth aceita o segredo correto", () => {
    expect(verifyStonePixWebhookAuth({ "x-santa-monica-pix-secret": "segredo-123" }, "segredo-123")).toBe(true);
  });

  it("verifyStonePixWebhookAuth rejeita segredo incorreto", () => {
    expect(verifyStonePixWebhookAuth({ "x-santa-monica-pix-secret": "errado" }, "segredo-123")).toBe(false);
  });

  it("verifyStonePixWebhookAuth rejeita header ausente", () => {
    expect(verifyStonePixWebhookAuth({}, "segredo-123")).toBe(false);
  });

  it("verifyStonePixWebhookAuth nunca lança para header vazio ou segredo vazio", () => {
    expect(() => verifyStonePixWebhookAuth({ "x-santa-monica-pix-secret": "" }, "segredo-123")).not.toThrow();
    expect(verifyStonePixWebhookAuth({ "x-santa-monica-pix-secret": "" }, "segredo-123")).toBe(false);
    expect(verifyStonePixWebhookAuth({ "x-santa-monica-pix-secret": "x" }, "")).toBe(false);
  });

  it("validatePixNotificationPayload rejeita payload sem autenticação válida, mesmo com formato correto", () => {
    const result = validatePixNotificationPayload({ type: "pix", url: "https://x", document: "123", referenceDate: "2026-07-24" }, {}, "segredo-123");
    expect(result.valid).toBe(false);
    expect(result.payload).toBeNull();
  });

  it("validatePixNotificationPayload aceita payload autenticado e bem formado", () => {
    const result = validatePixNotificationPayload(
      { type: "pix", url: "https://x", document: "123", referenceDate: "2026-07-24" },
      { "x-santa-monica-pix-secret": "segredo-123" },
      "segredo-123",
    );
    expect(result.valid).toBe(true);
    expect(result.payload).toEqual({ type: "pix", url: "https://x", document: "123", referenceDate: "2026-07-24" });
  });

  it("validatePixNotificationPayload rejeita payload autenticado mas mal formado, nunca lança", () => {
    const result = validatePixNotificationPayload({ type: "pix" }, { "x-santa-monica-pix-secret": "segredo-123" }, "segredo-123");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("formato documentado");
  });

  it("validatePixNotificationPayload nunca lança para body não-objeto", () => {
    expect(() => validatePixNotificationPayload("string qualquer", { "x-santa-monica-pix-secret": "segredo-123" }, "segredo-123")).not.toThrow();
    expect(validatePixNotificationPayload(null, { "x-santa-monica-pix-secret": "segredo-123" }, "segredo-123").valid).toBe(false);
  });
});
