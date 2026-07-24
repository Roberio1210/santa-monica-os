import { normalize } from "@/lib/zezinho/date-parser";

/**
 * Classificação gerencial multi-intenção (Sprint 4.0, Z3 — ver instrução do checkpoint, seções
 * 1-2). Não substitui `intent/classify.ts` (usado por `planner/selectTools.ts` + `reasoning/*`,
 * que continuam intactos — decisão do usuário, "não refaça o Z2"): é uma camada NOVA e adicional,
 * que resolve o problema que a intenção única não resolvia — uma mensagem pode misturar saudação,
 * conversa social, conhecimento geral e pergunta de negócio ao mesmo tempo, e cada pedaço precisa
 * ser reconhecido, nunca só o "vencedor" de uma disputa de regex.
 */

export type ManagerialIntent =
  | "greeting"
  | "small_talk"
  | "general_knowledge"
  | "status_check"
  | "business_health"
  | "operational_movement"
  | "historical_performance"
  | "financial_status"
  | "cash_position"
  | "goal_progress"
  | "weather_impact"
  | "client_retention"
  | "unanswered_clients"
  | "inventory_status"
  | "staffing_capacity"
  | "marketing_performance"
  | "recommendation"
  | "outlook"
  | "risk_analysis"
  | "opportunity_analysis"
  | "clarification"
  | "farewell";

/** Intenções que não precisam de nenhuma ferramenta/dado empresarial — puramente conversacionais. */
export const CONVERSATIONAL_INTENTS: ReadonlySet<ManagerialIntent> = new Set(["greeting", "small_talk", "farewell", "clarification"]);

/** Intenções que precisam de contexto operacional real (ver `planner/capabilities.ts`). */
export const BUSINESS_INTENTS: ReadonlySet<ManagerialIntent> = new Set([
  "status_check",
  "business_health",
  "operational_movement",
  "historical_performance",
  "financial_status",
  "cash_position",
  "goal_progress",
  "weather_impact",
  "client_retention",
  "unanswered_clients",
  "inventory_status",
  "staffing_capacity",
  "marketing_performance",
  "recommendation",
  "outlook",
  "risk_analysis",
  "opportunity_analysis",
]);

export type QuestionScope = "simple" | "specific_analysis" | "broad_managerial" | "conversational";

export interface IntentSegment {
  intent: ManagerialIntent;
  /** Trecho do texto normalizado que disparou esta intenção — para depuração/testes, não para o usuário. */
  matchedText: string;
}

export interface ManagerialClassification {
  /** Todas as intenções detectadas, na ordem em que os padrões foram checados — nunca só uma "vencedora". */
  segments: IntentSegment[];
  intents: ManagerialIntent[];
  businessIntents: ManagerialIntent[];
  conversationalIntents: ManagerialIntent[];
  hasBusinessSegment: boolean;
  hasConversationalSegment: boolean;
  /** `true` quando "general_knowledge" foi detectado — narrador/Z4 decide como tratar, aqui só sinalizamos honestamente. */
  generalAnswerRequired: boolean;
  scope: QuestionScope;
}

interface PatternRule {
  intent: ManagerialIntent;
  patterns: RegExp[];
}

const GREETING_PATTERNS: RegExp[] = [/\b(bom\s*dia|boa\s*tarde|boa\s*noite|oi|ol[a]|e\s*a[i])\b/];
const SMALL_TALK_PATTERNS: RegExp[] = [/\bcomo (voce|você) esta\b/, /\btudo bem\b/, /\bcomo vai\b/, /\bbeleza\b/, /\bde boa\b/, /\bcomo tem passado\b/];
const FAREWELL_PATTERNS: RegExp[] = [/\bvaleu\b/, /\bate (mais|amanha|logo)\b/, /\btchau\b/, /\bobrigad[oa]\b/, /\bfalou\b/, /\bnos falamos\b/];

/**
 * Heurística estreita e documentada — sem provedor de IA generativa, não há como saber com
 * certeza que uma pergunta é "conhecimento geral"; os padrões cobrem marcadores comuns de
 * pergunta factual sobre o mundo, não sobre a Sta Mônica. Nunca deve colidir com perguntas de
 * negócio ("quanto faturamos" não bate aqui).
 */
const GENERAL_KNOWLEDGE_PATTERNS: RegExp[] = [
  /\bquem descobriu\b/,
  /\bquem foi\b/,
  /\bquem inventou\b/,
  /\bque ano (foi|e|comecou|comecoU)\b/,
  /\bcapital d[eo]\b/,
  /\bquantos habitantes\b/,
  /\bo que (e|significa)\s+\w+\?/,
  /\bquando (foi|comecou|terminou) a\b/,
];

const STATUS_CHECK_PATTERNS: RegExp[] = [/\bcomo estamos\b/, /\bcomo esta a empresa\b/, /\bcomo estamos indo\b/, /\bcomo vai a empresa\b/, /\bcomo anda a empresa\b/, /\bcomo foi o dia\b/];

const BUSINESS_HEALTH_PATTERNS: RegExp[] = [/\btem algo preocupante\b/, /\balgo preocupante\b/, /\bsaude do negocio\b/, /\bsaude da empresa\b/, /\bprecisando da minha atencao\b/, /\bprecisando de atencao\b/];

const OPERATIONAL_MOVEMENT_PATTERNS: RegExp[] = [/\bmovimento\b/, /\bquantos carros\b/, /\bquantos veiculos\b/, /\batendimento hoje\b/, /\bmovimento hoje\b/, /\bmovimento esta bom\b/];

const HISTORICAL_PERFORMANCE_PATTERNS: RegExp[] = [/\bcomo foi ontem\b/, /\bcomo foi (a semana|o mes) passad[oa]\b/, /\bcomparad[oa] (a|com)\b/, /\bhistorico\b/, /\bpadrao historico\b/];

const FINANCIAL_STATUS_PATTERNS: RegExp[] = [/\bfaturamento\b/, /\bquanto fatur\w+\b/, /\bresultado (do mes|gerencial)\b/, /\bdre\b/, /\bfinanceiro\b/];

const CASH_POSITION_PATTERNS: RegExp[] = [/\bcaixa\b/, /\bentrou no caixa\b/, /\bsaiu do caixa\b/, /\bsaldo\b/];

const GOAL_PROGRESS_PATTERNS: RegExp[] = [/\bmeta\b/, /\bdentro da meta\b/, /\bbater a meta\b/, /\britmo da meta\b/];

const WEATHER_IMPACT_PATTERNS: RegExp[] = [/\bchuva\b/, /\bchover\b/, /\btempo\b/, /\bprevisao do tempo\b/, /\bclima\b/];

const CLIENT_RETENTION_PATTERNS: RegExp[] = [/\bcliente(s)? em risco\b/, /\bclientes sem retorno\b/, /\bquem (devemos )?ligar\b/, /\bquem contatar\b/];

const UNANSWERED_CLIENTS_PATTERNS: RegExp[] = [/\bsem resposta\b/, /\bnao respond\w+\b/, /\bmensage(m|ns) sem resposta\b/, /\bcliente(s)? sem resposta\b/];

const INVENTORY_STATUS_PATTERNS: RegExp[] = [/\bestoque\b/, /\bproduto(s)?\b/];

const STAFFING_CAPACITY_PATTERNS: RegExp[] = [/\bequipe\b/, /\bcontratar\b/, /\bfuncionari\w+\b/, /\bcolaborador\w*\b/];

const MARKETING_PERFORMANCE_PATTERNS: RegExp[] = [/\bmarketing\b/, /\bcampanha\b/, /\banuncio\b/, /\binstagram\b/];

const RECOMMENDATION_PATTERNS: RegExp[] = [
  /\bo que (voce )?faria\b/,
  /\bo que fazer\b/,
  /\bvoce recomenda\b/,
  /\bsua sugestao\b/,
  /\bsua opiniao\b/,
  /\bcomo podemos melhorar\b/,
  /\bplano de acao\b/,
  /\bqual (deve ser )?(o )?(nosso )?plano\b/,
];

const OUTLOOK_PATTERNS: RegExp[] = [/\bo que espera\b/, /\bexpectativa\b/, /\bessa semana (vai|deve)\b/, /\bprevisao para a semana\b/, /\bcomo (voce )?espera\b/];

const RISK_ANALYSIS_PATTERNS: RegExp[] = [/\brisco\b/, /\bo que pode dar errado\b/, /\bme preocupa\b/, /\bestou preocupado\b/, /\bonde erramos\b/, /\bonde estamos errando\b/];

const OPPORTUNITY_ANALYSIS_PATTERNS: RegExp[] = [/\boportunidade\b/, /\bo que podemos aproveitar\b/, /\bcomo aproveitar\b/];

const RULES: PatternRule[] = [
  { intent: "greeting", patterns: GREETING_PATTERNS },
  { intent: "small_talk", patterns: SMALL_TALK_PATTERNS },
  { intent: "farewell", patterns: FAREWELL_PATTERNS },
  { intent: "general_knowledge", patterns: GENERAL_KNOWLEDGE_PATTERNS },
  { intent: "status_check", patterns: STATUS_CHECK_PATTERNS },
  { intent: "business_health", patterns: BUSINESS_HEALTH_PATTERNS },
  { intent: "risk_analysis", patterns: RISK_ANALYSIS_PATTERNS },
  { intent: "opportunity_analysis", patterns: OPPORTUNITY_ANALYSIS_PATTERNS },
  { intent: "outlook", patterns: OUTLOOK_PATTERNS },
  { intent: "recommendation", patterns: RECOMMENDATION_PATTERNS },
  { intent: "operational_movement", patterns: OPERATIONAL_MOVEMENT_PATTERNS },
  { intent: "historical_performance", patterns: HISTORICAL_PERFORMANCE_PATTERNS },
  { intent: "goal_progress", patterns: GOAL_PROGRESS_PATTERNS },
  { intent: "weather_impact", patterns: WEATHER_IMPACT_PATTERNS },
  { intent: "financial_status", patterns: FINANCIAL_STATUS_PATTERNS },
  { intent: "cash_position", patterns: CASH_POSITION_PATTERNS },
  { intent: "unanswered_clients", patterns: UNANSWERED_CLIENTS_PATTERNS },
  { intent: "client_retention", patterns: CLIENT_RETENTION_PATTERNS },
  { intent: "inventory_status", patterns: INVENTORY_STATUS_PATTERNS },
  { intent: "staffing_capacity", patterns: STAFFING_CAPACITY_PATTERNS },
  { intent: "marketing_performance", patterns: MARKETING_PERFORMANCE_PATTERNS },
];

function firstMatch(patterns: RegExp[], normalized: string): string | null {
  for (const p of patterns) {
    const m = normalized.match(p);
    if (m) return m[0];
  }
  return null;
}

function hasEnoughContent(normalized: string): boolean {
  return normalized.replace(/[^a-z]/g, "").length >= 3;
}

/** Escopo BROAD_MANAGERIAL — checado antes de specific_analysis, porque frases amplas às vezes também contêm um verbo de estado ("está"). */
const BROAD_SCOPE_PATTERNS: RegExp[] = [
  /\bcomo estamos\b/,
  /\bo que (voce )?faria\b/,
  /\bo que espera\b/,
  /\bonde estamos errando\b/,
  /\bonde erramos\b/,
  /\btem algo preocupante\b/,
  /\balgo preocupante\b/,
  /\bprecisando da minha atencao\b/,
  /\bprecisando de atencao\b/,
  /\bcomo esta a saude\b/,
];

const SPECIFIC_ANALYSIS_SCOPE_PATTERNS: RegExp[] = [
  /\besta bom\b/,
  /\bestamos dentro\b/,
  /\besta baixo\b/,
  /\besta alto\b/,
  /\bmovimento (hoje )?esta bom\b/,
  /\bdentro da meta\b/,
];

function classifyScope(normalized: string, businessIntents: ManagerialIntent[], hasConversational: boolean, hasBusiness: boolean): QuestionScope {
  if (!hasBusiness) return "conversational";
  if (firstMatch(BROAD_SCOPE_PATTERNS, normalized)) return "broad_managerial";
  if (businessIntents.length > 1) return "broad_managerial";
  if (firstMatch(SPECIFIC_ANALYSIS_SCOPE_PATTERNS, normalized)) return "specific_analysis";
  if (businessIntents.includes("outlook") || businessIntents.includes("risk_analysis") || businessIntents.includes("opportunity_analysis") || businessIntents.includes("recommendation")) return "broad_managerial";
  return hasConversational ? "specific_analysis" : "simple";
}

/**
 * Classificador multi-intenção (Sprint 4.0, Z3). Roda TODOS os padrões contra o texto — nunca
 * "o primeiro que bater vence e os outros desaparecem" (era exatamente esse desenho antigo, em
 * `intent/classify.ts`, que causava o bug de produção: "Boa tarde Zézinho, como você está?
 * Movimento hoje está bom?" perdia o pedaço de negócio para o roteador legado). Quando nada bate
 * e não há conteúdo suficiente, devolve só `clarification`.
 */
export function classifyManagerial(text: string): ManagerialClassification {
  const normalized = normalize(text);
  const segments: IntentSegment[] = [];

  for (const rule of RULES) {
    const matched = firstMatch(rule.patterns, normalized);
    if (matched) segments.push({ intent: rule.intent, matchedText: matched });
  }

  if (segments.length === 0) {
    if (!hasEnoughContent(normalized)) segments.push({ intent: "clarification", matchedText: "" });
  }

  const intents = segments.map((s) => s.intent);
  const businessIntents = intents.filter((i) => BUSINESS_INTENTS.has(i));
  const conversationalIntents = intents.filter((i) => CONVERSATIONAL_INTENTS.has(i));
  const hasBusinessSegment = businessIntents.length > 0;
  const hasConversationalSegment = conversationalIntents.length > 0 || intents.includes("general_knowledge");

  return {
    segments,
    intents,
    businessIntents,
    conversationalIntents,
    hasBusinessSegment,
    hasConversationalSegment,
    generalAnswerRequired: intents.includes("general_knowledge"),
    scope: classifyScope(normalized, businessIntents, hasConversationalSegment, hasBusinessSegment),
  };
}
