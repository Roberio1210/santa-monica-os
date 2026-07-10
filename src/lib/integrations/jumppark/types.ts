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
  /** Parcela de estacionamento da ordem — vem como string (ex.: "40.00") na API real. */
  amount?: string | number;
  /** Parcela de serviços/lavação da ordem — vem como string na API real. */
  amountServices?: string | number;
  totalAmount?: number;
  financialSituationName?: string;
  operationSituationName?: string;
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
