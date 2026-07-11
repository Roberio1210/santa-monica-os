import type { AccountsReceivable } from "@/lib/finance/types";

/**
 * Espelha exatamente o seed real de banco (src/db/seed/contracts.ts) — mesmos valores, mesma
 * regra. Existe porque a tela /financeiro/contas-a-receber precisa funcionar mesmo sem
 * DATABASE_URL configurada (repositório em memória, ver static-repository.ts).
 *
 * Único evento financeiro confirmado pelo proprietário nesta fase: recebimento de R$ 900,00 em
 * 10/07/2026, da parceria IESA/Nissan, referente à competência de junho/2026. Nenhum outro valor
 * foi inventado — Funerária e Don Juan têm contrato/vigência modelados (ver contracts.ts), mas
 * nenhuma conta a receber própria, porque nenhum recebimento específico foi confirmado.
 */
export const initialAccountsReceivable: AccountsReceivable[] = [
  {
    id: "iesa-recebivel-2026-06",
    customerId: null,
    partnerId: "iesa-nissan",
    contractId: "contrato-iesa-nissan-lavacao",
    partyName: "Grupo IESA/Nissan",
    description: "Parceria IESA/Nissan — lavações de junho/2026",
    competenceDate: "2026-06-01",
    issueDate: null,
    dueDate: "2026-07-10",
    expectedAmount: 900,
    receivedAmount: 900,
    outstandingAmount: 0,
    status: "paid",
    paymentMethod: "desconhecido",
    invoiceNumber: null,
    invoiceIssued: true,
    receivedAt: "2026-07-10",
    source: "seed:contratos-reais",
    externalId: "iesa-recebivel-2026-06",
    notes:
      "Recebido em 10/07/2026, mas referente à competência de junho/2026. Registros do JumpPark lançados como dinheiro não significam necessariamente caixa recebido — este valor confirma o recebimento real relatado pelo proprietário.",
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z",
  },
];
