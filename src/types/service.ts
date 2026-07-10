import type { PaymentMethod } from "./common";

export type ServiceStatus =
  | "agendado"
  | "recebido"
  | "em_execucao"
  | "revisao"
  | "pronto"
  | "entregue";

export interface ServiceOrder {
  id: string;
  time: string;
  customerName: string;
  vehicleModel: string;
  plateMasked: string;
  package: string;
  extras: string[];
  amount: number;
  paymentMethod: PaymentMethod;
  status: ServiceStatus;
}

export interface WashSummary {
  revenue: number;
  vehiclesServed: number;
  averageTicket: number;
  extrasSold: number;
  capacityUsedPercent: number;
  completed: number;
  inProgress: number;
  waiting: number;
}
