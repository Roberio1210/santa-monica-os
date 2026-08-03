import type { DataQualitySummaryCounts } from "@/lib/inventory/data-quality-audit";

/**
 * Índice de Saúde do Estoque (Missão 23, seção 6) — 0 a 100, só critérios objetivos, sem IA
 * generativa. Cada dimensão é uma proporção real (produtos/movimentações que passam no critério
 * ÷ total), nunca um número arbitrário. Pesos documentados abaixo, somam exatamente 100.
 */
export interface HealthDimension {
  id: string;
  label: string;
  /** Peso desta dimensão no índice geral, em pontos percentuais (todos os pesos somam 100). */
  weight: number;
  /** 0–100 — proporção real de itens/movimentações que passam no critério desta dimensão. */
  score: number;
  detail: string;
}

export interface HealthIndexResult {
  overallScore: number;
  dimensions: HealthDimension[];
  /** Sugestões ordenadas pela dimensão com maior peso × menor score — a ação com mais impacto potencial no índice vem primeiro. */
  topActions: string[];
}

/**
 * Pesos documentados (somam 100):
 *  - completude cadastral: 20 — % de produtos com todos os campos complementares preenchidos.
 *  - consistência de unidades: 15 — % de produtos sem sinal de unidade inconsistente com o nome.
 *  - consistência de saldos: 15 — % de produtos sem saldo negativo.
 *  - presença de custos: 15 — % de produtos com custo médio cadastrado.
 *  - presença de fornecedor: 10 — % de produtos com fornecedor conhecido.
 *  - estoque mínimo e ideal configurados: 10 — % dos dois campos preenchidos (conta os dois separadamente).
 *  - rastreabilidade das movimentações: 10 — % de produtos com histórico + % de movimentações com responsável.
 *  - ausência de duplicidades não resolvidas: 5 — cada suspeita não resolvida custa pontos, nunca abaixo de 0.
 */
export const HEALTH_DIMENSION_WEIGHTS = {
  completudeCadastral: 20,
  consistenciaUnidades: 15,
  consistenciaSaldos: 15,
  presencaCustos: 15,
  presencaFornecedor: 10,
  estoqueMinimoIdeal: 10,
  rastreabilidadeMovimentacoes: 10,
  ausenciaDuplicidades: 5,
} as const;

/** Decisão desta sprint — cada suspeita de duplicidade ainda não revisada custa 10 pontos na dimensão (documentado, não uma regra recebida). */
export const DUPLICATE_PENALTY_PER_SUSPECT = 10;

function percent(passing: number, total: number): number {
  if (total <= 0) return 100;
  return round1((passing / total) * 100);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export interface HealthIndexInput {
  summary: DataQualitySummaryCounts;
  /** Nº de pares de duplicidade suspeitos ainda sem decisão ("Não são duplicados"/"Revisar depois" contam como resolvidos aqui — só o que nunca foi revisado pesa). */
  unresolvedDuplicateSuspectCount: number;
  totalMovements: number;
  movementsWithoutResponsible: number;
}

export function computeHealthIndex(input: HealthIndexInput): HealthIndexResult {
  const { summary, unresolvedDuplicateSuspectCount, totalMovements, movementsWithoutResponsible } = input;
  const total = summary.totalProducts;

  const completudeCadastral = percent(summary.completeProducts, total);
  const consistenciaUnidades = percent(total - summary.inconsistentUnit, total);
  const consistenciaSaldos = percent(total - summary.negativeBalance, total);
  const presencaCustos = percent(total - summary.withoutCost, total);
  const presencaFornecedor = percent(total - summary.withoutSupplier, total);
  const estoqueMinimoIdeal = percent(total * 2 - summary.withoutMinimumStock - summary.withoutIdealStock, total * 2);

  const itemsWithHistoryScore = percent(total - summary.withoutMovement, total);
  const movementsWithResponsibleScore = percent(totalMovements - movementsWithoutResponsible, totalMovements);
  const rastreabilidadeMovimentacoes = round1((itemsWithHistoryScore + movementsWithResponsibleScore) / 2);

  const ausenciaDuplicidades = Math.max(0, round1(100 - unresolvedDuplicateSuspectCount * DUPLICATE_PENALTY_PER_SUSPECT));

  const dimensions: HealthDimension[] = [
    { id: "completude_cadastral", label: "Completude cadastral", weight: HEALTH_DIMENSION_WEIGHTS.completudeCadastral, score: completudeCadastral, detail: `${summary.completeProducts} de ${total} produtos com todos os campos complementares preenchidos.` },
    { id: "consistencia_unidades", label: "Consistência de unidades", weight: HEALTH_DIMENSION_WEIGHTS.consistenciaUnidades, score: consistenciaUnidades, detail: `${summary.inconsistentUnit} produto(s) com possível inconsistência entre nome e unidade cadastrada.` },
    { id: "consistencia_saldos", label: "Consistência de saldos", weight: HEALTH_DIMENSION_WEIGHTS.consistenciaSaldos, score: consistenciaSaldos, detail: `${summary.negativeBalance} produto(s) com saldo negativo.` },
    { id: "presenca_custos", label: "Presença de custos", weight: HEALTH_DIMENSION_WEIGHTS.presencaCustos, score: presencaCustos, detail: `${total - summary.withoutCost} de ${total} produtos com custo médio cadastrado.` },
    { id: "presenca_fornecedor", label: "Presença de fornecedor", weight: HEALTH_DIMENSION_WEIGHTS.presencaFornecedor, score: presencaFornecedor, detail: `${total - summary.withoutSupplier} de ${total} produtos com fornecedor conhecido.` },
    { id: "estoque_minimo_ideal", label: "Estoque mínimo e ideal configurados", weight: HEALTH_DIMENSION_WEIGHTS.estoqueMinimoIdeal, score: estoqueMinimoIdeal, detail: `${summary.withoutMinimumStock} sem mínimo, ${summary.withoutIdealStock} sem ideal.` },
    { id: "rastreabilidade_movimentacoes", label: "Rastreabilidade das movimentações", weight: HEALTH_DIMENSION_WEIGHTS.rastreabilidadeMovimentacoes, score: rastreabilidadeMovimentacoes, detail: `${summary.withoutMovement} produto(s) sem nenhuma movimentação; ${movementsWithoutResponsible} de ${totalMovements} movimentação(ões) sem responsável.` },
    { id: "ausencia_duplicidades", label: "Ausência de duplicidades não resolvidas", weight: HEALTH_DIMENSION_WEIGHTS.ausenciaDuplicidades, score: ausenciaDuplicidades, detail: `${unresolvedDuplicateSuspectCount} suspeita(s) de duplicidade ainda sem decisão.` },
  ];

  const overallScore = round1(dimensions.reduce((sum, d) => sum + (d.score * d.weight) / 100, 0));

  const topActions = [...dimensions]
    .filter((d) => d.score < 100)
    .sort((a, b) => b.weight * (100 - b.score) - a.weight * (100 - a.score))
    .slice(0, 3)
    .map((d) => `Melhorar "${d.label}" (${d.score}/100, peso ${d.weight}) — ${d.detail}`);

  return { overallScore, dimensions, topActions };
}
