import { computeImpact, computePriority } from "@/lib/zezinho/directors/priority";
import { CONFIDENCE_SCORE_BAND } from "@/lib/zezinho/directors/hypotheses";
import type { Correlation, DirectorId, DirectorReport, ConsolidatedReport, ExecutiveAdvice, ExecutiveDecisions, Hypothesis, PriorityLevel } from "@/lib/zezinho/directors/types";
import type { ConfidenceLevel, EvidencedClaim, Recommendation } from "@/lib/zezinho/reasoning/types";

/**
 * Diretor Estratégico — consolidação (Sprint 5.0). Z1: agregação simples. Z2 (Sistema Executivo
 * de Decisão, decisão do usuário): ganha detecção de padrões cruzados entre Diretores
 * ("Contradições" — o nome do usuário; tecnicamente hipóteses evidenciadas por 2+ Diretores,
 * nunca uma "IA arbitrando" sem evidência dupla), impacto operacional formal, as três Decisões e
 * o Executive Advice. Nunca observa uma fonte própria além de `central_alerts` (já transversal
 * por natureza — ver `directors/registry.ts`); tudo aqui é função pura sobre os
 * `DirectorReport`s já prontos dos demais Diretores.
 */

function findReport(reports: DirectorReport[], id: DirectorId): DirectorReport | undefined {
  return reports.find((r) => r.director === id);
}

// --- Padrões cruzados ("Contradições", seção do usuário) — cada um exige evidência real de 2+ Diretores ---

/**
 * "Financeiro: receita caiu. Operações: equipe ociosa. CRM: leads disponíveis. Estratégia deve
 * concluir: existe um gargalo de conversão." (exemplo do usuário) — usa os sinais reais já
 * calculados por cada Diretor: ritmo de meta abaixo do necessário (Financeiro), movimento abaixo
 * do padrão histórico (Operações) e clientes disponíveis para contato (Comercial/CRM).
 */
function detectConversionBottleneck(reports: DirectorReport[]): Hypothesis | null {
  const financeiro = findReport(reports, "financeiro");
  const operacoes = findReport(reports, "operacoes");
  const comercial = findReport(reports, "comercial");
  if (!financeiro || !operacoes || !comercial) return null;

  const financeiroRisk = financeiro.risks.find((r) => r.evidenceFactKeys.includes("goal_progress"));
  const operacoesRisk = operacoes.risks.find((r) => r.evidenceFactKeys.includes("historical_pattern"));
  const comercialOpportunity = comercial.opportunities.find((o) => o.evidenceFactKeys.includes("crm_at_risk_count"));
  if (!financeiroRisk || !operacoesRisk || !comercialOpportunity) return null;

  return {
    description:
      "Pode haver um gargalo de conversão: o ritmo da meta está abaixo do necessário, o movimento está abaixo do padrão histórico para o dia, e há clientes disponíveis para contato ainda sem retorno — o problema pode não ser falta de demanda, e sim conversão dela.",
    evidenceFactKeys: Array.from(new Set([...financeiroRisk.evidenceFactKeys, ...operacoesRisk.evidenceFactKeys, ...comercialOpportunity.evidenceFactKeys])),
    basis: ["financeiro", "operação", "clientes"],
    confidenceScore: CONFIDENCE_SCORE_BAND.media,
    confidenceLevel: "media",
    limitations: ["Três sinais reais e alinhados no mesmo período, mas sem prova causal direta entre eles — vale investigar antes de agir."],
  };
}

/**
 * "Marketing: muito tráfego. CRM: poucos contatos. Estratégia: possível problema na captura dos
 * leads." (exemplo do usuário) — hoje o Diretor de Marketing nunca tem fonte real
 * (`dataAvailability: "indisponivel"`, ver `directors/registry.ts`), então este padrão fica
 * dormente até a Fase B (Meta Ads/Instagram) existir. O mecanismo já está pronto e testado com
 * dados sintéticos para não precisar ser redesenhado quando a fonte chegar — nunca inventa dado
 * hoje.
 */
function detectLeadCaptureProblem(reports: DirectorReport[]): Hypothesis | null {
  const marketing = findReport(reports, "marketing");
  const comercial = findReport(reports, "comercial");
  if (!marketing || !comercial) return null;

  const highTrafficFact = marketing.facts.find((f) => f.key === "marketing_traffic" && f.direction === "aumento");
  const lowContactFact = comercial.facts.find((f) => f.key === "crm_contacts" && f.direction === "queda");
  if (!highTrafficFact || !lowContactFact) return null;

  return {
    description: "Muito tráfego de marketing, mas poucos contatos registrados no CRM no mesmo período — possível problema na captura de leads (formulário, tempo de resposta, ou perda entre o canal e o CRM).",
    evidenceFactKeys: [highTrafficFact.key, lowContactFact.key],
    basis: ["marketing", "clientes"],
    confidenceScore: CONFIDENCE_SCORE_BAND.media,
    confidenceLevel: "media",
    limitations: ["Correlação entre dois sinais reais — ainda não há prova de qual etapa do funil está falhando."],
  };
}

const PATTERN_DETECTORS: ((reports: DirectorReport[]) => Hypothesis | null)[] = [detectConversionBottleneck, detectLeadCaptureProblem];

export function detectCrossDirectorHypotheses(reports: DirectorReport[]): Hypothesis[] {
  return PATTERN_DETECTORS.map((detect) => detect(reports)).filter((h): h is Hypothesis => h !== null);
}

// --- Impacto/prioridade geral (Sprint 5.0, Z2 — "não quero simplesmente ordenar alertas") ---

function worstDataConfidence(reports: DirectorReport[]): ConfidenceLevel {
  if (reports.some((r) => r.confidence.overallLevel === "low")) return "baixa";
  if (reports.some((r) => r.confidence.overallLevel === "medium")) return "media";
  return "alta";
}

function computeOverallPriority(reports: DirectorReport[]): PriorityLevel {
  const allRisks = reports.flatMap((r) => r.risks);
  const allOpportunities = reports.flatMap((r) => r.opportunities);
  if (allRisks.length === 0 && allOpportunities.length === 0) return "baixa";

  const evidenceFactKeys = Array.from(new Set([...allRisks, ...allOpportunities].flatMap((c) => c.evidenceFactKeys)));
  const directorsInvolved = new Set(reports.filter((r) => r.risks.length > 0 || r.opportunities.length > 0).map((r) => r.director)).size;
  const impact = computeImpact(evidenceFactKeys, worstDataConfidence(reports), directorsInvolved, allRisks.length > 0);
  return computePriority(impact);
}

// --- Decisões: as três perguntas centrais (seção "Decisões", decisão do usuário) ---

const PRIORITY_WEIGHT: Record<PriorityLevel, number> = { alta: 3, media: 2, baixa: 1 };
const MAX_ATTENTION_ITEMS = 3;
const MAX_WAIT_ITEMS = 3;

export function computeExecutiveDecisions(reports: DirectorReport[], crossDirectorHypotheses: Hypothesis[]): ExecutiveDecisions {
  const allRisks = reports.flatMap((r) => r.risks);
  const allOpportunities = reports.flatMap((r) => r.opportunities);
  const allRecommendations = reports.flatMap((r) => r.recommendations);

  const hypothesisClaims: EvidencedClaim[] = crossDirectorHypotheses.map((h) => ({ statement: h.description, evidenceFactKeys: h.evidenceFactKeys }));
  const whatDeservesAttentionToday = [...hypothesisClaims, ...allRisks].slice(0, MAX_ATTENTION_ITEMS);

  const sortedRecommendations = [...allRecommendations].sort((a, b) => PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]);
  const whatIWouldDoFirst: Recommendation | null = sortedRecommendations[0] ?? null;

  const whatCanWait = allOpportunities.slice(0, MAX_WAIT_ITEMS);

  return { whatDeservesAttentionToday, whatIWouldDoFirst, whatCanWait };
}

// --- Executive Advice: "Meu conselho para hoje" (novo componente, decisão do usuário) ---

function lowerFirst(s: string): string {
  return s.length === 0 ? s : `${s.charAt(0).toLowerCase()}${s.slice(1)}`;
}

export function computeExecutiveAdvice(decisions: ExecutiveDecisions, dataConfidence: ConfidenceLevel): ExecutiveAdvice {
  if (decisions.whatIWouldDoFirst) {
    const rec = decisions.whatIWouldDoFirst;
    return {
      statement: `Se eu estivesse administrando a empresa hoje, minha prioridade seria: ${lowerFirst(rec.action)}`,
      basedOnFactKeys: rec.evidenceFactKeys,
      confidence: dataConfidence,
    };
  }
  if (decisions.whatDeservesAttentionToday[0]) {
    const claim = decisions.whatDeservesAttentionToday[0];
    return {
      statement: `Se eu estivesse administrando a empresa hoje, ficaria de olho em: ${lowerFirst(claim.statement)}`,
      basedOnFactKeys: claim.evidenceFactKeys,
      confidence: dataConfidence,
    };
  }
  return { statement: "Ainda não tenho dados suficientes reunidos para dar um conselho com segurança hoje.", basedOnFactKeys: [], confidence: "baixa" };
}

// --- Consolidação ---

export function consolidate(reports: DirectorReport[], correlations: Correlation[] = []): ConsolidatedReport {
  const risks = reports.flatMap((r) => r.risks);
  const opportunities = reports.flatMap((r) => r.opportunities);
  const recommendations = reports.flatMap((r) => r.recommendations);
  const actionPlans = reports.flatMap((r) => r.actionPlans);
  const limitations = Array.from(new Set(reports.flatMap((r) => r.limitations)));
  const participatingDirectors = reports.filter((r) => r.shouldParticipateInBriefing).map((r) => r.director);

  const crossDirectorHypotheses = detectCrossDirectorHypotheses(reports);
  const decisions = computeExecutiveDecisions(reports, crossDirectorHypotheses);
  const advice = computeExecutiveAdvice(decisions, worstDataConfidence(reports));
  const overallPriority = computeOverallPriority(reports);

  return {
    generatedAt: new Date().toISOString(),
    reports,
    risks,
    opportunities,
    recommendations,
    actionPlans,
    correlations,
    crossDirectorHypotheses,
    decisions,
    advice,
    overallPriority,
    limitations,
    participatingDirectors,
  };
}
