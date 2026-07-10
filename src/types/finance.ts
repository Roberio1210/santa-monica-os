import type { PaymentMethod } from "./common";

export interface PaymentBreakdown {
  method: PaymentMethod;
  label: string;
  amount: number;
  percent: number;
}

export interface FinanceSummary {
  dailyRevenue: number;
  monthlyRevenue: number;
  monthlyGoal: number;
  goalPercent: number;
  averageTicket: number;
  washRevenue: number;
  parkingRevenue: number;
  paymentBreakdown: PaymentBreakdown[];
}

export interface RevenuePoint {
  date: string;
  wash: number;
  parking: number;
  total: number;
}
