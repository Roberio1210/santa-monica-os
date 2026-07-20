import { pickOpener } from "@/lib/zezinho/narrator/openers";
import type { ReasoningResult } from "@/lib/zezinho/reasoning/types";
import type { ZezinhoAnswer } from "@/lib/zezinho/types";

/**
 * Narrador (Etapa 5 — ver docs/zezinho-3.0-architecture.md, seção 8, e as proibições do pedido:
 * nunca abrir toda resposta com "Comparando...", nunca repetir "O que melhorou"/"O que merece
 * atenção", nunca despejar todos os números, variar por intenção). Transforma um `ReasoningResult`
 * (já com fatos/achados/diagnóstico prontos — nada é calculado aqui) em prosa gerencial curta.
 */

export interface NarrateOptions {
  greeting?: string | null;
  usedOpeners: string[];
  dayMatchedNote?: string | null;
}

export interface NarrateResult {
  answer: ZezinhoAnswer;
  openerUsed: string | null;
}

function greetingPrefix(greeting?: string | null): string {
  return greeting ? `${greeting}! ` : "";
}

function factsFor(result: ReasoningResult): string[] {
  return result.facts.map((f) => f.statement);
}

function narrateCompare(result: ReasoningResult, opts: NarrateOptions): NarrateResult {
  const opener = pickOpener("compare", opts.usedOpeners);
  const mainFact = result.facts.find((f) => f.key === "revenue") ?? result.facts[0];
  const parts: string[] = [greetingPrefix(opts.greeting) + (opener ? `${opener} ` : "")];
  if (mainFact) parts.push(mainFact.statement + ".");
  if (opts.dayMatchedNote) parts.push(opts.dayMatchedNote);
  if (result.diagnosis?.mainHypothesis) parts.push(result.diagnosis.mainHypothesis.statement);
  else if (result.facts.length > 1) parts.push(result.facts[1].statement + ".");
  if (result.gaps.length > 0) parts.push(`Não tenho ${result.gaps[0].description.charAt(0).toLowerCase()}${result.gaps[0].description.slice(1)}`);

  return { answer: { text: parts.join(" ").trim(), links: result.links, sources: result.sources, facts: factsFor(result), confidence: result.confidence, followUps: ["O que você faria?", "Onde estamos errando?"] }, openerUsed: opener };
}

function narrateRecommend(result: ReasoningResult, opts: NarrateOptions): NarrateResult {
  const opener = pickOpener("recommend", opts.usedOpeners);
  const prefix = greetingPrefix(opts.greeting) + (opener ? `${opener} ` : "");

  if (result.recommendations.length === 0) {
    return { answer: { text: `${prefix}ainda não tenho uma base clara para recomendar uma ação específica aqui.`, links: result.links, sources: result.sources, confidence: "baixa" }, openerUsed: opener };
  }

  let text: string;
  if (result.recommendations.length === 1) {
    const r = result.recommendations[0];
    text = `${prefix}${r.action} ${r.reason}`;
  } else {
    const lines = [prefix.trim()];
    result.recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r.action} ${r.reason}`));
    text = lines.join("\n");
  }

  return { answer: { text, links: result.links, sources: result.sources, facts: factsFor(result), confidence: result.confidence, followUps: ["Por que isso aconteceu?", "Vale dar desconto para converter?"] }, openerUsed: opener };
}

function narrateDiagnose(result: ReasoningResult, opts: NarrateOptions): NarrateResult {
  const opener = pickOpener("diagnose", opts.usedOpeners);
  const prefix = greetingPrefix(opts.greeting) + (opener ? `${opener} ` : "");

  if (!result.diagnosis?.mainHypothesis) {
    return { answer: { text: `${prefix}não encontrei um padrão claro nos dados disponíveis agora para apontar uma causa principal.`, links: result.links, sources: result.sources, confidence: "baixa" }, openerUsed: opener };
  }

  const parts: string[] = [`${prefix}${result.diagnosis.mainHypothesis.statement}`];
  if (result.diagnosis.alternativeHypotheses.length > 0) {
    parts.push(`Outra possibilidade: ${result.diagnosis.alternativeHypotheses[0].statement}`);
  }
  if (result.gaps.length > 0) {
    parts.push(`O que falta para ter mais certeza: ${result.gaps[0].description}`);
  }
  if (result.recommendations.length > 0) {
    parts.push(`Para validar: ${result.recommendations[0].action.charAt(0).toLowerCase()}${result.recommendations[0].action.slice(1)}`);
  }

  return { answer: { text: parts.join(" "), links: result.links, sources: result.sources, facts: factsFor(result), confidence: result.confidence, followUps: ["O que você faria?"] }, openerUsed: opener };
}

function narrateEvaluateDecision(result: ReasoningResult, opts: NarrateOptions): NarrateResult {
  const prefix = greetingPrefix(opts.greeting);
  if (result.recommendations.length === 0) {
    return { answer: { text: `${prefix}não tenho base suficiente para afirmar isso ainda.`, links: result.links, sources: result.sources, confidence: "baixa" }, openerUsed: null };
  }
  const r = result.recommendations[0];
  const parts = [`${prefix}${r.action}`, r.reason];
  if (r.risk) parts.push(`Risco: ${r.risk}`);
  parts.push(`Para confirmar: ${r.howToVerify}`);

  return { answer: { text: parts.join(" "), links: result.links, sources: result.sources, facts: factsFor(result), confidence: result.confidence, followUps: ["Onde estamos errando?"] }, openerUsed: null };
}

function narrateExplain(result: ReasoningResult, opts: NarrateOptions): NarrateResult {
  const opener = pickOpener("explain", opts.usedOpeners);
  const prefix = greetingPrefix(opts.greeting) + (opener ? `${opener} ` : "");
  const statement = result.diagnosis?.mainHypothesis?.statement ?? "não encontrei uma relação clara nos dados disponíveis para essa pergunta.";
  return { answer: { text: `${prefix}${statement}`, links: result.links, sources: result.sources, facts: factsFor(result), confidence: result.confidence, followUps: ["O que você faria?"] }, openerUsed: opener };
}

function narrateClarifyNeeded(opts: NarrateOptions): NarrateResult {
  return { answer: { text: `${greetingPrefix(opts.greeting)}não entendi bem o que você está perguntando — pode reformular?`, links: [] }, openerUsed: null };
}

/** Ponto de entrada único do narrador — escolhe o formato certo pela intenção, nunca despeja tudo. */
export function narrate(result: ReasoningResult, opts: NarrateOptions): NarrateResult {
  switch (result.intent) {
    case "compare":
      return narrateCompare(result, opts);
    case "recommend":
      return narrateRecommend(result, opts);
    case "diagnose":
      return narrateDiagnose(result, opts);
    case "evaluate_decision":
      return narrateEvaluateDecision(result, opts);
    case "explain":
      return narrateExplain(result, opts);
    case "clarify_needed":
      return narrateClarifyNeeded(opts);
    default:
      return narrateDiagnose(result, opts);
  }
}
