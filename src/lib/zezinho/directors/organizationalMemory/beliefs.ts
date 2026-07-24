import type { Belief } from "@/lib/zezinho/directors/organizationalMemory/types";

/**
 * Crenças da empresa (Sprint 5.0, Z3B, decisão do usuário) — princípios permanentes que podem
 * influenciar recomendações futuras. As 4 primeiras são os exemplos dados literalmente pelo
 * usuário; as 4 seguintes são os "princípios não-negociáveis" já documentados no contexto do
 * cliente (CLAUDE.md) — nenhuma inventada, todas rastreáveis à origem exata.
 */
export const SEED_BELIEFS: { statement: string; category: string | null; source: string }[] = [
  { statement: "Qualidade acima da velocidade.", category: "qualidade", source: "Sprint 5.0 Z3B — exemplo do usuário" },
  { statement: "Oferecer adicionais quando fizer sentido para o cliente.", category: "vendas", source: "Sprint 5.0 Z3B — exemplo do usuário" },
  { statement: "Foco na experiência do cliente.", category: "atendimento", source: "Sprint 5.0 Z3B — exemplo do usuário" },
  { statement: "Manter comunicação ativa com leads.", category: "vendas", source: "Sprint 5.0 Z3B — exemplo do usuário" },
  { statement: "Nunca prometer o que não pode entregar.", category: "qualidade", source: "CLAUDE.md — princípios não-negociáveis do cliente" },
  { statement: "Sempre mostrar resultado real.", category: "qualidade", source: "CLAUDE.md — princípios não-negociáveis do cliente" },
  { statement: "Respeitar o carro do cliente como se fosse o nosso.", category: "atendimento", source: "CLAUDE.md — princípios não-negociáveis do cliente" },
  { statement: "Qualidade acima de volume.", category: "qualidade", source: "CLAUDE.md — princípios não-negociáveis do cliente" },
];

const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "o", "a", "os", "as", "que", "com", "para", "em", "um", "uma", "e", "no", "na", "se", "por", "ao"]);

function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Correspondência por sobreposição real de palavras-chave entre o texto (ex.: ação/motivo de uma
 * recomendação) e o enunciado da crença — nunca uma pontuação semântica inventada. Ordenado pela
 * maior sobreposição primeiro.
 */
export function findRelevantBeliefs(beliefs: Belief[], text: string): Belief[] {
  const targetTokens = tokenize(text);
  if (targetTokens.size === 0) return [];
  return beliefs
    .map((belief) => ({ belief, overlap: [...tokenize(belief.statement)].filter((t) => targetTokens.has(t)).length }))
    .filter((entry) => entry.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .map((entry) => entry.belief);
}
