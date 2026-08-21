/**
 * Missão Financeiro V6.2 (Fases 3, 7, 8) — concilia, por dia, o que foi VENDIDO na maquininha
 * (`stone_normalized_transactions`, agrupado por `capturedAt`) contra o que foi EFETIVAMENTE
 * CREDITADO na conta Stone no dia seguinte (`bank_statement_lines` classificadas como
 * `recebimento_venda_stone`, que hoje cobre tanto "Recebível de Cartão" quanto "Transferência
 * entre contas Stone" vinda de "Stone Principal" — ver `classification.ts`).
 *
 * IMPORTANTE (decisão explícita da missão): o CSV real da Stone não traz NSU/TID nem qualquer
 * identificador que ligue uma linha do extrato a uma venda específica — o pareamento aqui é
 * SEMPRE por data agregada (dia da venda × dia seguinte do crédito), nunca por identificador
 * único. Por isso todo resultado carrega `matchBasis: "heuristico_data_valor"` e o status
 * "CONFIRMADO" significa "o valor batido é consistente com nenhuma antecipação identificável
 * nesse dia" — NUNCA uma prova por identificador, só uma correlação forte. Nunca promovido a fato
 * definitivo em `stone_normalized_transactions`/DRE a partir só deste cálculo.
 */

export type StoneSettlementStatus = "CONFIRMADO" | "PARCIAL" | "NAO_CONCILIADO";

export interface DailySaleAggregateInput {
  date: string;
  grossAmount: number;
  mdrAmount: number;
  netExpected: number;
}

export interface DailyBankSettlementInput {
  date: string;
  amount: number;
}

export interface StoneSettlementReconciliationRow {
  saleDate: string;
  grossAmount: number;
  mdrAmount: number;
  /** Outras taxas identificadas só por diferença negativa inesperada — nunca calculado aqui como número separado (ver `difference`). */
  netExpected: number;
  settlementDate: string;
  netReceived: number | null;
  /** `netExpected - netReceived` — `null` quando não há dado bancário para o dia de liquidação. */
  difference: number | null;
  /** Só quando `difference` é um valor plausível de antecipação (>= 0, ou seja, o líquido recebido nunca supera o esperado) — nunca atribuído quando `difference < 0` (isso indicaria pareamento errado, não antecipação). */
  antecipacaoAmount: number | null;
  effectiveTotalRatePercent: number | null;
  status: StoneSettlementStatus;
  matchBasis: "heuristico_data_valor";
}

const TOLERANCE_CENTS = 1;

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Concilia cada dia de venda contra o crédito bancário do dia seguinte (D+1, mesma condição
 * comercial informada pelo gestor — "recebimento D+1 sempre"). `bankSettlements` deve conter só
 * linhas já classificadas como `recebimento_venda_stone` (nunca Pix/pagamento/tarifa genéricos —
 * isso é responsabilidade do chamador, via `classification.ts`).
 */
export function reconcileDailyStoneSettlement(sales: DailySaleAggregateInput[], bankSettlements: DailyBankSettlementInput[]): StoneSettlementReconciliationRow[] {
  const bankByDate = new Map<string, number>();
  for (const b of bankSettlements) bankByDate.set(b.date, (bankByDate.get(b.date) ?? 0) + toCents(b.amount));

  return sales
    .map((sale) => {
      const settlementDate = addOneDay(sale.date);
      const bankCents = bankByDate.get(settlementDate);
      const netReceived = bankCents !== undefined ? bankCents / 100 : null;
      const differenceCents = bankCents !== undefined ? toCents(sale.netExpected) - bankCents : null;
      const difference = differenceCents !== null ? differenceCents / 100 : null;
      const antecipacaoAmount = differenceCents !== null && differenceCents >= 0 ? difference : null;
      const totalCostCents = bankCents !== undefined ? toCents(sale.grossAmount) - bankCents : null;
      const effectiveTotalRatePercent = totalCostCents !== null && sale.grossAmount !== 0 ? Math.round((totalCostCents / toCents(sale.grossAmount)) * 10000) / 100 : null;

      const status: StoneSettlementStatus = bankCents === undefined ? "NAO_CONCILIADO" : differenceCents !== null && Math.abs(differenceCents) <= TOLERANCE_CENTS ? "CONFIRMADO" : "PARCIAL";

      return {
        saleDate: sale.date,
        grossAmount: sale.grossAmount,
        mdrAmount: sale.mdrAmount,
        netExpected: sale.netExpected,
        settlementDate,
        netReceived,
        difference,
        antecipacaoAmount,
        effectiveTotalRatePercent,
        status,
        matchBasis: "heuristico_data_valor" as const,
      };
    })
    .sort((a, b) => a.saleDate.localeCompare(b.saleDate));
}

function addOneDay(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + 1));
  return date.toISOString().slice(0, 10);
}
