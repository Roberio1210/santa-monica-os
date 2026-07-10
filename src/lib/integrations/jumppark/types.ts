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
    paymentMethods?: {
      content?: JumpParkPaymentMethodEntry[];
    };
  };
}

export interface JumpParkServiceEntry {
  description?: string;
  name?: string;
  amount?: number;
}

export interface JumpParkServiceOrder {
  entryDateTime?: string;
  exitDateTime?: string;
  plate?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  paymentMethodName?: string;
  clientName?: string;
  totalAmount?: number;
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
