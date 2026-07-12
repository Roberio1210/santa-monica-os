import type { FinancialAccount } from "@/lib/finance/types";

/** Espelha o seed real de banco. Nenhum saldo foi inventado além do fundo fixo informado. */
export const initialFinancialAccounts: FinancialAccount[] = [
  {
    id: "conta-stone",
    name: "Stone",
    type: "conta_pagamento",
    fixedFundAmount: null,
    informedBalance: null,
    informedBalanceAt: null,
    notes: "Recebimentos de cartão, Pix Stone e antecipação D+1.",
  },
  {
    id: "conta-ailos-credcrea",
    name: "Ailos / CredCrea",
    type: "conta_bancaria",
    fixedFundAmount: null,
    informedBalance: null,
    informedBalanceAt: null,
    notes: null,
  },
  {
    id: "conta-caixa-fisico",
    name: "Caixa físico",
    type: "dinheiro",
    fixedFundAmount: 100,
    informedBalance: null,
    informedBalanceAt: null,
    notes: "Fundo fixo desejado: R$ 100,00. Alerta quando o saldo calculado ficar abaixo desse valor.",
  },
];
