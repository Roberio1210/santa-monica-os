import { basisLabelsFor } from "@/lib/zezinho/directors/hypotheses";
import type { ConfidenceLevel } from "@/lib/zezinho/reasoning/types";
import type { DirectorReport, Hypothesis, HypothesisReview, ReviewedHypothesis } from "@/lib/zezinho/directors/types";

/**
 * Revisão Cruzada (Sprint 5.0, Z3A, novo componente, decisão do usuário) — "os Diretores devem
 * poder confirmar, complementar ou contestar hipóteses uns dos outros antes da consolidação do
 * Diretor Estratégico". Cada revisão exige evidência PRÓPRIA e real do Diretor revisor — nunca
 * uma opinião solta sobre a hipótese de outro. A confiança da hipótese é recalculada depois
 * (`recalculateConfidence`) considerando quantas revisões confirmam vs. contestam.
 */

const CONFIRM_SCORE_BONUS = 8;
const CONTEST_SCORE_PENALTY = 18;
const MIN_SCORE = 0;
const MAX_SCORE = 100;
/** Bandas espelhando `CONFIDENCE_SCORE_BAND` (85/60/30) — ponto médio entre elas define o corte. */
const HIGH_LEVEL_THRESHOLD = 72;
const MEDIUM_LEVEL_THRESHOLD = 45;

function domainOverlap(a: string[], b: string[]): boolean {
  return a.some((x) => b.includes(x));
}

/**
 * Um Diretor só pode revisar se tiver evidência PRÓPRIA (risco ou oportunidade real) no mesmo
 * domínio (`basis`) da hipótese — sem isso, não há revisão, nunca um palpite. Quando o revisor
 * tem um risco no mesmo domínio, confirma; quando tem uma oportunidade no mesmo domínio onde a
 * hipótese nasceu ligada a um risco (ou vice-versa), há uma tensão real entre leituras
 * independentes — isso é contestação, não desacordo arbitrado por IA.
 */
function reviewFrom(reviewer: DirectorReport, hypothesis: Hypothesis): HypothesisReview | null {
  const reviewerRisksInDomain = reviewer.risks.filter((r) => domainOverlap(basisLabelsFor(r.evidenceFactKeys), hypothesis.basis));
  const reviewerOpportunitiesInDomain = reviewer.opportunities.filter((o) => domainOverlap(basisLabelsFor(o.evidenceFactKeys), hypothesis.basis));

  if (reviewerRisksInDomain.length === 0 && reviewerOpportunitiesInDomain.length === 0) return null;

  if (reviewerRisksInDomain.length > 0) {
    const risk = reviewerRisksInDomain[0];
    return { reviewerDirector: reviewer.director, stance: "confirma", statement: risk.statement, evidenceFactKeys: risk.evidenceFactKeys };
  }

  const opportunity = reviewerOpportunitiesInDomain[0];
  return { reviewerDirector: reviewer.director, stance: "contesta", statement: opportunity.statement, evidenceFactKeys: opportunity.evidenceFactKeys };
}

function scoreToLevel(score: number): ConfidenceLevel {
  if (score >= HIGH_LEVEL_THRESHOLD) return "alta";
  if (score >= MEDIUM_LEVEL_THRESHOLD) return "media";
  return "baixa";
}

/**
 * Recalcula a confiança de uma hipótese a partir das revisões — cada confirmação reforça um
 * pouco, cada contestação pesa mais (evidência contrária é mais informativa que uma segunda
 * confirmação na mesma direção). Nunca sai da faixa 0-100; a limitação é sempre declarada quando
 * há evidência contrária, nunca escondida.
 */
export function recalculateConfidence(hypothesis: Hypothesis, reviews: HypothesisReview[]): Hypothesis {
  if (reviews.length === 0) return hypothesis;

  const confirmations = reviews.filter((r) => r.stance === "confirma");
  const contestations = reviews.filter((r) => r.stance === "contesta");

  const adjustedScore = Math.max(MIN_SCORE, Math.min(MAX_SCORE, hypothesis.confidenceScore + confirmations.length * CONFIRM_SCORE_BONUS - contestations.length * CONTEST_SCORE_PENALTY));

  const contraryEvidenceFactKeys = Array.from(new Set(contestations.flatMap((r) => r.evidenceFactKeys)));
  const limitations = [...hypothesis.limitations];
  if (contestations.length > 0) limitations.push(`${contestations.length} Diretor(es) apresentaram evidência contrária a esta hipótese — trate com cautela.`);

  return {
    ...hypothesis,
    confidenceScore: adjustedScore,
    confidenceLevel: scoreToLevel(adjustedScore),
    contraryEvidenceFactKeys: Array.from(new Set([...hypothesis.contraryEvidenceFactKeys, ...contraryEvidenceFactKeys])),
    limitations,
  };
}

/**
 * Revisa todas as hipóteses (de cada Diretor + as cruzadas do Estratégico) contra os relatórios
 * de TODOS os Diretores — nunca um Diretor revisa a própria hipótese. `sourceDirector: null`
 * identifica uma hipótese cruzada (já nasce evidenciada por 2+ Diretores, ver
 * `estrategico.ts:detectCrossDirectorHypotheses`).
 */
export function reviewHypotheses(reports: DirectorReport[], crossDirectorHypotheses: Hypothesis[] = []): ReviewedHypothesis[] {
  const ownHypotheses = reports.flatMap((r) => r.hypotheses.map((h) => ({ hypothesis: h, sourceDirector: r.director as typeof r.director | null })));
  const crossHypotheses = crossDirectorHypotheses.map((h) => ({ hypothesis: h, sourceDirector: null as null }));
  const allHypotheses = [...ownHypotheses, ...crossHypotheses];

  return allHypotheses.map(({ hypothesis, sourceDirector }) => {
    const reviews = reports.filter((r) => r.director !== sourceDirector).map((r) => reviewFrom(r, hypothesis)).filter((r): r is HypothesisReview => r !== null);

    const reconsidered = recalculateConfidence(hypothesis, reviews);
    return { ...reconsidered, sourceDirector, reviews };
  });
}
