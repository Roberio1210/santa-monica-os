import { describe, expect, it } from "vitest";
import { classifyManagerial } from "@/lib/zezinho/intent/managerial";

describe("classifyManagerial — multi-intenção (Sprint 4.0, Z3)", () => {
  it("'Boa tarde Zézinho, como você está? Movimento hoje está bom?' reconhece greeting + small_talk + operational_movement, nunca um único vencedor", () => {
    const result = classifyManagerial("Boa tarde Zézinho, como você está? Movimento hoje está bom?");
    expect(result.intents).toContain("greeting");
    expect(result.intents).toContain("small_talk");
    expect(result.intents).toContain("operational_movement");
    expect(result.hasBusinessSegment).toBe(true);
    expect(result.hasConversationalSegment).toBe(true);
  });

  it("'Como foi ontem e o que você faria hoje?' reconhece historical_performance + recommendation", () => {
    const result = classifyManagerial("Como foi ontem e o que você faria hoje?");
    expect(result.intents).toContain("historical_performance");
    expect(result.intents).toContain("recommendation");
  });

  it("'Quem descobriu o Brasil e quanto faturamos hoje?' reconhece general_knowledge + financial_status", () => {
    const result = classifyManagerial("Quem descobriu o Brasil e quanto faturamos hoje?");
    expect(result.intents).toContain("general_knowledge");
    expect(result.intents).toContain("financial_status");
    expect(result.generalAnswerRequired).toBe(true);
  });

  it("nunca elimina as demais intenções quando uma bate primeiro — todas as detectadas aparecem em `segments`", () => {
    const result = classifyManagerial("Bom dia! Tudo bem? Estamos dentro da meta e tem previsão de chuva essa semana?");
    const intents = result.segments.map((s) => s.intent);
    expect(intents).toContain("greeting");
    expect(intents).toContain("small_talk");
    expect(intents).toContain("goal_progress");
    expect(intents).toContain("weather_impact");
  });
});

describe("classifyManagerial — abrangência da pergunta (simple/specific_analysis/broad_managerial/conversational)", () => {
  it("'Quanto faturamos hoje?' é simple", () => {
    expect(classifyManagerial("Quanto faturamos hoje?").scope).toBe("simple");
  });

  it("'O movimento de hoje está bom?' é specific_analysis", () => {
    expect(classifyManagerial("O movimento de hoje está bom?").scope).toBe("specific_analysis");
  });

  it("'Como estamos hoje?' é broad_managerial", () => {
    expect(classifyManagerial("Como estamos hoje?").scope).toBe("broad_managerial");
  });

  it("'O que você faria agora?' é broad_managerial", () => {
    expect(classifyManagerial("O que você faria agora?").scope).toBe("broad_managerial");
  });

  it("'Tem algo preocupante no negócio?' é broad_managerial", () => {
    expect(classifyManagerial("Tem algo preocupante no negócio?").scope).toBe("broad_managerial");
  });

  it("mensagem puramente conversacional ('Bom dia, tudo bem?') tem escopo conversational", () => {
    expect(classifyManagerial("Bom dia, tudo bem?").scope).toBe("conversational");
  });
});

describe("classifyManagerial — farewell e clarification", () => {
  it("'Valeu, amanhã continuamos.' reconhece farewell", () => {
    const result = classifyManagerial("Valeu, amanhã continuamos.");
    expect(result.intents).toContain("farewell");
    expect(result.hasBusinessSegment).toBe(false);
  });

  it("texto sem conteúdo reconhecível vira clarification, nunca lança", () => {
    const result = classifyManagerial("hm");
    expect(result.intents).toEqual(["clarification"]);
  });
});

describe("classifyManagerial — estoque nunca aciona weather_impact por engano", () => {
  it("'Como está nosso estoque?' reconhece só inventory_status, não weather_impact nem client_retention", () => {
    const result = classifyManagerial("Como está nosso estoque?");
    expect(result.intents).toContain("inventory_status");
    expect(result.intents).not.toContain("weather_impact");
    expect(result.intents).not.toContain("client_retention");
  });
});
