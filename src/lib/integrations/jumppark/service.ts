import "server-only";
import { jumpParkClient, JumpParkNotConfiguredError, JumpParkRequestError } from "./client";
import type {
  JumpParkFinancialReport,
  JumpParkServiceOrdersResponse,
  JumpParkServiceOrder,
} from "./types";
import type { PaymentBreakdown } from "@/types/finance";
import type { PaymentMethod } from "@/types/common";
import { maskPlate, maskPhone } from "@/lib/utils/mask";
import { saoPauloDateISO } from "@/lib/utils/timezone";

function classifyPaymentMethod(name: string): PaymentMethod {
  const normalized = name.toLowerCase();
  if (normalized.includes("dinheiro") || normalized.includes("cash")) return "dinheiro";
  if (normalized.includes("debito") || normalized.includes("débito")) return "debito";
  if (normalized.includes("credito") || normalized.includes("crédito")) return "credito";
  if (normalized.includes("pix")) return "pix";
  return "outro";
}

export interface JumpParkDailyFinancial {
  date: string;
  total: number;
  vehicles: number;
  paymentBreakdown: PaymentBreakdown[];
}

function fetchFinancialReport(startDate: string, endDate: string) {
  return jumpParkClient.request<JumpParkFinancialReport>("/reports/financial", {
    startDate,
    endDate,
  });
}

/**
 * Faturamento total do período: soma a parcela de estacionamento puro
 * (`serviceOrders.totalAmount`) com a de serviços/lavação (`services.totalAmount`).
 * Usar só `services.totalAmount` subestima o faturamento real — ver docs/jumppark-data-map.md.
 */
function totalRevenue(report: JumpParkFinancialReport): number {
  const parking = Number(report.data?.serviceOrders?.totalAmount ?? 0);
  const services = Number(report.data?.services?.totalAmount ?? 0);
  return parking + services;
}

/** Espelha `fetch_jumppark_diario` do script Python de referência. */
export async function fetchDailyFinancial(date: string): Promise<JumpParkDailyFinancial> {
  const report = await fetchFinancialReport(date, date);

  const total = totalRevenue(report);
  const vehicles = Number(report.data?.services?.total ?? 0);

  const content = report.data?.paymentMethods?.content ?? [];
  const totals: Record<PaymentMethod, number> = {
    dinheiro: 0,
    debito: 0,
    credito: 0,
    pix: 0,
    outro: 0,
  };
  for (const entry of content) {
    const method = classifyPaymentMethod(entry.paymentMethodName ?? "");
    totals[method] += Number(entry.totalAmount ?? 0);
  }

  const labels: Record<PaymentMethod, string> = {
    dinheiro: "Dinheiro",
    debito: "Débito",
    credito: "Crédito",
    pix: "Pix",
    outro: "Outro",
  };

  const paymentBreakdown: PaymentBreakdown[] = (Object.keys(totals) as PaymentMethod[])
    .filter((method) => totals[method] > 0)
    .map((method) => ({
      method,
      label: labels[method],
      amount: totals[method],
      percent: total > 0 ? (totals[method] / total) * 100 : 0,
    }));

  return { date, total, vehicles, paymentBreakdown };
}

/** Espelha a exportação de ordens de serviço usada em `Atualizar Dashboard.command`. */
export async function fetchServiceOrders(
  startDate: string,
  endDate: string,
): Promise<JumpParkServiceOrder[]> {
  const response = await jumpParkClient.request<JumpParkServiceOrdersResponse>(
    "/serviceorders/export/json",
    { startDate, endDate },
  );
  return response.data?.content ?? [];
}

export interface JumpParkOverviewMetrics {
  dailyRevenue: number;
  monthlyRevenue: number;
  checkedAt: string;
}

/**
 * Métricas para os cards da Visão Geral. Taxa de ocupação e "veículos no
 * estacionamento" não são calculados aqui: a API do JumpPark não expõe a
 * capacidade total de vagas, e a amostra investigada em
 * docs/jumppark-open-orders-investigation.md não trouxe nenhuma ordem em
 * aberto em `/serviceorders/export/json` — não há endpoint confiável para
 * veículos presentes. O princípio do projeto é nunca inventar dados ausentes.
 */
export async function fetchOverviewMetrics(): Promise<JumpParkOverviewMetrics> {
  const today = saoPauloDateISO();
  const firstDayOfMonth = `${today.slice(0, 7)}-01`;

  const [dailyReport, monthlyReport] = await Promise.all([
    fetchFinancialReport(today, today),
    fetchFinancialReport(firstDayOfMonth, today),
  ]);

  return {
    dailyRevenue: totalRevenue(dailyReport),
    monthlyRevenue: totalRevenue(monthlyReport),
    checkedAt: new Date().toISOString(),
  };
}

export interface OperationServiceItem {
  description: string;
  amount: number;
}

export interface OperationOrder {
  id: string;
  code: string | null;
  entryTime: string | null;
  exitTime: string | null;
  plateMasked: string;
  vehicleModel: string;
  clientName: string | null;
  clientPhoneMasked: string | null;
  services: OperationServiceItem[];
  hasServices: boolean;
  parkingAmount: number;
  servicesAmount: number;
  totalAmount: number;
  paymentMethod: string;
  paymentMethodCategory: PaymentMethod;
  situation: string;
}

function formatTime(dateTime?: string): string | null {
  if (!dateTime) return null;
  const time = dateTime.split(" ")[1];
  return time ? time.slice(0, 5) : null;
}

/**
 * Ordens finalizadas (com saída registrada) de um dia, já mascaradas e
 * formatadas para exibição — usado pela tela "Movimentações de Hoje".
 * Nunca retorna placa ou telefone completos.
 */
export async function fetchTodayOperations(date: string): Promise<OperationOrder[]> {
  const orders = await fetchServiceOrders(date, date);

  return orders
    .filter((order) => !!order.exitDateTime)
    .map((order) => {
      const services: OperationServiceItem[] = (order.services ?? []).map((item) => ({
        description: item.description ?? item.name ?? "Serviço",
        amount: Number(item.amount ?? 0),
      }));

      return {
        id: order.serviceOrderId ?? `${order.plate ?? "sem-placa"}-${order.entryDateTime ?? ""}`,
        code: order.serviceOrderCode ?? null,
        entryTime: formatTime(order.entryDateTime),
        exitTime: formatTime(order.exitDateTime),
        plateMasked: maskPlate(order.plate),
        vehicleModel: order.vehicleModel ?? "Não informado",
        clientName: order.clientName ?? null,
        clientPhoneMasked: maskPhone(order.clientPhone),
        services,
        hasServices: services.length > 0,
        parkingAmount: Number(order.amount ?? 0),
        servicesAmount: Number(order.amountServices ?? 0),
        totalAmount: Number(order.totalAmount ?? 0),
        paymentMethod: order.paymentMethodName ?? "Não informado",
        paymentMethodCategory: classifyPaymentMethod(order.paymentMethodName ?? ""),
        situation: order.financialSituationName ?? order.operationSituationName ?? "Não informado",
      };
    })
    .sort((a, b) => (b.exitTime ?? "").localeCompare(a.exitTime ?? ""));
}

export { JumpParkNotConfiguredError, JumpParkRequestError };
