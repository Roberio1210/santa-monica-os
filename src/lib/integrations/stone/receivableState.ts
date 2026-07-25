/**
 * Estados dos recebíveis (Sprint 7.0, Z3, decisão do usuário) — classificação pura,
 * determinística, testável. Nunca usa a data de hoje ("agora") diretamente para decidir atraso:
 * usa `dataAvailableThroughDate`, a última data para a qual já temos visibilidade real de
 * liquidação (considerando a defasagem oficial do arquivo diário da Stone, seção 7 do
 * documento de arquitetura) — uma parcela cujo vencimento é ontem, mas cujo arquivo de ontem
 * ainda não está disponível, nunca é classificada como atrasada por engano.
 */

export type ReceivableState = "scheduled" | "due_today" | "settled_on_time" | "settled_early" | "overdue" | "cancelled" | "reversed" | "chargeback" | "unknown";

export interface ReceivableStateInput {
  /** `expectedPaymentDate` já renomeado (`normalize.ts`) — `null` só no caso defensivo de um dado bruto sem previsão. */
  expectedPaymentDate: string | null;
  /** `settledPaymentDate` vinculado (via `saleExternalReference` + `installmentNumber`), quando uma liquidação real já existe para esta parcela. */
  settledPaymentDate: string | null;
  cancelled: boolean;
  chargeback: boolean;
  /** Última data (`YYYY-MM-DD`) com visibilidade real de liquidação — nunca "hoje" no relógio de parede. */
  dataAvailableThroughDate: string;
}

/**
 * Regras, em ordem de precedência (nunca mudam de ordem, sempre testáveis isoladamente):
 * 1. Chargeback sempre vence qualquer outro sinal — é o evento mais grave.
 * 2. Cancelamento: se a parcela já tinha sido liquidada antes do cancelamento, é uma reversão
 *    (`reversed`, dinheiro que saiu e voltou); se nunca chegou a ser liquidada, é só `cancelled`.
 * 3. Sem previsão de pagamento no dado bruto — `unknown`, nunca um estado inventado.
 * 4. Liquidada antes do previsto — `settled_early`. Liquidada no previsto **ou depois** —
 *    `settled_on_time` (a taxonomia pedida tem 9 estados, sem um estado dedicado a "liquidado
 *    atrasado"; a diferença exata de dias entre previsto e liquidado continua visível no campo
 *    numérico da Agenda Financeira — `financialSchedule.ts` — nunca escondida, só não vira um
 *    10º estado que a especificação não pediu).
 * 5. Sem liquidação ainda: compara `expectedPaymentDate` com `dataAvailableThroughDate` —
 *    `overdue` (previsto antes da nossa janela de visibilidade), `due_today` (previsto exatamente
 *    na borda da visibilidade) ou `scheduled` (previsto no futuro).
 */
export function classifyReceivableState(input: ReceivableStateInput): ReceivableState {
  if (input.chargeback) return "chargeback";
  if (input.cancelled) return input.settledPaymentDate ? "reversed" : "cancelled";
  if (!input.expectedPaymentDate) return "unknown";

  if (input.settledPaymentDate) {
    return input.settledPaymentDate < input.expectedPaymentDate ? "settled_early" : "settled_on_time";
  }

  if (input.expectedPaymentDate < input.dataAvailableThroughDate) return "overdue";
  if (input.expectedPaymentDate === input.dataAvailableThroughDate) return "due_today";
  return "scheduled";
}
