import type { FinanceSummary, RevenuePoint } from "@/types/finance";

export const mockFinanceSummary: FinanceSummary = {
  dailyRevenue: 5980,
  monthlyRevenue: 128400,
  monthlyGoal: 160000,
  goalPercent: 80.25,
  averageTicket: 264.4,
  washRevenue: 3840,
  parkingRevenue: 2140,
  paymentBreakdown: [
    { method: "pix", label: "Pix", amount: 2390, percent: 40 },
    { method: "credito", label: "Crédito", amount: 2150, percent: 36 },
    { method: "debito", label: "Débito", amount: 890, percent: 15 },
    { method: "dinheiro", label: "Dinheiro", amount: 550, percent: 9 },
  ],
};

export const mockRevenueSeries: RevenuePoint[] = [
  { date: "03/07", wash: 3200, parking: 1800, total: 5000 },
  { date: "04/07", wash: 3600, parking: 1950, total: 5550 },
  { date: "05/07", wash: 2900, parking: 2100, total: 5000 },
  { date: "06/07", wash: 4100, parking: 2300, total: 6400 },
  { date: "07/07", wash: 3950, parking: 1980, total: 5930 },
  { date: "08/07", wash: 3700, parking: 2050, total: 5750 },
  { date: "09/07", wash: 3840, parking: 2140, total: 5980 },
];

export const mockMonthlyRevenueSeries: RevenuePoint[] = [
  { date: "Fev", wash: 61000, parking: 34000, total: 95000 },
  { date: "Mar", wash: 68000, parking: 36500, total: 104500 },
  { date: "Abr", wash: 71000, parking: 38000, total: 109000 },
  { date: "Mai", wash: 75000, parking: 41000, total: 116000 },
  { date: "Jun", wash: 79500, parking: 43200, total: 122700 },
  { date: "Jul", wash: 82600, parking: 45800, total: 128400 },
];
