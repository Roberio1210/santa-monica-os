import { normalize } from "@/lib/zezinho/date-parser";
import { extractEntities } from "@/lib/zezinho/intent/entities";
import type { IntentResult, ZezinhoIntent } from "@/lib/zezinho/intent/types";
import { hasActiveAnalysis, type ReasoningSession } from "@/lib/zezinho/memory/types";

/**
 * Classificador de intenção (Etapa 1 — ver docs/zezinho-3.0-architecture.md, seção 4). Determinístico
 * por regras, sem IA generativa. Recebe o texto já sem saudação (a extração de saudação continua
 * sendo responsabilidade de quem chama, como hoje em `service.ts`).
 *
 * Nesta etapa (Z1) este módulo é novo e testado isoladamente — ainda NÃO substitui o roteamento
 * ao vivo em `service.ts` (isso acontece na integração final, Z4, junto com o narrador novo), para
 * não arriscar regressão no chat em produção enquanto o pipeline inteiro (planner + raciocínio)
 * ainda não existe.
 */

const RECOMMEND_PATTERNS: RegExp[] = [
  /\bque devemos fazer\b/,
  /\bo que fazer\b/,
  /\bvoce recomenda\b/,
  /\bo que recomenda\b/,
  /\bsua sugestao\b/,
  /\bsua opiniao\b/,
  /\bcomo podemos melhorar\b/,
  /\bcomo melhorar\b/,
  /\bcomo elevar\b/,
  /\belevar\w*\s+(esses|os|nossos)?\s*numeros\b/,
  /\baumentar\w*\s+(esses|os|nossos)?\s*numeros\b/,
  /\baumentar\w*\s+(o\s+)?ticket\s*medio\b/,
  /\bqual\s+(deve ser\s+)?(o\s+)?(nosso\s+)?plano\b/,
  /\bonde devemos agir\b/,
  /\bcomo gerente\b/,
  /\bo que (voce )?faria\b/,
  /\bmanter\s+(o|esse|esta)?\s*crescimento\b/,
  /\bplano de acao\b/,
  /\bde um plano\b/,
  /\bplano para\b/,
  /\bquem devemos ligar\b/,
  /\bquem ligar\b/,
  /\bquem devemos contatar\b/,
  /\bquem contatar\b/,
  /\bquem priorizar\b/,
  /\bem quem focar\b/,
];

const EVALUATE_DECISION_PATTERNS: RegExp[] = [
  /\bvale a pena\b/,
  /\bvale aumentar\b/,
  /\bvale reduzir\b/,
  /\bvale contratar\b/,
  /\bvale investir\b/,
  /\bvale subir\b/,
  /\bdevemos vender mais\b/,
  /\bdevemos aumentar\b/,
  /\bdevemos reduzir\b/,
  /\bcompensa\s+(contratar|aumentar|reduzir|investir)\b/,
  /\bfaz sentido\s+(contratar|aumentar|reduzir|investir)\b/,
];

const DIAGNOSE_PATTERNS: RegExp[] = [
  /\bonde erramos\b/,
  /\bonde estamos errando\b/,
  /\bonde estamos falhando\b/,
  /\bo que esta errado\b/,
  /\bo que deu errado\b/,
  /\btem algo preocupante\b/,
  /\balgo preocupante\b/,
  /\balguma coisa preocupante\b/,
  /\bqual (e |foi )?o problema\b/,
];

const EXPLAIN_PATTERNS: RegExp[] = [
  /\bpor que\b/,
  /\bpor qu\b/,
  /\bo que explica\b/,
  /\bo que causou\b/,
  /\bo que aconteceu\b/,
  /\bqual foi o principal\b/,
  /\bquais servicos explicam\b/,
  /\bqual servico\b/,
];

const STATUS_CHECK_PATTERNS: RegExp[] = [/\bcomo esta a empresa\b/, /\bcomo estamos indo\b/, /\bcomo vai a empresa\b/, /\bcomo anda a empresa\b/];

function matchesAny(patterns: RegExp[], normalized: string): boolean {
  return patterns.some((p) => p.test(normalized));
}

/**
 * `true` quando o texto normalizado tem conteúdo textual real demais para ser considerado
 * ambíguo — usado só como último critério, para `clarify_needed` nunca ser o caminho comum (ver
 * docs/zezinho-3.0-architecture.md, seção 4).
 */
function hasEnoughContent(normalized: string): boolean {
  return normalized.replace(/[^a-z]/g, "").length >= 3;
}

export function classifyIntent(text: string, memory: ReasoningSession, referenceDate: Date = new Date()): IntentResult {
  const normalized = normalize(text);
  const entities = extractEntities(text, referenceDate);

  const decide = (intent: ZezinhoIntent, rationale: string): IntentResult => ({ intent, entities, rationale });

  if (matchesAny(RECOMMEND_PATTERNS, normalized)) return decide("recommend", "Frase de pedido de recomendação/plano de ação.");
  if (matchesAny(EVALUATE_DECISION_PATTERNS, normalized)) return decide("evaluate_decision", "Frase de avaliação de decisão ('vale a pena', 'devemos vender mais', etc.).");
  if (matchesAny(DIAGNOSE_PATTERNS, normalized)) return decide("diagnose", "Frase de diagnóstico ('onde erramos', 'algo preocupante').");
  if (matchesAny(EXPLAIN_PATTERNS, normalized)) return decide("explain", "Frase de explicação ('por que', 'o que causou').");

  if (entities.comparison !== null) return decide("compare", "Comparação de períodos reconhecida pelo interpretador de datas.");
  if (entities.areaFilter !== null && hasActiveAnalysis(memory)) return decide("compare", "Filtro de área aplicado sobre uma análise já em andamento (drill-down).");

  if (matchesAny(STATUS_CHECK_PATTERNS, normalized)) return decide("status_check", "Pergunta genérica sobre a saúde da empresa hoje.");

  if (!hasEnoughContent(normalized)) return decide("clarify_needed", "Texto sem conteúdo reconhecível suficiente para prosseguir com segurança.");

  return decide("inform", "Nenhum padrão gerencial reconhecido — presumidamente uma pergunta factual direta (roteador determinístico decide o fato específico).");
}
