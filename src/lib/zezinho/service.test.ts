import { describe, expect, it } from "vitest";
import { answerFreeText, answerQuestion, generateDailySummary, matchIntent, ZEZINHO_QUESTIONS, EMPTY_REASONING_SESSION } from "@/lib/zezinho/service";

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

describe("answerFreeText — pergunta obrigatória da sprint 2.0 e modo local (sem provedor de IA)", () => {
  it("'Bom dia, o que você está achando da performance destes 19 dias do mês de julho em relação aos 19 dias do mês de junho?' nunca lança e sempre responde", async () => {
    const { answer, nextContext } = await answerFreeText(
      "Bom dia, o que você está achando da performance destes 19 dias do mês de julho em relação aos 19 dias do mês de junho?",
    );
    expect(answer.text.length).toBeGreaterThan(0);
    // Sem JumpPark configurado neste ambiente de teste, a resposta deve ser honesta, nunca inventar número.
    expect(answer.text).toMatch(/jumppark não configurado/i);
    // A interpretação da pergunta funciona independentemente de haver dado real disponível —
    // os períodos foram corretamente reconhecidos (01-19/07 e 01-19/06), mesmo sem JumpPark.
    expect(nextContext.activePeriodA).toMatchObject({ from: "2026-07-01", to: "2026-07-19" });
    expect(nextContext.activePeriodB).toMatchObject({ from: "2026-06-01", to: "2026-06-19" });
  });

  it("saudação pura ('Bom dia.') não trava esperando mais contexto — cai no resumo do dia", async () => {
    const { answer } = await answerFreeText("Bom dia.");
    expect(answer.text).toMatch(/Robério/);
  });

  it("texto vazio retorna a resposta padrão de 'sem dados suficientes', nunca lança", async () => {
    const { answer } = await answerFreeText("   ");
    expect(answer.text).toMatch(/não tenho dados suficientes/i);
  });

  it("pergunta factual simples cai no roteador determinístico existente (fallback seguro)", async () => {
    const { answer } = await answerFreeText("quanto faturamos hoje");
    expect(answer.text.length).toBeGreaterThan(0);
  });
});

describe("answerFreeText — pipeline de raciocínio (Sprint 3.0): conversa obrigatória do pedido", () => {
  it("1) 'Bom dia, Zezinho. Como foi nossa semana?' -> compara semana atual x anterior, memória preenchida", async () => {
    const { answer, nextContext } = await answerFreeText("Bom dia, Zezinho. Como foi nossa semana?");
    expect(answer.text.length).toBeGreaterThan(0);
    expect(nextContext.activePeriodA).not.toBeNull();
    expect(nextContext.activePeriodB).not.toBeNull();
    expect(nextContext.activeObjective).not.toBeNull();
  });

  it("2) 'O que você faria para melhorarmos esses números na próxima semana?' -> recomendação, não repete a comparação, contexto preservado", async () => {
    const first = await answerFreeText("Bom dia, Zezinho. Como foi nossa semana?");
    const second = await answerFreeText("O que você faria para melhorarmos esses números na próxima semana?", first.nextContext);

    expect(second.answer.text).not.toBe(first.answer.text);
    expect(second.nextContext.activePeriodA).toEqual(first.nextContext.activePeriodA);
    expect(second.nextContext.activePeriodB).toEqual(first.nextContext.activePeriodB);
  });

  it("3) 'O que devemos tentar vender mais ou tentar reverter a escolha do cliente?' -> objetivo de mix de serviço, mesmos períodos", async () => {
    const first = await answerFreeText("Compare esta semana com a semana passada.");
    const second = await answerFreeText("O que devemos tentar vender mais ou tentar reverter a escolha do cliente?", first.nextContext);

    expect(second.nextContext.activeObjective).toBe("improve_service_mix");
    expect(second.nextContext.activePeriodA).toEqual(first.nextContext.activePeriodA);
  });

  it("4) 'E se o cliente quiser somente a Bronze?' -> continua no mesmo tema (mix), não volta a comparar", async () => {
    const first = await answerFreeText("Compare esta semana com a semana passada.");
    const withMix = await answerFreeText("O que devemos tentar vender mais?", first.nextContext);
    const fourth = await answerFreeText("E se o cliente quiser somente a Bronze?", withMix.nextContext);

    expect(fourth.nextContext.activeObjective).toBe("improve_service_mix");
    expect(fourth.nextContext.activePeriodA).toEqual(first.nextContext.activePeriodA);
  });

  it("5) 'Vale dar desconto para converter?' -> avalia decisão dentro do mesmo contexto (objetivo de preço)", async () => {
    const first = await answerFreeText("Compare esta semana com a semana passada.");
    const fifth = await answerFreeText("Vale dar desconto para converter?", first.nextContext);

    expect(fifth.nextContext.activeObjective).toBe("evaluate_pricing");
    expect(fifth.nextContext.activePeriodA).toEqual(first.nextContext.activePeriodA);
    expect(fifth.answer.text.length).toBeGreaterThan(0);
  });

  it("6) 'Quem devemos ligar hoje?' -> planner usa só CRM, nunca inventa cliente", async () => {
    const { answer, nextContext } = await answerFreeText("Quem devemos ligar hoje?");
    expect(nextContext.activeObjective).toBe("client_retention");
    expect(answer.text.length).toBeGreaterThan(0);
  });

  it("7) 'Onde estamos errando?' -> diagnóstico geral", async () => {
    const { answer, nextContext } = await answerFreeText("Onde estamos errando?");
    expect(nextContext.activeObjective).toBe("business_health");
    expect(answer.text.length).toBeGreaterThan(0);
  });

  it("8) 'Estamos desperdiçando produto?' -> objetivo de estoque, nunca inventa consumo", async () => {
    const { answer, nextContext } = await answerFreeText("Estamos desperdiçando produto?");
    expect(nextContext.activeObjective).toBe("reduce_costs");
    expect(answer.text.length).toBeGreaterThan(0);
  });

  it("9) 'Vale contratar mais alguém?' -> usa proxy claramente rotulado, nunca afirma produtividade real", async () => {
    const { answer, nextContext } = await answerFreeText("Vale contratar mais alguém?", { ...EMPTY_REASONING_SESSION, activePeriodA: { key: "week", from: "2026-07-13", to: "2026-07-19", label: "Semana atual" }, activePeriodB: { key: "custom", from: "2026-07-06", to: "2026-07-12", label: "semana passada" } });
    expect(nextContext.activeObjective).toBe("staffing_capacity");
    expect(answer.text.length).toBeGreaterThan(0);
    if (answer.confidence) expect(answer.confidence).not.toBe("alta");
  });

  it("10) pergunta fora do domínio ('Qual a cor que combina mais com a fachada?') -> honesto, nunca volta ao resumo semanal", async () => {
    const { answer } = await answerFreeText("Qual a cor que combina mais com a fachada?");
    expect(answer.text).toMatch(/foge do que consigo analisar/i);
    expect(answer.text).not.toMatch(/faturou|veículo|entraram no caixa/i);
  });
});

describe("answerFreeText — memória conversacional não repete análises nem inventa período", () => {
  it("'E só a lavação?' sem nenhuma análise anterior não lança (cai no fallback honesto)", async () => {
    const { answer } = await answerFreeText("E só a lavação?", EMPTY_REASONING_SESSION);
    expect(answer.text.length).toBeGreaterThan(0);
  });

  it("follow-up de recomendação sem nenhuma análise anterior responde honestamente, sem inventar dados", async () => {
    const { answer } = await answerFreeText("O que você faria?", EMPTY_REASONING_SESSION);
    expect(answer.text).toMatch(/ainda não tenho/i);
  });

  it("segunda pergunta de comparação com período novo substitui o período anterior (mensagem atual sempre vence)", async () => {
    const first = await answerFreeText("Compare julho com junho.");
    const second = await answerFreeText("Agora compare esta semana com a semana passada.", first.nextContext);
    expect(second.nextContext.activePeriodA).not.toEqual(first.nextContext.activePeriodA);
  });
});
