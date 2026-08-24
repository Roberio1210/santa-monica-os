import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Missão Z2 — testes do orquestrador. `generateText`/`stepCountIs` (o pacote "ai") são
 * MOCKADOS AQUI DELIBERADAMENTE — a regra explícita da missão é "não usar mock como se fosse IA
 * real". Estes testes NUNCA provam que um modelo generativo entende linguagem natural — provam
 * que a ORQUESTRAÇÃO (RBAC chega até a chamada real, fallback nunca quebra o app,
 * observabilidade nunca vaza segredo) está correta para qualquer resposta que um provider real
 * venha a dar. A prova de compreensão genuína veio de chamadas reais na Missão Z2.1 (ver
 * relatório final) — o teste de `stripLeakedReasoningChannel` abaixo existe porque uma dessas
 * chamadas reais (openai/gpt-oss-20b, formato Harmony) revelou esse vazamento de verdade.
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

  it("Missão Z2.1 (bug real encontrado em produção) — remove o vazamento do canal de raciocínio do formato Harmony (openai/gpt-oss-20b) antes de responder ao usuário", async () => {
    process.env.ZEZINHO_GENERATIVE_ENABLED = "true";
    generateTextMock.mockResolvedValue({
      text: 'analysisO usuário perguntou sobre o clima, a tool disse não configurado, devo responder honestamente.assistantfinalDesculpe, mas não tenho acesso à previsão do tempo neste momento.',
      toolCalls: [],
      steps: [{}],
      usage: { inputTokens: 10, outputTokens: 10 },
    });
    const { answerGenerative } = await import("@/lib/zezinho/generative/orchestrator");
    const result = await answerGenerative("Vai chover?", [], "operacional");
    expect(result?.text).toBe("Desculpe, mas não tenho acesso à previsão do tempo neste momento.");
    expect(result?.text).not.toContain("analysis");
    expect(result?.text).not.toContain("assistantfinal");
  });

  it("Missão Z3 (segunda variante real encontrada em produção) — remove também o marcador literal '<|channel|>final<|message|>'", async () => {
    process.env.ZEZINHO_GENERATIVE_ENABLED = "true";
    generateTextMock.mockResolvedValue({
      text: "<|channel|>final<|message|>O Pacote Gold para SUV custa R$ 240,00.",
      toolCalls: [],
      steps: [{}],
      usage: { inputTokens: 10, outputTokens: 10 },
    });
    const { answerGenerative } = await import("@/lib/zezinho/generative/orchestrator");
    const result = await answerGenerative("Quanto custa a Gold para SUV?", [], "operacional");
    expect(result?.text).toBe("O Pacote Gold para SUV custa R$ 240,00.");
    expect(result?.text).not.toContain("<|channel|>");
  });

  it("Missão Z3.2 (terceira variante real encontrada em produção) — remove o nome de canal solto colado no início ('finalPelo que encontrei...')", async () => {
    process.env.ZEZINHO_GENERATIVE_ENABLED = "true";
    generateTextMock.mockResolvedValue({
      text: "finalPelo que encontrei na política comercial, o preço-base do Polimento Comercial é R$ 600.",
      toolCalls: [],
      steps: [{}],
      usage: { inputTokens: 10, outputTokens: 10 },
    });
    const { answerGenerative } = await import("@/lib/zezinho/generative/orchestrator");
    const result = await answerGenerative("Quanto custa o polimento comercial?", [], "operacional");
    expect(result?.text).toBe("Pelo que encontrei na política comercial, o preço-base do Polimento Comercial é R$ 600.");
    expect(result?.text.startsWith("final")).toBe(false);
  });

  it("Missão Z4 (quarta variante real encontrada em produção, confirmação com chamada real autenticada como admin) — remove 'final' colado direto num negrito markdown ('final**Fechamento...')", async () => {
    process.env.ZEZINHO_GENERATIVE_ENABLED = "true";
    generateTextMock.mockResolvedValue({
      text: "final**Fechamento Gerencial – Hoje**\n\n| Indicador | Valor |",
      toolCalls: [],
      steps: [{}],
      usage: { inputTokens: 10, outputTokens: 10 },
    });
    const { answerGenerative } = await import("@/lib/zezinho/generative/orchestrator");
    const result = await answerGenerative("Fecha o dia", [], "admin");
    expect(result?.text.startsWith("**Fechamento Gerencial")).toBe(true);
    expect(result?.text.startsWith("final")).toBe(false);
  });

  it("Missão Z4 (quinta variante real, segunda confirmação com chamada real autenticada como admin) — remove 'final' colado direto num heading markdown ('final### Fechamento...')", async () => {
    process.env.ZEZINHO_GENERATIVE_ENABLED = "true";
    generateTextMock.mockResolvedValue({
      text: "final### Fechamento gerencial – dia de hoje\n\n| Item | Resultado |",
      toolCalls: [],
      steps: [{}],
      usage: { inputTokens: 10, outputTokens: 10 },
    });
    const { answerGenerative } = await import("@/lib/zezinho/generative/orchestrator");
    const result = await answerGenerative("Fecha o dia", [], "admin");
    expect(result?.text.startsWith("### Fechamento gerencial")).toBe(true);
    expect(result?.text.startsWith("final")).toBe(false);
  });

  it("regra geral: nunca depende de uma lista fixa de marcadores — qualquer pontuação/markdown colado direto é removido (lista, citação, crase)", async () => {
    process.env.ZEZINHO_GENERATIVE_ENABLED = "true";
    const cases = ["final- item da lista", "final> uma citação", "final`código`", "final(observação)"];
    for (const text of cases) {
      generateTextMock.mockResolvedValue({ text, toolCalls: [], steps: [{}], usage: { inputTokens: 1, outputTokens: 1 } });
      const { answerGenerative } = await import("@/lib/zezinho/generative/orchestrator");
      const result = await answerGenerative("oi", [], "operacional");
      expect(result?.text.startsWith("final")).toBe(false);
    }
  });

  it("nunca remove 'final' quando é o início de uma palavra real em português (ex.: 'finalizar', 'finalmente') — só depois de espaço é que a frase real continua", async () => {
    process.env.ZEZINHO_GENERATIVE_ENABLED = "true";
    generateTextMock.mockResolvedValue({ text: "finalizar o atendimento está quase pronto.", toolCalls: [], steps: [{}], usage: { inputTokens: 1, outputTokens: 1 } });
    const { answerGenerative } = await import("@/lib/zezinho/generative/orchestrator");
    const result = await answerGenerative("oi", [], "operacional");
    expect(result?.text).toBe("finalizar o atendimento está quase pronto.");
  });

  it("nunca remove a palavra 'final' quando ela é parte legítima de uma frase real (com espaço depois)", async () => {
    process.env.ZEZINHO_GENERATIVE_ENABLED = "true";
    generateTextMock.mockResolvedValue({ text: "final ajuste feito com sucesso.", toolCalls: [], steps: [{}], usage: { inputTokens: 1, outputTokens: 1 } });
    const { answerGenerative } = await import("@/lib/zezinho/generative/orchestrator");
    const result = await answerGenerative("oi", [], "operacional");
    expect(result?.text).toBe("final ajuste feito com sucesso.");
  });

  it("texto sem o marcador do formato Harmony passa intacto (nunca corta resposta de outros modelos)", async () => {
    process.env.ZEZINHO_GENERATIVE_ENABLED = "true";
    generateTextMock.mockResolvedValue({ text: "Resposta normal, sem nenhum canal interno.", toolCalls: [], steps: [{}], usage: { inputTokens: 1, outputTokens: 1 } });
    const { answerGenerative } = await import("@/lib/zezinho/generative/orchestrator");
    const result = await answerGenerative("oi", [], "operacional");
    expect(result?.text).toBe("Resposta normal, sem nenhum canal interno.");
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
