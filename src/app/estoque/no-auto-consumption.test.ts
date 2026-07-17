import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda de regressão: nenhuma tela de receitas/calibração/mapeamentos pode chamar
 * recordMovement diretamente — só o formulário de movimentação manual e a confirmação de
 * contagem física (estoque/actions.ts) têm essa autorização, e ambos exigem confirmação humana
 * explícita. Ver SPRINT ESTOQUE INTELIGENTE 2.0, Fase C: "nenhuma baixa automática nesta fase".
 */
describe("Fase C: nenhuma baixa automática de estoque fora dos fluxos confirmados manualmente", () => {
  it.each(["receitas/actions.ts", "calibracao/actions.ts", "mapeamentos/actions.ts"])("%s nunca chama recordMovement", (relativePath) => {
    const source = readFileSync(path.resolve(__dirname, relativePath), "utf-8");
    expect(source).not.toContain("recordMovement");
  });

  it("actions.ts (movimentação manual + contagem física) é o único autorizado, via funções já validadas", () => {
    const source = readFileSync(path.resolve(__dirname, "actions.ts"), "utf-8");
    expect(source).toContain("recordManualMovement");
    expect(source).toContain("confirmStocktake");
  });
});
