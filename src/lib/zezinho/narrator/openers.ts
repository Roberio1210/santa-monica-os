import type { ZezinhoIntent } from "@/lib/zezinho/intent/types";

/**
 * Biblioteca de aberturas por intenção — a variação de linguagem exigida pela sprint ("nunca
 * responder igual duas vezes"). Os números e fatos citados nunca variam, só a prosa ao redor
 * deles. A rotação evita repetir a mesma abertura na mesma sessão (ver memory/session.ts:
 * usedNarrationOpeners).
 */
const OPENERS: Record<ZezinhoIntent, string[]> = {
  compare: ["Olhando o período,", "Direto ao ponto,", "Resumindo rápido,", "Batendo o olho nos números,"],
  recommend: ["Pensando como gerente aqui,", "Se eu estivesse cuidando disso amanhã,", "O ponto mais importante agora é este:", "Eu focaria nisto primeiro:"],
  diagnose: ["Na minha leitura,", "O que os números indicam é que", "Minha hipótese principal é que", "Olhando os dados disponíveis,"],
  explain: ["O motivo mais provável é que", "Isso aconteceu porque", "A explicação que os dados sustentam é que"],
  evaluate_decision: [],
  inform: [],
  status_check: [],
  clarify_needed: [],
};

export function pickOpener(intent: ZezinhoIntent, usedOpeners: string[]): string | null {
  const candidates = OPENERS[intent];
  if (candidates.length === 0) return null;
  const unused = candidates.filter((c) => !usedOpeners.includes(c));
  return unused[0] ?? candidates[0];
}
