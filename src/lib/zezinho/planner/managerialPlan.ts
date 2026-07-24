import { classifyManagerial, type ManagerialIntent, type QuestionScope } from "@/lib/zezinho/intent/managerial";
import { extractEntities } from "@/lib/zezinho/intent/entities";
import type { ExtractedEntities } from "@/lib/zezinho/intent/types";
import type { ReasoningSession } from "@/lib/zezinho/memory/types";
import type { BusinessObjective } from "@/lib/zezinho/objective/types";
import { capabilitiesForIntent, type Capability } from "@/lib/zezinho/planner/capabilities";
import { buildOperationalContext, type OperationalContext } from "@/lib/zezinho/planner/contextBuilder";
import { computeContextQuality, type ContextQuality } from "@/lib/zezinho/planner/contextQuality";
import { extractFacts } from "@/lib/zezinho/reasoning/facts";
import { deriveFindings } from "@/lib/zezinho/reasoning/findings";
import { buildDiagnosis } from "@/lib/zezinho/reasoning/diagnose";
import { deriveGaps } from "@/lib/zezinho/reasoning/gaps";
import { deriveRecommendations } from "@/lib/zezinho/reasoning/recommend";
import { normalize } from "@/lib/zezinho/date-parser";
import type { Fact, Recommendation } from "@/lib/zezinho/reasoning/types";
import type { ToolId, ToolResult } from "@/lib/zezinho/tools/types";

/**
 * Planejador gerencial (Sprint 4.0, Z3) — o "cérebro de planejamento" pedido no checkpoint:
 * entende múltiplas intenções, decide a abrangência da pergunta, monta o contexto operacional
 * mínimo necessário e entrega um `ManagerialPlan` estruturado para o narrador consumir. NÃO
 * escreve a resposta final (isso é trabalho do Z4) — só fatos, riscos, oportunidades e
 * recomendações já filtrados por evidência real, nunca inventados.
 */

export interface EvidencedClaim {
  statement: string;
  evidenceFactKeys: string[];
}

export interface ManagerialPlan {
  rawText: string;
  /** Exposto para quem monta a memória de sessão (`service.ts`) reaproveitar tópico/filtro sem reextrair. */
  entities: ExtractedEntities;
  conversationalContext: { greetingDetected: boolean; smallTalkDetected: boolean; farewellDetected: boolean };
  userIntents: ManagerialIntent[];
  businessIntents: ManagerialIntent[];
  questionScope: QuestionScope;
  generalAnswerRequired: boolean;
  toolsSelected: ToolId[];
  capabilitiesRequested: Capability[];
  facts: Fact[];
  alerts: string[];
  risks: EvidencedClaim[];
  opportunities: EvidencedClaim[];
  recommendations: Recommendation[];
  evidence: string[];
  limitations: string[];
  contextQuality: ContextQuality;
  context: OperationalContext;
}

/**
 * Ponte intenção gerencial -> objetivo de negócio, só para reaproveitar `deriveRecommendations`
 * (Sprint 3.0) sem duplicar a lógica de recomendação por domínio. Mesma precedência do antigo
 * `objective/infer.ts` (removido na Z4): pacote citado (ex.: "Bronze") vence qualquer outra
 * pista — "e se o cliente quiser só a Bronze?" é sobre mix de serviço mesmo contendo a palavra
 * "cliente" — depois vem intenção dedicada (retenção/estoque/equipe/caixa), depois o tópico só
 * para `recommendation` (mesma ponte tópico->objetivo do antigo `objective/infer.ts`).
 */
export function objectiveForPlan(intents: ManagerialIntent[], entities: Pick<ExtractedEntities, "topic" | "packageMentioned">): BusinessObjective | null {
  if (entities.packageMentioned) return "improve_service_mix";
  if (intents.includes("client_retention") || intents.includes("unanswered_clients")) return "client_retention";
  if (intents.includes("inventory_status")) return "reduce_costs";
  if (intents.includes("staffing_capacity")) return "staffing_capacity";
  if (intents.includes("cash_position") || intents.includes("financial_status")) return "improve_cash_flow";

  if (intents.includes("recommendation")) {
    switch (entities.topic) {
      case "mix":
        return "improve_service_mix";
      case "preco":
        return "evaluate_pricing";
      case "equipe":
        return "staffing_capacity";
      case "clientes":
        return "client_retention";
      case "caixa":
        return "improve_cash_flow";
      case "estoque":
        return "reduce_costs";
      default:
        return "business_health";
    }
  }

  return "business_health";
}

const RAIN_RISK_THRESHOLD_DAYS = 2;
const VEHICLES_BELOW_TYPICAL_RATIO = 0.7;

/**
 * Riscos e oportunidades candidatos (seção 9) — cada um só existe se houver evidência real por
 * trás (fato correspondente presente e com status "ok"). Nunca deriva de fonte ausente/falha.
 */
function deriveRisksAndOpportunities(context: OperationalContext, facts: Fact[]): { risks: EvidencedClaim[]; opportunities: EvidencedClaim[] } {
  const risks: EvidencedClaim[] = [];
  const opportunities: EvidencedClaim[] = [];
  const factByKey = new Map(facts.map((f) => [f.key, f]));

  const weather = context.byCapability.weather_forecast;
  if (weather?.id === "weather_forecast" && weather.status === "ok" && weather.forecast.current) {
    const upcoming = weather.forecast.dailyForecast.slice(0, RAIN_RISK_THRESHOLD_DAYS);
    const willRainSoon = upcoming.some((d) => d.willRain);
    if (willRainSoon) risks.push({ statement: "Previsão de chuva nos próximos dias pode reduzir a demanda de lavação.", evidenceFactKeys: ["weather_current"] });
    const todayDry = !upcoming[0]?.willRain;
    const rainsLater = upcoming.slice(1).some((d) => d.willRain);
    if (todayDry && rainsLater) opportunities.push({ statement: "Tempo firme agora e chuva prevista em breve — janela boa para atrair clientes indecisos antes que a demanda de lavação suba de repente.", evidenceFactKeys: ["weather_current"] });
  }

  const historical = context.byCapability.historical_pattern;
  const jumppark = context.byCapability.jumppark_period_summary;
  if (historical?.id === "historical_pattern" && historical.status === "ok" && historical.pattern && historical.pattern.sampleQuality !== "insuficiente" && historical.pattern.typicalVehicles !== null) {
    if (jumppark?.id === "jumppark_period_summary" && jumppark.status === "ok") {
      const vehiclesMetric = jumppark.metrics.find((m) => m.key === "vehicles");
      if (vehiclesMetric && vehiclesMetric.a < historical.pattern.typicalVehicles * VEHICLES_BELOW_TYPICAL_RATIO) {
        risks.push({ statement: "Movimento de hoje está abaixo do padrão histórico para este dia da semana.", evidenceFactKeys: ["historical_pattern", "vehicles"] });
      }
    }
  }

  const goal = context.byCapability.goal_progress;
  if (goal?.id === "goal_progress" && goal.status === "ok" && goal.progress) {
    if (goal.progress.pace === "abaixo_do_ritmo") risks.push({ statement: "O ritmo atual está abaixo do necessário para atingir a meta no período.", evidenceFactKeys: ["goal_progress"] });
    if (goal.progress.pace === "acima_do_ritmo") opportunities.push({ statement: "O ritmo atual está acima do necessário — pode valer reforçar oferta para consolidar essa vantagem antes que o ritmo caia.", evidenceFactKeys: ["goal_progress"] });
  }

  const payable = context.byCapability.accounts_payable;
  if (payable?.id === "accounts_payable" && payable.status === "ok" && payable.summary && payable.summary.totalOverdue > 0) {
    risks.push({ statement: "Há contas a pagar vencidas em aberto.", evidenceFactKeys: ["accounts_payable"] });
  }

  if (factByKey.has("crm_at_risk_count")) {
    const f = factByKey.get("crm_at_risk_count")!;
    opportunities.push({ statement: `${f.statement} Oportunidade de reativação com contato direto.`, evidenceFactKeys: ["crm_at_risk_count"] });
  }

  return { risks, opportunities };
}

/**
 * Monta o `ManagerialPlan` completo a partir de um texto livre — este é o novo ponto de entrada
 * do planejador gerencial (Sprint 4.0, Z3). Não decide o texto final: prepara material gerencial
 * (fatos, riscos, oportunidades, recomendações, qualidade do contexto) para o narrador.
 */
export async function buildManagerialPlan(rawText: string, memory: ReasoningSession): Promise<ManagerialPlan> {
  const classification = classifyManagerial(rawText);
  const entities: ExtractedEntities = extractEntities(rawText);

  const capabilitiesRequested = Array.from(new Set(classification.businessIntents.flatMap((intent) => capabilitiesForIntent(intent, entities.topic))));

  const context = await buildOperationalContext(capabilitiesRequested, entities, memory);
  const contextQuality = computeContextQuality(context);

  const facts = extractFacts(context.toolResults);
  const findings = deriveFindings(facts);
  const diagnosis = buildDiagnosis(findings);
  const objective = objectiveForPlan(classification.businessIntents, entities);
  const gaps = deriveGaps(context.toolResults, objective);
  const recommendations = classification.businessIntents.length > 0 ? deriveRecommendations(facts, findings, objective, entities, normalize(rawText), diagnosis.mainHypothesis?.statement ?? null) : [];
  const { risks, opportunities } = deriveRisksAndOpportunities(context, facts);

  const centralAlerts = context.toolResults.find((r): r is Extract<ToolResult, { id: "central_alerts" }> => r.id === "central_alerts");
  const alerts = centralAlerts && centralAlerts.status === "ok" ? centralAlerts.alerts.map((a) => `${a.title}: ${a.description}`) : [];

  const evidence = Array.from(new Set(context.toolResults.map((r) => r.source)));
  const limitations = Array.from(new Set([...gaps.map((g) => g.description), ...context.toolResults.flatMap((r) => r.limitations)]));

  return {
    rawText,
    entities,
    conversationalContext: {
      greetingDetected: classification.intents.includes("greeting"),
      smallTalkDetected: classification.intents.includes("small_talk"),
      farewellDetected: classification.intents.includes("farewell"),
    },
    userIntents: classification.intents,
    businessIntents: classification.businessIntents,
    questionScope: classification.scope,
    generalAnswerRequired: classification.generalAnswerRequired,
    toolsSelected: context.toolCalls.map((c) => c.id),
    capabilitiesRequested,
    facts,
    alerts,
    risks,
    opportunities,
    recommendations,
    evidence,
    limitations,
    contextQuality,
    context,
  };
}
