import "server-only";
import { fetchJumpParkPaymentBreakdown } from "@/lib/finance/jumpparkRevenue";
import { getBankStatementRepository } from "@/lib/finance/bankStatement/repository-factory";
import { STONE_SETTLEMENT_LINE_TYPES } from "@/lib/finance/bankStatement/types";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface RevenueReconciliation {
  competenceFrom: string;
  competenceTo: string;
  /** Faturamento operacional real (JumpPark) — sempre o mesmo valor já mostrado na DRE (receitaBrutaEstetica + receitaBrutaEstacionamento), nunca recalculado aqui para não duplicar a fonte da verdade. */
  faturamentoOperacional: number | null;
  /** Quanto do faturamento JumpPark do período foi em dinheiro — nunca aparece no extrato bancário, por definição. */
  faturamentoDinheiro: number;
  /** Liquidações Stone reais do período (bank_statement_lines, tipos STONE_SETTLEMENT_LINE_TYPES) — nunca tratado como faturamento, só como evidência de recebimento financeiro. */
  recebimentosStone: number;
  /** faturamentoOperacional - recebimentosStone. Null quando faturamentoOperacional não é calculável (mesmo princípio "ausência de dado ≠ zero" do resto da DRE). Indicador de conciliação, nunca um erro automático. */
  diferenca: number | null;
  diferencaPercent: number | null;
}

/**
 * Missão Financeiro V3.3 — visão de conciliação: FATURAMENTO (JumpPark, quanto foi vendido) x
 * RECEBIMENTO/LIQUIDAÇÃO (Stone, quanto entrou financeiramente). São conceitos independentes por
 * definição (datas diferentes — visita vs. liquidação bancária — e o dinheiro nunca passa pelo
 * Stone) — a diferença entre eles é um indicador gerencial, nunca um erro a ser zerado.
 *
 * Reaproveita a mesma camada de leitura já usada pela DRE (`fetchJumpParkPaymentBreakdown`) e o
 * repositório de extrato bancário já existente (`getBankStatementRepository`) — nenhuma tabela ou
 * cálculo de receita novo.
 */
export async function fetchRevenueReconciliation(competenceFrom: string, competenceTo: string, faturamentoOperacional: number | null): Promise<RevenueReconciliation> {
  const [lines, jumpParkPayments] = await Promise.all([
    getBankStatementRepository().listLines({ dateFrom: competenceFrom, dateTo: competenceTo, direction: "entrada" }),
    fetchJumpParkPaymentBreakdown(competenceFrom, competenceTo),
  ]);
  const recebimentosStone = round2(lines.filter((l) => (STONE_SETTLEMENT_LINE_TYPES as readonly string[]).includes(l.type)).reduce((sum, l) => sum + l.amount, 0));

  const diferenca = faturamentoOperacional !== null ? round2(faturamentoOperacional - recebimentosStone) : null;
  const diferencaPercent = faturamentoOperacional !== null && faturamentoOperacional !== 0 && diferenca !== null ? round2((diferenca / faturamentoOperacional) * 100) : null;

  return {
    competenceFrom,
    competenceTo,
    faturamentoOperacional,
    faturamentoDinheiro: jumpParkPayments.dinheiro,
    recebimentosStone,
    diferenca,
    diferencaPercent,
  };
}
