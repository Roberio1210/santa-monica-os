import type { AccountsReceivableStatus, FinancePaymentMethod } from "@/lib/finance/types";

export type CustomerStatus = "novo" | "ativo" | "vip" | "em_risco" | "perdido";

export interface CrmServiceSummary {
  description: string;
  count: number;
  totalAmount: number;
}

export interface CrmVehicleSummary {
  plateMasked: string;
  model: string;
  color: string | null;
  visitCount: number;
  totalSpent: number;
  lastVisit: string | null;
  recentServices: string[];
}

export interface CrmTimelineEntry {
  orderId: string;
  date: string;
  time: string | null;
  vehicleModel: string;
  plateMasked: string;
  services: string[];
  amount: number;
  paymentMethod: string;
  situation: string;
}

export interface CrmFinancialItem {
  id: string;
  description: string;
  dueDate: string;
  expectedAmount: number;
  receivedAmount: number;
  outstandingAmount: number;
  status: AccountsReceivableStatus;
  receivedAt: string | null;
  paymentMethod: FinancePaymentMethod;
}

export interface CrmFinancialSummary {
  matched: boolean;
  items: CrmFinancialItem[];
  totalOpen: number;
  totalOverdue: number;
  totalReceived: number;
}

export interface CrmOpportunity {
  reason: string;
  suggestedAction: string;
}

export interface CrmRecommendation {
  title: string;
  reason: string;
}

export interface CrmCustomer {
  id: string;
  name: string;
  phoneMasked: string | null;
  hasPhone: boolean;
  whatsappUrl: string | null;
  status: CustomerStatus;
  statusReason: string;
  firstVisit: string | null;
  lastVisit: string | null;
  daysSinceLastVisit: number | null;
  visitCount: number;
  totalSpent: number;
  averageTicket: number;
  averageIntervalDays: number | null;
  topServices: CrmServiceSummary[];
  vehicles: CrmVehicleSummary[];
  timeline: CrmTimelineEntry[];
  financial: CrmFinancialSummary;
  opportunities: CrmOpportunity[];
  recommendations: CrmRecommendation[];
}

export interface CrmListResult {
  customers: CrmCustomer[];
  jumpparkConfigured: boolean;
  error: string | null;
  historyDays: number;
}

export const CUSTOMER_STATUS_LABEL: Record<CustomerStatus, string> = {
  novo: "Novo",
  ativo: "Ativo",
  vip: "VIP",
  em_risco: "Em risco",
  perdido: "Perdido",
};
