import { describe, expect, it } from "vitest";
import { classifyIntent } from "@/lib/zezinho/intent/classify";
import { EMPTY_REASONING_SESSION } from "@/lib/zezinho/memory/types";
import type { ReasoningSession } from "@/lib/zezinho/memory/types";

const REFERENCE = new Date("2026-07-19T15:00:00.000Z");

const SESSION_WITH_ANALYSIS: ReasoningSession = {
  ...EMPTY_REASONING_SESSION,
  activePeriodA: { key: "week", from: "2026-07-13", to: "2026-07-19", label: "Semana atual" },
  activePeriodB: { key: "custom", from: "2026-07-06", to: "2026-07-12", label: "semana passada" },
};

describe("classifyIntent — recommend", () => {
  it("'O que você faria?'", () => {
    expect(classifyIntent("O que você faria?", EMPTY_REASONING_SESSION, REFERENCE).intent).toBe("recommend");
  });

  it("'O que devemos fazer?'", () => {
    expect(classifyIntent("O que devemos fazer?", EMPTY_REASONING_SESSION, REFERENCE).intent).toBe("recommend");
  });

  it("'Quem devemos ligar hoje?' — recomendação com tópico clientes", () => {
    const result = classifyIntent("Quem devemos ligar hoje?", EMPTY_REASONING_SESSION, REFERENCE);
    expect(result.intent).toBe("recommend");
    expect(result.entities.topic).toBe("clientes");
  });
});

describe("classifyIntent — evaluate_decision", () => {
  it("'Vale aumentar o preço?' — tópico preço", () => {
    const result = classifyIntent("Vale aumentar o preço?", EMPTY_REASONING_SESSION, REFERENCE);
    expect(result.intent).toBe("evaluate_decision");
    expect(result.entities.topic).toBe("preco");
  });

  it("'Vale contratar?' — tópico equipe", () => {
    const result = classifyIntent("Vale contratar?", EMPTY_REASONING_SESSION, REFERENCE);
    expect(result.intent).toBe("evaluate_decision");
    expect(result.entities.topic).toBe("equipe");
  });

  it("'Devemos vender mais Silver?' — pacote Silver, não colide com 'recommend'", () => {
    const result = classifyIntent("Devemos vender mais Silver?", EMPTY_REASONING_SESSION, REFERENCE);
    expect(result.intent).toBe("evaluate_decision");
    expect(result.entities.packageMentioned).toBe("Silver");
  });
});

describe("classifyIntent — diagnose", () => {
  it("'Onde estamos errando?'", () => {
    expect(classifyIntent("Onde estamos errando?", EMPTY_REASONING_SESSION, REFERENCE).intent).toBe("diagnose");
  });

  it("'Tem alguma coisa preocupante?'", () => {
    expect(classifyIntent("Tem alguma coisa preocupante?", EMPTY_REASONING_SESSION, REFERENCE).intent).toBe("diagnose");
  });
});

describe("classifyIntent — explain", () => {
  it("'Por que isso aconteceu?'", () => {
    expect(classifyIntent("Por que isso aconteceu?", EMPTY_REASONING_SESSION, REFERENCE).intent).toBe("explain");
  });
});

describe("classifyIntent — compare", () => {
  it("'Compare julho com junho.'", () => {
    expect(classifyIntent("Compare julho com junho.", EMPTY_REASONING_SESSION, REFERENCE).intent).toBe("compare");
  });

  it("'Como foi essa nossa semana?'", () => {
    expect(classifyIntent("Como foi essa nossa semana?", EMPTY_REASONING_SESSION, REFERENCE).intent).toBe("compare");
  });

  it("'E só a lavação?' com análise ativa na sessão — drill-down, continua sendo compare", () => {
    const result = classifyIntent("E só a lavação?", SESSION_WITH_ANALYSIS, REFERENCE);
    expect(result.intent).toBe("compare");
    expect(result.entities.areaFilter).toBe("lavacao");
  });

  it("'E só a lavação?' sem nenhuma análise ativa — não vira compare (não há o que filtrar)", () => {
    const result = classifyIntent("E só a lavação?", EMPTY_REASONING_SESSION, REFERENCE);
    expect(result.intent).not.toBe("compare");
  });
});

describe("classifyIntent — status_check", () => {
  it("'Como está a empresa hoje?'", () => {
    expect(classifyIntent("Como está a empresa hoje?", EMPTY_REASONING_SESSION, REFERENCE).intent).toBe("status_check");
  });
});

describe("classifyIntent — inform (fallback determinístico)", () => {
  it("'Quanto faturamos hoje?' — pergunta factual direta", () => {
    expect(classifyIntent("Quanto faturamos hoje?", EMPTY_REASONING_SESSION, REFERENCE).intent).toBe("inform");
  });
});

describe("classifyIntent — clarify_needed (só em último caso, conteúdo insuficiente)", () => {
  it("'?' sem nenhum conteúdo reconhecível", () => {
    expect(classifyIntent("?", EMPTY_REASONING_SESSION, REFERENCE).intent).toBe("clarify_needed");
  });

  it("não é o caminho comum — nenhuma das perguntas reais do pedido cai em clarify_needed", () => {
    const realQuestions = [
      "O que você faria?",
      "Vale aumentar o preço?",
      "Onde estamos errando?",
      "Quem devemos ligar hoje?",
      "Como foi essa nossa semana?",
      "Por que isso aconteceu?",
      "Devemos vender mais Silver?",
      "Vale contratar?",
    ];
    for (const q of realQuestions) {
      expect(classifyIntent(q, EMPTY_REASONING_SESSION, REFERENCE).intent).not.toBe("clarify_needed");
    }
  });
});

describe("classifyIntent — conversa obrigatória da Sprint 3.0", () => {
  it("'O que devemos tentar vender mais ou tentar reverter a escolha do cliente?' -> recommend (tópico mix)", () => {
    const result = classifyIntent("O que devemos tentar vender mais ou tentar reverter a escolha do cliente?", SESSION_WITH_ANALYSIS, REFERENCE);
    expect(result.intent).toBe("recommend");
    expect(result.entities.topic).toBe("mix");
  });

  it("'E se o cliente quiser somente a Bronze?' -> recommend, pacote Bronze reconhecido", () => {
    const result = classifyIntent("E se o cliente quiser somente a Bronze?", SESSION_WITH_ANALYSIS, REFERENCE);
    expect(result.intent).toBe("recommend");
    expect(result.entities.packageMentioned).toBe("Bronze");
  });

  it("'Vale dar desconto para converter?' -> evaluate_decision, tópico preço", () => {
    const result = classifyIntent("Vale dar desconto para converter?", SESSION_WITH_ANALYSIS, REFERENCE);
    expect(result.intent).toBe("evaluate_decision");
    expect(result.entities.topic).toBe("preco");
  });

  it("'Estamos desperdiçando produto?' -> diagnose, tópico estoque", () => {
    const result = classifyIntent("Estamos desperdiçando produto?", EMPTY_REASONING_SESSION, REFERENCE);
    expect(result.intent).toBe("diagnose");
    expect(result.entities.topic).toBe("estoque");
  });

  it("'Devemos vender mais Silver?' continua evaluate_decision (não colide com o novo padrão de recommend)", () => {
    const result = classifyIntent("Devemos vender mais Silver?", EMPTY_REASONING_SESSION, REFERENCE);
    expect(result.intent).toBe("evaluate_decision");
  });

  it("'Qual a cor que combina mais com a fachada?' -> inform (fora do domínio, tratado no fallback do orquestrador)", () => {
    const result = classifyIntent("Qual a cor que combina mais com a fachada?", EMPTY_REASONING_SESSION, REFERENCE);
    expect(result.intent).toBe("inform");
  });
});

describe("classifyIntent — não repete o bug da sprint anterior", () => {
  it("'O que acha que devemos fazer nessa próxima semana...' é recommend, não compare, mesmo mencionando 'semana'", () => {
    const result = classifyIntent("O que acha que devemos fazer nessa próxima semana para elevarmos esses números?", SESSION_WITH_ANALYSIS, REFERENCE);
    expect(result.intent).toBe("recommend");
  });

  it("'Agora me dê um plano para a próxima semana.' é recommend, não compare", () => {
    const result = classifyIntent("Agora me dê um plano para a próxima semana.", SESSION_WITH_ANALYSIS, REFERENCE);
    expect(result.intent).toBe("recommend");
  });
});
