import { normalize, parseComparisonExpression, parseSinglePeriodExpression } from "@/lib/zezinho/date-parser";
import type { ExtractedEntities, ZezinhoPackage, ZezinhoTopic } from "@/lib/zezinho/intent/types";

/** Reaproveita a mesma detecção de filtro de área já usada em `service.ts` (2.0). */
function detectAreaFilter(normalized: string): "lavacao" | "estacionamento" | null {
  if (normalized.includes("lavacao") || normalized.includes("lavagem")) return "lavacao";
  if (normalized.includes("estacionamento")) return "estacionamento";
  return null;
}

function detectPackage(normalized: string): ZezinhoPackage | null {
  if (normalized.includes("gold")) return "Gold";
  if (normalized.includes("silver")) return "Silver";
  if (normalized.includes("bronze")) return "Bronze";
  return null;
}

/**
 * Ordem de prioridade quando mais de um tópico aparece na mesma frase — decisão arbitrária mas
 * documentada: preço e equipe são temas de decisão mais específicos que clientes/estoque/caixa,
 * então vencem em caso de menção simultânea.
 */
const TOPIC_PATTERNS: { topic: ZezinhoTopic; test: (n: string) => boolean }[] = [
  { topic: "preco", test: (n) => n.includes("preco") || n.includes("valor cobrado") || n.includes("tabela de valores") },
  { topic: "equipe", test: (n) => n.includes("contratar") || n.includes("contratacao") || n.includes("equipe") || n.includes("funcionario") || n.includes("colaborador") },
  { topic: "clientes", test: (n) => n.includes("cliente") || n.includes("ligar") || n.includes("retornar") || n.includes("contato") },
  { topic: "estoque", test: (n) => n.includes("estoque") || n.includes("produto") },
  { topic: "caixa", test: (n) => n.includes("caixa") },
  { topic: "marketing", test: (n) => n.includes("marketing") || n.includes("campanha") || n.includes("anuncio") || n.includes("instagram") },
  { topic: "agenda", test: (n) => n.includes("agenda") || n.includes("agendamento") },
];

function detectTopic(normalized: string): ZezinhoTopic | null {
  for (const { topic, test } of TOPIC_PATTERNS) {
    if (test(normalized)) return topic;
  }
  return null;
}

/**
 * Extrai as entidades relevantes de um texto (já sem saudação, ver `service.ts:extractGreeting`).
 * Pura — nenhuma chamada de I/O. Reaproveita `date-parser.ts` para período/comparação em vez de
 * duplicar interpretação de data.
 */
export function extractEntities(text: string, referenceDate: Date = new Date()): ExtractedEntities {
  const normalized = normalize(text);
  const comparison = parseComparisonExpression(text, referenceDate);
  const singlePeriod = comparison ? null : parseSinglePeriodExpression(text, referenceDate);

  return {
    comparison,
    singlePeriod,
    areaFilter: detectAreaFilter(normalized),
    packageMentioned: detectPackage(normalized),
    topic: detectTopic(normalized),
  };
}
