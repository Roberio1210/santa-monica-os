import { describe, expect, it } from "vitest";
import { narrateManagerialPlan } from "@/lib/zezinho/narrator/narrateManagerialPlan";
import type { ManagerialPlan } from "@/lib/zezinho/planner/managerialPlan";
import type { OperationalContext } from "@/lib/zezinho/planner/contextBuilder";
import type { ContextQuality } from "@/lib/zezinho/planner/contextQuality";
import type { ToolResult } from "@/lib/zezinho/tools/types";
import type { AiProviderConfig } from "@/lib/zezinho/ai-provider";

/**
 * Testa o narrador isoladamente com planos sintéticos — sem depender de Neon/JumpPark. Os testes
 * de integração ponta a ponta (com dados reais do ambiente) ficam em `service.test.ts`.
 */

function meta(status: ToolResult["status"], limitations: string[] = []) {
  return { status, collectedAt: "2026-07-24T15:00:00.000Z", limitations };
}

function context(byCapability: OperationalContext["byCapability"], toolResults: ToolResult[] = Object.values(byCapability) as ToolResult[]): OperationalContext {
  return { capabilities: Object.keys(byCapability) as OperationalContext["capabilities"], byCapability, toolCalls: [], toolResults, toolTrace: [], periodResolved: true, resolvedPeriodA: null, resolvedPeriodB: null };
}

const NEUTRAL_QUALITY: ContextQuality = { overallLevel: "high", availableSources: [], missingSources: [], staleSources: [], failedSources: [], sampleQuality: null, gaps: [], confidenceDrivers: [], confidenceReducers: [] };

function basePlan(overrides: Partial<ManagerialPlan>): ManagerialPlan {
  return {
    rawText: "",
    entities: { comparison: null, singlePeriod: null, areaFilter: null, packageMentioned: null, topic: null },
    conversationalContext: { greetingDetected: false, smallTalkDetected: false, farewellDetected: false },
    userIntents: [],
    businessIntents: [],
    questionScope: "simple",
    generalAnswerRequired: false,
    toolsSelected: [],
    capabilitiesRequested: [],
    facts: [],
    alerts: [],
    risks: [],
    opportunities: [],
    recommendations: [],
    evidence: [],
    limitations: [],
    contextQuality: NEUTRAL_QUALITY,
    context: context({}),
    roleBlocked: false,
    ...overrides,
  };
}

const DISABLED_AI: AiProviderConfig = { provider: "disabled", model: null, enabled: false, hasApiKey: false };
const ENABLED_AI: AiProviderConfig = { provider: "anthropic", model: "some-model", enabled: true, hasApiKey: true };

describe("narrateManagerialPlan — escopo conversational (seção 2 e 3)", () => {
  it("'Oi.' com saudação detectada responde curto e natural, nunca despeja dados", () => {
    const plan = basePlan({ rawText: "Oi.", questionScope: "conversational", conversationalContext: { greetingDetected: true, smallTalkDetected: false, farewellDetected: false } });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Bom dia", usedOpeners: [] });
    expect(answer.text).toMatch(/Robério/);
    expect(answer.text.length).toBeLessThan(120);
  });

  it("despedida ('Valeu, até amanhã.') responde com despedida natural, nunca com dados", () => {
    const plan = basePlan({ questionScope: "conversational", conversationalContext: { greetingDetected: false, smallTalkDetected: false, farewellDetected: true } });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Boa tarde", usedOpeners: [] });
    expect(answer.text).toMatch(/at[ée]|falou/i);
  });

  it("texto irreconhecível pede reformulação, nunca usa jargão técnico interno", () => {
    const plan = basePlan({ questionScope: "conversational" });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Boa tarde", usedOpeners: [] });
    expect(answer.text).toMatch(/reformular/i);
    expect(answer.text).not.toMatch(/not_configured|ToolId|ZezinhoIntent/);
  });
});

describe("narrateManagerialPlan — escopo simple (seção 2): resposta curta, sem excesso de contexto", () => {
  it("responde só com o número principal quando há um fato direto disponível", () => {
    const jp: ToolResult = {
      id: "jumppark_period_summary",
      source: "JumpPark",
      error: null,
      ...meta("ok"),
      jumpparkConfigured: true,
      metrics: [
        { key: "revenue", label: "Faturamento operacional", unit: "currency", a: 540, b: null, comparison: { current: 540, previous: null, deltaPercent: null, trend: "indisponivel" }, source: "JumpPark" },
        { key: "vehicles", label: "Veículos atendidos", unit: "count", a: 6, b: null, comparison: { current: 6, previous: null, deltaPercent: null, trend: "indisponivel" }, source: "JumpPark" },
        { key: "avgTicket", label: "Ticket médio", unit: "currency", a: 90, b: null, comparison: { current: 90, previous: null, deltaPercent: null, trend: "indisponivel" }, source: "JumpPark" },
      ],
      peakHourA: null,
      peakHourB: null,
      topServicesA: [],
    };
    const plan = basePlan({ questionScope: "simple", businessIntents: ["financial_status"], context: context({ jumppark_period_summary: jp }) });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Bom dia", usedOpeners: [] });
    expect(answer.text).toMatch(/R\$\s?540/);
    expect(answer.text).toMatch(/6 veículo/);
    // Sem excesso de contexto — nunca lista riscos/oportunidades/confiança numa pergunta simples.
    expect(answer.text.split(".").filter((s) => s.trim().length > 0).length).toBeLessThanOrEqual(2);
  });

  it("sem nenhuma fonte disponível, é honesto — nunca inventa um número", () => {
    const plan = basePlan({ questionScope: "simple", limitations: ["JumpPark não configurado neste ambiente."] });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Bom dia", usedOpeners: [] });
    expect(answer.text).toMatch(/jumppark não configurado/i);
  });
});

describe("narrateManagerialPlan — metas com detalhamento completo (seção 8)", () => {
  it("diferencia realizado, percentual, ritmo, projeção e próximo bônus — nunca confunde meta com caixa", () => {
    const goal: ToolResult = {
      id: "goal_progress",
      source: "Metas (Neon)",
      error: null,
      ...meta("ok"),
      progress: {
        goal: { id: "g1", area: "lavacao", label: "Lavação Julho", targetAmount: 30000, periodStart: "2026-07-01", periodEnd: "2026-07-31", bonusTiers: [{ thresholdAmount: 35000, bonusAmount: 500, description: "" }] },
        currentAmount: 20000,
        percentComplete: 67,
        remainingAmount: 10000,
        daysElapsed: 24,
        daysTotal: 31,
        projectedAmount: 25000,
        projectedPercent: 83,
        pace: "abaixo_do_ritmo",
        nextBonusTier: { thresholdAmount: 35000, bonusAmount: 500, description: "" },
        amountToNextBonus: 15000,
      },
    };
    const plan = basePlan({ questionScope: "simple", businessIntents: ["goal_progress"], context: context({ goal_progress: goal }) });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Bom dia", usedOpeners: [] });
    expect(answer.text).toMatch(/67%/);
    expect(answer.text).toMatch(/abaixo do ritmo/);
    expect(answer.text).toMatch(/projeção/i);
    expect(answer.text).toMatch(/bônus/i);
  });
});

describe("narrateManagerialPlan — clima como contexto, nunca número decorativo (seção 7)", () => {
  it("chuva prevista gera leitura operacional cautelosa, nunca impacto de faturamento numérico inventado", () => {
    const weather: ToolResult = {
      id: "weather_forecast",
      source: "OpenWeatherMap",
      error: null,
      ...meta("ok"),
      forecast: {
        status: "ok",
        configured: true,
        error: null,
        source: "OpenWeatherMap",
        location: "Floripa",
        updatedAt: "2026-07-24T12:00:00.000Z",
        current: { temperature: 22, feelsLike: 22, condition: "nublado", precipitationProbability: null, windSpeedKmh: 10 },
        nextHours: [],
        dailyForecast: [{ dateIso: "2026-07-25", minTemp: 18, maxTemp: 24, maxPrecipitationProbability: 0.8, totalRainVolumeMm: 12, willRain: true, dominantCondition: "chuva", windSpeedMaxKmh: 20 }],
        limitations: [],
      },
    };
    const plan = basePlan({ questionScope: "specific_analysis", businessIntents: ["weather_impact"], capabilitiesRequested: ["weather_forecast"], context: context({ weather_forecast: weather }) });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Bom dia", usedOpeners: [] });
    expect(answer.text).toMatch(/chuva/i);
    expect(answer.text).not.toMatch(/\d+%\s*(de queda|a menos|do faturamento)/i);
  });

  it("clima não configurado nunca interrompe a análise — avisa naturalmente e segue", () => {
    const notConfigured: ToolResult = { id: "weather_forecast", source: "OpenWeatherMap", error: "não configurado", ...meta("not_configured"), forecast: { status: "not_configured", configured: false, error: "não configurado", source: null, location: null, updatedAt: null, current: null, nextHours: [], dailyForecast: [], limitations: [] } };
    const plan = basePlan({ questionScope: "specific_analysis", businessIntents: ["weather_impact"], capabilitiesRequested: ["weather_forecast"], context: context({ weather_forecast: notConfigured }) });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Bom dia", usedOpeners: [] });
    expect(answer.text).toMatch(/clima.*n[ãa]o.*configurad/i);
  });

  it("clima nunca aparece quando a pergunta não pediu clima", () => {
    const weather: ToolResult = {
      id: "weather_forecast",
      source: "OpenWeatherMap",
      error: null,
      ...meta("ok"),
      forecast: { status: "ok", configured: true, error: null, source: "OpenWeatherMap", location: "Floripa", updatedAt: "2026-07-24T12:00:00.000Z", current: { temperature: 22, feelsLike: 22, condition: "nublado", precipitationProbability: null, windSpeedKmh: 10 }, nextHours: [], dailyForecast: [], limitations: [] },
    };
    const plan = basePlan({ questionScope: "specific_analysis", businessIntents: ["inventory_status"], capabilitiesRequested: ["inventory_status"], context: context({ weather_forecast: weather }) });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Bom dia", usedOpeners: [] });
    expect(answer.text).not.toMatch(/nublado|clima|chuva/i);
  });
});

describe("narrateManagerialPlan — opinião gerencial e escopo amplo (seções 4 e 6)", () => {
  it("com risco real, usa linguagem de opinião gerencial em primeira pessoa", () => {
    const plan = basePlan({ questionScope: "broad_managerial", businessIntents: ["business_health"], risks: [{ statement: "O ticket médio está abaixo do necessário.", evidenceFactKeys: ["avgTicket"] }] });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Bom dia", usedOpeners: [] });
    expect(answer.text).toMatch(/minha maior preocupação|eu ficaria atento|o ponto que mais me chama atenção/i);
  });

  it("sem nenhum risco real, admite honestamente — nunca inventa um risco para preencher espaço", () => {
    const highQuality: ContextQuality = { ...NEUTRAL_QUALITY, overallLevel: "high", availableSources: ["JumpPark"] };
    const plan = basePlan({ questionScope: "broad_managerial", businessIntents: ["business_health"], risks: [], contextQuality: highQuality });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Bom dia", usedOpeners: [] });
    expect(answer.text).toMatch(/não vejo nenhum risco operacional relevante/i);
  });

  it("dados insuficientes -> honesto sobre a falta de segurança, nunca finge um risco", () => {
    const lowQuality: ContextQuality = { ...NEUTRAL_QUALITY, overallLevel: "low", availableSources: [] };
    const plan = basePlan({ questionScope: "broad_managerial", businessIntents: ["business_health"], risks: [], contextQuality: lowQuality });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Bom dia", usedOpeners: [] });
    expect(answer.text).toMatch(/não tenho dados suficientes/i);
  });

  it("prioridade final vem de plan.recommendations, nunca de um preenchimento genérico", () => {
    const plan = basePlan({
      questionScope: "broad_managerial",
      businessIntents: ["business_health"],
      recommendations: [{ action: "Reforçar adicionais nos próximos atendimentos.", reason: "O ticket médio está baixo.", evidenceFactKeys: [], priority: "alta", risk: null, howToVerify: "Comparar o ticket médio na próxima semana." }],
    });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Bom dia", usedOpeners: [] });
    expect(answer.text).toMatch(/prioridade agora seria|faria o seguinte|o que eu faria agora/i);
    expect(answer.text).toMatch(/reforçar adicionais/i);
  });

  it("no máximo 3 pontos principais mesmo com muitas fontes disponíveis (seção 12)", () => {
    const jp: ToolResult = { id: "jumppark_period_summary", source: "JumpPark", error: null, ...meta("ok"), jumpparkConfigured: true, metrics: [{ key: "revenue", label: "Faturamento operacional", unit: "currency", a: 540, b: null, comparison: { current: 540, previous: null, deltaPercent: null, trend: "indisponivel" }, source: "JumpPark" }, { key: "vehicles", label: "Veículos atendidos", unit: "count", a: 6, b: null, comparison: { current: 6, previous: null, deltaPercent: null, trend: "indisponivel" }, source: "JumpPark" }], peakHourA: null, peakHourB: null, topServicesA: [] };
    const cash: ToolResult = { id: "cash_ledger_totals", source: "Neon — fluxo de caixa", error: null, ...meta("ok"), metrics: [{ key: "cashEntradas", label: "Entradas de caixa", unit: "currency", a: 100, b: null, comparison: { current: 100, previous: null, deltaPercent: null, trend: "indisponivel" }, source: "Neon" }, { key: "cashSaidas", label: "Saídas de caixa", unit: "currency", a: 50, b: null, comparison: { current: 50, previous: null, deltaPercent: null, trend: "indisponivel" }, source: "Neon" }] };
    const inventory: ToolResult = { id: "inventory_overview", source: "Estoque", error: null, ...meta("ok"), summary: { totalItems: 10, lowStockCount: 0, nearEmptyCount: 0, sealedCount: 0, totalStockValue: null, itemsWithoutMinimum: 0 } };
    const plan = basePlan({ questionScope: "broad_managerial", businessIntents: ["business_health"], context: context({ jumppark_period_summary: jp, cash_ledger_totals: cash, inventory_status: inventory }) });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Bom dia", usedOpeners: [] });
    // Não afirma nada quantitativo sobre o tamanho — só garante que a resposta não é um despejo desproporcional (heurística: menos de 8 frases).
    expect(answer.text.split(".").filter((s) => s.trim().length > 0).length).toBeLessThan(8);
  });
});

describe("narrateManagerialPlan — reconhecimento emocional (seção 11)", () => {
  it("'Estou preocupado' recebe acolhimento antes da análise, nunca uma frase vazia", () => {
    const plan = basePlan({ rawText: "Estou preocupado com o movimento.", questionScope: "broad_managerial", businessIntents: ["risk_analysis", "operational_movement"] });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Bom dia", usedOpeners: [] });
    expect(answer.text).toMatch(/entendo, robério/i);
    expect(answer.text).not.toMatch(/vai ficar tudo bem/i);
  });
});

describe("narrateManagerialPlan — conhecimento geral + modo local vs. generativo (seções 9 e 10)", () => {
  it("modo local: honesto sobre a limitação, nunca 'fora do escopo', responde a parte de negócio normalmente", () => {
    const plan = basePlan({ questionScope: "simple", businessIntents: ["financial_status"], generalAnswerRequired: true, limitations: ["JumpPark não configurado."] });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Bom dia", usedOpeners: [], aiConfig: DISABLED_AI });
    expect(answer.text).toMatch(/provedor de ia generativa/i);
    expect(answer.text).not.toMatch(/foge do escopo|fora do escopo/i);
  });

  it("provedor generativo simulado como configurado: mensagem honesta diferente, nunca finge ter respondido a parte geral", () => {
    const plan = basePlan({ questionScope: "simple", businessIntents: ["financial_status"], generalAnswerRequired: true });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Bom dia", usedOpeners: [], aiConfig: ENABLED_AI });
    expect(answer.text).toMatch(/anthropic/i);
    expect(answer.text).not.toMatch(/provedor de ia generativa, que ainda não está configurado aqui/i);
  });
});

describe("narrateManagerialPlan — linguagem (seção 13): nunca jargão técnico interno na resposta", () => {
  it("mesmo com fontes not_configured, o texto ao usuário nunca contém o literal 'not_configured'", () => {
    const weather: ToolResult = { id: "weather_forecast", source: "OpenWeatherMap", error: "x", ...meta("not_configured"), forecast: { status: "not_configured", configured: false, error: "x", source: null, location: null, updatedAt: null, current: null, nextHours: [], dailyForecast: [], limitations: [] } };
    const plan = basePlan({ questionScope: "broad_managerial", businessIntents: ["business_health"], context: context({ weather_forecast: weather }) });
    const { answer } = narrateManagerialPlan(plan, { greetingWord: "Bom dia", usedOpeners: [] });
    expect(answer.text).not.toMatch(/not_configured|no_data|temporary_failure/);
  });
});
