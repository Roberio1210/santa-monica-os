import type { CashMovement } from "@/lib/finance/types";

/**
 * Movimentos de caixa reais confirmados. Distintos de accounts-receivable.ts: aqui é o dinheiro
 * que efetivamente entrou/saiu numa data — nunca o faturamento operacional do período.
 */
export const initialCashMovements: CashMovement[] = [
  {
    id: "iesa-caixa-2026-07-10",
    date: "2026-07-10",
    type: "entrada",
    amount: 900,
    description: "Recebimento parceria IESA/Nissan (competência junho/2026)",
    accountsReceivableId: "iesa-recebivel-2026-06",
    categoryId: "receita-parcerias-pos-pagas",
    costCenterId: "cc-lavacao",
    source: "seed:contratos-reais",
    externalId: "iesa-pagamento-2026-07-10",
    notes: "Entrada de caixa em 10/07/2026 — não deve ser somada como faturamento operacional gerado nesse dia.",
  },
];
