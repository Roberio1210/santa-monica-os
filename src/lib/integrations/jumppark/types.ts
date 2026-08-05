export interface JumpParkPaymentMethodEntry {
  paymentMethodName: string;
  totalAmount: number;
}

export interface JumpParkFinancialReport {
  data: {
    services?: {
      total?: number;
      totalAmount?: number;
    };
    /** Receita de estacionamento puro (ordens sem serviços agregados). */
    serviceOrders?: {
      total?: number;
      totalAmount?: number;
    };
    paymentMethods?: {
      content?: JumpParkPaymentMethodEntry[];
    };
  };
}

export interface JumpParkServiceEntry {
  description?: string;
  name?: string;
  /** Vem como string (ex.: "180.00") na API real. */
  amount?: string | number;
  quantity?: number;
  /** Significado não confirmado — ver docs/jumppark-data-map.md. */
  serviceContractId?: string | number | null;
  /** Estrutura não documentada pela JumpPark — preservado como veio, nunca interpretado. */
  commissioners?: unknown;
}

export interface JumpParkObservations {
  observation?: string | null;
  editObservation?: string | null;
  cancelObservation?: string | null;
  deleteObservation?: string | null;
  changePriceObservation?: string | null;
}

export interface JumpParkServiceOrder {
  serviceOrderId?: string;
  serviceOrderCode?: string;
  entryDateTime?: string;
  exitDateTime?: string;
  plate?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  paymentMethodName?: string;
  clientName?: string | null;
  clientPhone?: string | null;
  /** Chave presente na API, raramente populada — ver docs/jumppark-data-map.md. */
  clientEmail?: string | null;
  /** Parcela de estacionamento da ordem — vem como string (ex.: "40.00") na API real. */
  amount?: string | number;
  /** Parcela de serviços/lavação da ordem — vem como string na API real. */
  amountServices?: string | number;
  totalAmount?: number;
  financialSituationName?: string;
  operationSituationName?: string;
  situationId?: number | null;
  financialSituationId?: number | null;
  discountId?: string | number | null;
  discountAmount?: string | number | null;
  discountType?: string | null;
  /** Possível indicador de tabela de preço/mensalista — não confirmado, ver docs/jumppark-data-map.md. */
  typePrice?: string | null;
  cardCode?: number | null;
  /** Operador que registrou a entrada. */
  userName?: string | null;
  /** Operador que registrou a saída. */
  userOutputName?: string | null;
  observations?: JumpParkObservations | null;
  establishmentId?: string | number | null;
  establishmentName?: string | null;
  services?: JumpParkServiceEntry[];
}

export interface JumpParkServiceOrdersResponse {
  data: {
    content: JumpParkServiceOrder[];
  };
}

export interface JumpParkStatus {
  configured: boolean;
  reachable: boolean | null;
  message: string;
  checkedAt: string;
}
