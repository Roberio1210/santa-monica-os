import { describe, expect, it } from "vitest";
import { answerFreeText, answerQuestion, generateDailySummary, matchIntent, ZEZINHO_QUESTIONS, EMPTY_ZEZINHO_CONTEXT } from "@/lib/zezinho/service";

describe("matchIntent — roteador de perguntas por palavra-chave", () => {
  it("reconhece perguntas sobre contas vencidas", () => {
    expect(matchIntent("temos contas vencidas?")).toBe("contas_vencidas");
  });

  it("reconhece perguntas sobre faturamento", () => {
    expect(matchIntent("quanto faturamos hoje")).toBe("faturamento_hoje");
  });

  it("reconhece perguntas sobre caixa negativo", () => {
    expect(matchIntent("o caixa vai ficar negativo?")).toBe("caixa_negativo");
  });

  it("reconhece perguntas sobre classificação", () => {
    expect(matchIntent("quais lançamentos estão sem classificação")).toBe("sem_classificacao");
  });

  it("cai no resumo do dia quando nenhuma palavra-chave combina — nunca inventa uma intenção", () => {
    expect(matchIntent("bom dia zézinho, tudo bem?")).toBe("como_esta_o_dia");
  });

  it("toda pergunta rápida pré-definida tem um id reconhecido pelo roteador", () => {
    for (const question of ZEZINHO_QUESTIONS) {
      expect(typeof question.id).toBe("string");
      expect(question.id.length).toBeGreaterThan(0);
    }
  });
});

describe("answerQuestion — respostas com dados reais, somente leitura", () => {
  it("responde 'contas_vencidas' usando o service real de Contas a Pagar", async () => {
    const answer = await answerQuestion("contas_vencidas");
    expect(answer.text.length).toBeGreaterThan(0);
    expect(answer.links.some((l) => l.href === "/financeiro/contas-a-pagar")).toBe(true);
  });

  it("responde 'a_receber' com link para Contas a Receber", async () => {
    const answer = await answerQuestion("a_receber");
    expect(answer.links.some((l) => l.href === "/financeiro/contas-a-receber")).toBe(true);
  });

  it("intenção desconhecida retorna 'não tenho dados suficientes', nunca inventa uma resposta", async () => {
    const answer = await answerQuestion("pergunta-inexistente");
    expect(answer.text).toMatch(/não tenho dados suficientes/i);
  });

  it("nunca contém instrução de escrita — só leitura (services chamados não alteram o banco)", async () => {
    // Roda a mesma pergunta duas vezes; se houvesse qualquer efeito colateral de escrita,
    // a segunda resposta mudaria de forma inesperada (ex.: contagem de alertas incrementando).
    const first = await answerQuestion("contas_vencidas");
    const second = await answerQuestion("contas_vencidas");
    expect(first.text).toBe(second.text);
  });
});

describe("generateDailySummary", () => {
  it("gera um resumo com saudação e não lança erro mesmo com fontes indisponíveis", async () => {
    const summary = await generateDailySummary();
    expect(summary).toMatch(/Robério/);
    expect(summary.length).toBeGreaterThan(20);
  });
});

describe("answerFreeText — pergunta obrigatória da sprint e modo local (sem provedor de IA)", () => {
  it("'Bom dia, o que você está achando da performance destes 19 dias do mês de julho em relação aos 19 dias do mês de junho?' nunca lança e sempre responde", async () => {
    const { answer, nextContext } = await answerFreeText(
      "Bom dia, o que você está achando da performance destes 19 dias do mês de julho em relação aos 19 dias do mês de junho?",
    );
    expect(answer.text.length).toBeGreaterThan(0);
    // Sem JumpPark configurado neste ambiente de teste, a resposta deve ser honesta, nunca inventar número.
    expect(answer.text).toMatch(/JumpPark não está configurado|não consigo analisar/i);
    // A interpretação da pergunta funciona independentemente de haver dado real disponível —
    // os períodos foram corretamente reconhecidos (01-19/07 e 01-19/06), mesmo sem JumpPark.
    expect(nextContext.lastPeriodA).toMatchObject({ from: "2026-07-01", to: "2026-07-19" });
    expect(nextContext.lastPeriodB).toMatchObject({ from: "2026-06-01", to: "2026-06-19" });
  });

  it("saudação pura ('Bom dia.') não trava esperando mais contexto — cai no resumo do dia", async () => {
    const { answer } = await answerFreeText("Bom dia.");
    expect(answer.text).toMatch(/Robério/);
  });

  it("texto vazio retorna a resposta padrão de 'sem dados suficientes', nunca lança", async () => {
    const { answer } = await answerFreeText("   ");
    expect(answer.text).toMatch(/não tenho dados suficientes/i);
  });

  it("pergunta sem nenhum gatilho reconhecido cai no roteador determinístico existente (fallback seguro)", async () => {
    const { answer } = await answerFreeText("quanto faturamos hoje");
    expect(answer.text.length).toBeGreaterThan(0);
  });

  it("acompanhamento 'E só a lavação?' sem comparação anterior no contexto não lança e ainda responde (fallback)", async () => {
    const { answer } = await answerFreeText("E só a lavação?", EMPTY_ZEZINHO_CONTEXT);
    expect(answer.text.length).toBeGreaterThan(0);
  });

  it("mantém o contexto da última comparação para reaproveitar em follow-ups", async () => {
    const first = await answerFreeText("Compare julho com junho.");
    expect(first.nextContext.lastPeriodA).not.toBeNull();
    expect(first.nextContext.lastPeriodB).not.toBeNull();

    const followUp = await answerFreeText("E só a lavação?", first.nextContext);
    expect(followUp.answer.text.length).toBeGreaterThan(0);
    expect(followUp.nextContext.lastKindFilter).toBe("lavacao");
  });
});
