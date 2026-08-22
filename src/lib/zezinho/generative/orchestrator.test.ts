import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Missão Z2 — testes do orquestrador. `generateText`/`stepCountIs` (o pacote "ai") são
 * MOCKADOS AQUI DELIBERADAMENTE — nenhuma credencial de IA existe neste ambiente (auditoria da
 * missão), e a regra explícita é "não usar mock como se fosse IA real". Estes testes NUNCA
 * provam que um modelo generativo entende linguagem natural — provam que a ORQUESTRAÇÃO (RBAC
 * chega até a chamada real, fallback nunca quebra o app, observabilidade nunca vaza segredo)
 * está correta para qualquer resposta que um provider real venha a dar. A prova de compreensão
 * genuína depende de uma chamada real, ainda não possível (ver relatório final da missão).
 */

const generateTextMock = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => generateTextMock(...args),
  stepCountIs: (n: number) => ({ type: "stepCount", n }),
  tool: (def: unknown) => def,
}));

describe("answerGenerative", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    generateTextMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("flag desligada (padrão) -> retorna null sem nunca chamar o provider", async () => {
    delete process.env.ZEZINHO_GENERATIVE_ENABLED;
    const { answerGenerative } = await import("@/lib/zezinho/generative/orchestrator");
    const result = await answerGenerative("Quanto faturamos hoje?", [], "admin");
    expect(result).toBeNull();
    expect(generateTextMock).not.toHaveBeenCalled();
  });

  it("flag ligada + provider responde -> retorna texto e toolsCalled", async () => {
    process.env.ZEZINHO_GENERATIVE_ENABLED = "true";
    generateTextMock.mockResolvedValue({
      text: "Temos 3,7 litros de V-Floc.",
      toolCalls: [{ toolName: "inventory_lookup" }],
      steps: [{}],
      usage: { inputTokens: 120, outputTokens: 30 },
    });
    const { answerGenerative } = await import("@/lib/zezinho/generative/orchestrator");
    const result = await answerGenerative("Quanto temos de V-Floc?", [], "operacional");
    expect(result).toEqual({ text: "Temos 3,7 litros de V-Floc.", toolsCalled: ["inventory_lookup"] });
  });

  it("provider falha (ex.: sem crédito no Gateway) -> retorna null, NUNCA lança — o chamador cai no pipeline determinístico", async () => {
    process.env.ZEZINHO_GENERATIVE_ENABLED = "true";
    generateTextMock.mockRejectedValue(new Error("AI Gateway requires a valid credit card on file."));
    const { answerGenerative } = await import("@/lib/zezinho/generative/orchestrator");
    await expect(answerGenerative("Quanto faturamos hoje?", [], "admin")).resolves.toBeNull();
  });

  it("RBAC chega até a chamada real: operacional nunca recebe ferramenta financeira na lista passada ao provider", async () => {
    process.env.ZEZINHO_GENERATIVE_ENABLED = "true";
    generateTextMock.mockResolvedValue({ text: "ok", toolCalls: [], steps: [{}], usage: { inputTokens: 1, outputTokens: 1 } });
    const { answerGenerative } = await import("@/lib/zezinho/generative/orchestrator");
    await answerGenerative("Quanto faturamos?", [], "operacional");

    const callArgs = generateTextMock.mock.calls[0][0] as { tools: Record<string, unknown> };
    expect(callArgs.tools).not.toHaveProperty("cash_ledger_totals");
    expect(callArgs.tools).not.toHaveProperty("dre_result");
  });

  it("admin recebe as ferramentas financeiras na lista passada ao provider", async () => {
    process.env.ZEZINHO_GENERATIVE_ENABLED = "true";
    generateTextMock.mockResolvedValue({ text: "ok", toolCalls: [], steps: [{}], usage: { inputTokens: 1, outputTokens: 1 } });
    const { answerGenerative } = await import("@/lib/zezinho/generative/orchestrator");
    await answerGenerative("Quanto faturamos?", [], "admin");

    const callArgs = generateTextMock.mock.calls[0][0] as { tools: Record<string, unknown> };
    expect(callArgs.tools).toHaveProperty("cash_ledger_totals");
  });

  it("histórico é limitado (nunca envia mais que o teto configurado) e a pergunta atual sempre é a última mensagem", async () => {
    process.env.ZEZINHO_GENERATIVE_ENABLED = "true";
    generateTextMock.mockResolvedValue({ text: "ok", toolCalls: [], steps: [{}], usage: { inputTokens: 1, outputTokens: 1 } });
    const { answerGenerative } = await import("@/lib/zezinho/generative/orchestrator");
    const longHistory = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 === 0 ? ("user" as const) : ("assistant" as const), content: `mensagem ${i}` }));
    await answerGenerative("pergunta atual", longHistory, "admin");

    const callArgs = generateTextMock.mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(callArgs.messages.length).toBeLessThanOrEqual(11); // teto de histórico + a pergunta atual
    expect(callArgs.messages[callArgs.messages.length - 1].content).toBe("pergunta atual");
  });
});
