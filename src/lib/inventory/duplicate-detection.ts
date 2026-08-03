import type { InventoryItem } from "@/lib/inventory/types";

/**
 * Detecção determinística de possíveis duplicidades (Missão 23) — sem IA generativa, sem
 * decisão automática. Só aponta suspeitas com o motivo exato; a decisão de consolidar (ou não)
 * é sempre humana (ver consolidation.ts). Nunca compara um item já consolidado (`canonicalItemId`
 * preenchido) — esse já tem seu destino resolvido.
 */

const SIZE_TOKEN_PATTERN = /\b\d+([.,]\d+)?\s*(ml|mililitros?|l|lt|litros?|g|gramas?|kg|quilos?|un|und|unidades?|cx|caixas?)\b/gi;
const PUNCTUATION_PATTERN = /[^a-z0-9\s]/g;

/**
 * Nome normalizado para comparação: sem acentos, minúsculo, sem tamanho de embalagem
 * ("Izer 500ml" → "izer"), sem pontuação, espaços colapsados. Nunca usada para exibição —
 * só para comparar.
 */
export function normalizeProductName(name: string): string {
  const noAccents = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const noSize = noAccents.replace(SIZE_TOKEN_PATTERN, " ");
  const noPunctuation = noSize.replace(PUNCTUATION_PATTERN, " ");
  return noPunctuation.replace(/\s+/g, " ").trim();
}

function tokenSet(normalizedName: string): Set<string> {
  return new Set(normalizedName.split(" ").filter(Boolean));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function isSubset(smaller: Set<string>, larger: Set<string>): boolean {
  if (smaller.size === 0 || smaller.size > larger.size) return false;
  for (const token of smaller) if (!larger.has(token)) return false;
  return true;
}

/** Abaixo disso, sobreposição de palavras não vira sinal — evita falso positivo em nomes só parecidos por acaso. */
export const SIMILARITY_THRESHOLD = 0.5;

export interface DuplicateSuspect {
  itemAId: string;
  itemBId: string;
  /** Sempre pelo menos um motivo — nunca aparece sem explicação. */
  reasons: string[];
  /** 0–100, sobreposição de palavras do nome normalizado. */
  similarity: number;
}

/**
 * Compara todo par de itens ativos (nunca já consolidados). O sinal principal é sempre o nome
 * normalizado — marca/categoria/unidade só reforçam ou alertam, nunca disparam sozinhos uma
 * suspeita sem nenhuma semelhança de nome.
 */
export function findDuplicateSuspects(items: InventoryItem[]): DuplicateSuspect[] {
  const candidates = items.filter((i) => i.canonicalItemId === null);
  const suspects: DuplicateSuspect[] = [];

  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];

      const nameA = normalizeProductName(a.name);
      const nameB = normalizeProductName(b.name);
      const tokensA = tokenSet(nameA);
      const tokensB = tokenSet(nameB);
      const similarity = jaccardSimilarity(tokensA, tokensB);
      const exactMatch = nameA.length > 0 && nameA === nameB;
      const contained = !exactMatch && (isSubset(tokensA, tokensB) || isSubset(tokensB, tokensA));

      const reasons: string[] = [];
      if (exactMatch) reasons.push("Nome normalizado idêntico (após remover tamanho de embalagem, acentos e pontuação)");
      if (contained) reasons.push("O nome de um está inteiramente contido no nome do outro (ex.: tamanho de embalagem ou marca a mais)");
      if (!exactMatch && !contained && similarity >= SIMILARITY_THRESHOLD) {
        reasons.push(`Nomes com ${Math.round(similarity * 100)}% de sobreposição de palavras`);
      }

      if (reasons.length === 0) continue;

      const sameBrand = a.brand.trim().toLowerCase() === b.brand.trim().toLowerCase();
      const sameCategory = a.category === b.category;
      const sameUnit = a.unit === b.unit;
      if (sameBrand) reasons.push("Mesma marca");
      else reasons.push("Marcas diferentes — revisar com atenção antes de consolidar");
      if (sameCategory) reasons.push("Mesma categoria");
      if (sameUnit) reasons.push("Mesma unidade-base");

      suspects.push({ itemAId: a.id, itemBId: b.id, reasons, similarity: Math.round(similarity * 100) });
    }
  }

  return suspects.sort((x, y) => y.similarity - x.similarity);
}
