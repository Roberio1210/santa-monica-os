import type { OperationalServiceCategory } from "@/lib/domain/operational/types";

/**
 * Classificação de categoria de serviço (Sprint 10) — pura, determinística, testável. A JumpPark
 * não tem campo estruturado de categoria (confirmado em docs/jumppark-data-map.md): a única
 * evidência disponível é o texto livre de `services[].description`. Por isso esta função nunca
 * afirma certeza além do que o texto sustenta — quando nenhuma palavra-chave bate, a categoria é
 * sempre "Outros", nunca uma adivinhação específica.
 *
 * Ordem de verificação deliberada: categorias mais específicas (Martelinho, PPF, Vitrificação,
 * Polimento, Higienização) são checadas antes de "Lavação" — um serviço combinado como
 * "Vitrificação + Lavação" no texto livre deve cair na categoria mais específica, nunca na mais
 * genérica.
 */

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const CATEGORY_KEYWORDS: { category: OperationalServiceCategory; keywords: string[] }[] = [
  { category: "Martelinho", keywords: ["martelinho"] },
  { category: "PPF", keywords: ["ppf", "protecao de pintura", "paint protection film"] },
  { category: "Vitrificação", keywords: ["vitrific"] },
  { category: "Polimento", keywords: ["poliment", "polidor"] },
  { category: "Higienização", keywords: ["higieniz"] },
  { category: "Motor", keywords: ["motor"] },
  { category: "Lavação", keywords: ["lavacao", "lavagem", "lava rapido", "lava-rapido"] },
];

/**
 * `serviceDescriptions` é o texto livre de cada item de `services[]` de uma ordem. Uma ordem sem
 * nenhum serviço agregado (estacionamento puro, `services[]` vazio) é sempre "Estacionamento" —
 * nunca "Outros", já que a ausência de serviço É o dado confirmado, não uma classificação
 * incerta.
 */
export function classifyServiceCategory(serviceDescriptions: string[]): OperationalServiceCategory {
  if (serviceDescriptions.length === 0) return "Estacionamento";

  const haystack = stripAccents(serviceDescriptions.join(" ").toLowerCase());
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((keyword) => haystack.includes(stripAccents(keyword)))) return category;
  }
  return "Outros";
}
