import type { Contract, Partner } from "@/lib/finance/types";

/** Espelha exatamente o seed real de banco (src/db/seed/contracts.ts). */
export const initialPartners: Partner[] = [
  { id: "iesa-nissan", name: "Grupo IESA/Nissan", type: "parceria_pos_paga" },
  { id: "funeraria", name: "Funerária", type: "contrato_mensal" },
  { id: "don-juan-fast-burger", name: "Don Juan Fast Burger (Jean)", type: "contrato_mensal" },
  { id: "wecharge", name: "WeCharge", type: "outro" },
];

export const initialContracts: Contract[] = [
  {
    id: "contrato-iesa-nissan-lavacao",
    partnerId: "iesa-nissan",
    partnerName: "Grupo IESA/Nissan",
    title: "Parceria pós-paga — Lavação Grupo IESA/Nissan",
    type: "parceria_pos_paga",
    status: "ativo",
    startDate: null,
    endDate: null,
    billingClosingDay: 1,
    dueDay: 10,
    baseValue: null,
    notes:
      "Fechamento no dia 1º, pagamento previsto até o dia 10. Valor normal por lavação: R$ 70,00. Pode haver adicionais. Forma de pagamento das faturas ainda não informada.",
    valuePeriods: [],
    benefits: [],
  },
  {
    id: "contrato-funeraria",
    partnerId: "funeraria",
    partnerName: "Funerária",
    title: "Contrato mensal — Funerária",
    type: "mensalidade",
    status: "ativo",
    startDate: null,
    endDate: null,
    billingClosingDay: null,
    dueDay: 10,
    baseValue: 1000,
    notes: "Dois veículos da funerária no pátio. Direito a 6 lavações mensais, não cumulativas.",
    valuePeriods: [],
    benefits: [
      {
        id: "beneficio-funeraria-6-lavacoes",
        contractId: "contrato-funeraria",
        description: "6 lavações mensais (Lavação funerária), não cumulativas",
        quantityPerPeriod: 6,
        periodType: "mensal",
        cumulative: false,
      },
    ],
  },
  {
    id: "contrato-don-juan-fast-burger",
    partnerId: "don-juan-fast-burger",
    partnerName: "Don Juan Fast Burger (Jean)",
    title: "Contrato mensal do truck — Don Juan Fast Burger",
    type: "mensalidade",
    status: "ativo",
    startDate: null,
    endDate: null,
    billingClosingDay: null,
    dueDay: 15,
    baseValue: null,
    notes:
      "R$ 550,00 até 15/07/2026; R$ 800,00 a partir de 15/08/2026. Nenhum recebimento específico foi confirmado — apenas a regra de vigência.",
    valuePeriods: [
      {
        id: "don-juan-valor-550",
        contractId: "contrato-don-juan-fast-burger",
        amount: 550,
        effectiveFrom: null,
        effectiveUntil: "2026-07-15",
        notes: "Vigente até 15/07/2026. Início da vigência não informado.",
      },
      {
        id: "don-juan-valor-800",
        contractId: "contrato-don-juan-fast-burger",
        amount: 800,
        effectiveFrom: "2026-08-15",
        effectiveUntil: null,
        notes:
          "Vigente a partir de 15/08/2026. O período entre 16/07/2026 e 14/08/2026 não foi coberto por nenhuma informação do proprietário.",
      },
    ],
    benefits: [],
  },
];
