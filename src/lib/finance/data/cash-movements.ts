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
    nature: "receita",
    amount: 900,
    description: "Recebimento parceria IESA/Nissan (competência junho/2026)",
    accountsReceivableId: "iesa-recebivel-2026-06",
    accountsPayableId: null,
    categoryId: "receita-parcerias-pos-pagas",
    categoryName: "Parcerias pós-pagas",
    costCenterId: "cc-lavacao",
    costCenterName: "Lavação",
    /** Conta que recebeu não foi informada pelo proprietário — nunca inventada. */
    financialAccountId: null,
    financialAccountName: null,
    paymentId: null,
    partnerId: "iesa-nissan",
    customerId: null,
    supplierId: null,
    partyName: "Grupo IESA/Nissan",
    responsibleName: null,
    documentRef: null,
    competenceDate: "2026-06-01",
    balanceBefore: null,
    balanceAfter: null,
    source: "seed:contratos-reais",
    externalId: "iesa-pagamento-2026-07-10",
    notes: "Entrada de caixa em 10/07/2026 — não deve ser somada como faturamento operacional gerado nesse dia.",
  },
];
