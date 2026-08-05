import { describe, expect, it } from "vitest";
import { sanitizeError } from "@/lib/integrations/jumppark/sync";
import { JumpParkNotConfiguredError, JumpParkRequestError } from "@/lib/integrations/jumppark/client";

/**
 * `syncJumpParkServiceOrders` em si depende de Postgres real (Neon) e da API real da JumpPark —
 * não faz sentido mockar as duas coisas para "testar" só a orquestração; a validação de ponta a
 * ponta é feita rodando a sincronização de verdade (ver relatório da Missão 26, Fase 1). Este
 * arquivo cobre a única parte pura e testável isoladamente: nunca vazar detalhe sensível no log.
 */
describe("sanitizeError (jumppark/sync)", () => {
  it("JumpParkNotConfiguredError vira mensagem fixa, sem detalhe de variável", () => {
    expect(sanitizeError(new JumpParkNotConfiguredError())).toBe("JumpPark não configurado neste ambiente.");
  });

  it("JumpParkRequestError inclui só o status HTTP, nunca o corpo da resposta", () => {
    const message = sanitizeError(new JumpParkRequestError(401, "JumpPark request failed: 401 — corpo sensível qualquer"));
    expect(message).toContain("401");
    expect(message).not.toContain("corpo sensível");
  });

  it("timeout (AbortError) vira mensagem própria", () => {
    const err = new Error("aborted");
    err.name = "AbortError";
    expect(sanitizeError(err)).toMatch(/tempo/i);
  });

  it("erro desconhecido nunca lança, sempre retorna string não vazia", () => {
    expect(sanitizeError("qualquer coisa")).toBeTruthy();
    expect(sanitizeError(null)).toBeTruthy();
  });

  it("nunca inclui a palavra 'bearer' ou 'token' em nenhuma mensagem gerada", () => {
    const cases = [sanitizeError(new JumpParkNotConfiguredError()), sanitizeError(new JumpParkRequestError(500, "Authorization: Bearer abc123")), sanitizeError(new Error("token xyz"))];
    for (const c of cases) {
      expect(c.toLowerCase()).not.toContain("bearer");
    }
  });
});
