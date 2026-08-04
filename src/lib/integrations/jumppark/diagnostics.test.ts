import { describe, expect, it } from "vitest";
import { classifyJumpParkError } from "./diagnostics";
import { JumpParkNotConfiguredError, JumpParkRequestError } from "./client";

/**
 * Missão de estabilização (04/08/2026) — cobre a classificação de erro real da integração
 * JumpPark. Cada causa precisa de uma mensagem honesta e uma ação recomendada específica;
 * "token_rejeitado" (401/403) nunca pode virar só "falha de conexão" genérica.
 */
describe("classifyJumpParkError", () => {
  it("JumpParkNotConfiguredError vira causa 'nao_configurado' com instrução das variáveis", () => {
    const result = classifyJumpParkError(new JumpParkNotConfiguredError());
    expect(result.cause).toBe("nao_configurado");
    expect(result.recommendedAction).toContain("JUMPPARK_API_TOKEN");
  });

  it("HTTP 401 vira causa 'token_rejeitado' com instrução de renovação no painel JumpPark", () => {
    const result = classifyJumpParkError(new JumpParkRequestError(401, "JumpPark request failed: 401"));
    expect(result.cause).toBe("token_rejeitado");
    expect(result.message).toMatch(/expirou|revogado/i);
    expect(result.recommendedAction).toContain("admin.jumppark.com.br");
  });

  it("HTTP 403 também vira causa 'token_rejeitado' (mesmo tratamento que 401)", () => {
    const result = classifyJumpParkError(new JumpParkRequestError(403, "JumpPark request failed: 403"));
    expect(result.cause).toBe("token_rejeitado");
  });

  it("HTTP 404 vira causa 'endpoint_nao_encontrado', nunca confundido com token rejeitado", () => {
    const result = classifyJumpParkError(new JumpParkRequestError(404, "JumpPark request failed: 404"));
    expect(result.cause).toBe("endpoint_nao_encontrado");
    expect(result.recommendedAction).toContain("JUMPPARK_ESTABLISHMENT_ID");
  });

  it("outro HTTP (ex.: 500) vira causa genérica 'erro_http', com o status na mensagem", () => {
    const result = classifyJumpParkError(new JumpParkRequestError(500, "JumpPark request failed: 500"));
    expect(result.cause).toBe("erro_http");
    expect(result.message).toContain("500");
  });

  it("AbortError (timeout do fetch) vira causa 'timeout'", () => {
    const err = new Error("The operation was aborted");
    err.name = "AbortError";
    const result = classifyJumpParkError(err);
    expect(result.cause).toBe("timeout");
  });

  it("erro desconhecido nunca lança — sempre classifica como 'erro_desconhecido'", () => {
    const result = classifyJumpParkError("uma string qualquer, não um Error");
    expect(result.cause).toBe("erro_desconhecido");
    expect(result.message).toBeTruthy();
  });

  it("nunca inclui token/segredo em nenhuma mensagem gerada", () => {
    const cases = [
      classifyJumpParkError(new JumpParkNotConfiguredError()),
      classifyJumpParkError(new JumpParkRequestError(401, "x")),
      classifyJumpParkError(new JumpParkRequestError(404, "x")),
    ];
    for (const c of cases) {
      expect(c.message.toLowerCase()).not.toContain("bearer");
      expect(c.recommendedAction?.toLowerCase() ?? "").not.toContain("bearer");
    }
  });
});
