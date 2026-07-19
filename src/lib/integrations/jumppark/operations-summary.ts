import "server-only";
import { isJumpParkConfigured } from "@/lib/config/env";
import { maskPlate, maskPhone } from "@/lib/utils/mask";
import { fetchServiceOrders } from "./service";
import { JumpParkNotConfiguredError, JumpParkRequestError } from "./client";
import { resolvePeriod } from "@/lib/utils/timezone";
import type { PaymentMethod } from "@/types/common";
import type { JumpParkServiceOrder } from "./types";

function classifyPaymentMethod(name: string): PaymentMethod {
  const normalized = name.toLowerCase();
  if (normalized.includes("dinheiro") || normalized.includes("cash")) return "dinheiro";
  if (normalized.includes("debito") || normalized.includes("débito")) return "debito";
  if (normalized.includes("credito") || normalized.includes("crédito")) return "credito";
  if (normalized.includes("pix")) return "pix";
  return "outro";
}

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  pix: "Pix",
  outro: "Outro",
};

function timeOnly(dateTime?: string): string | null {
  if (!dateTime) return null;
  const time = dateTime.split(" ")[1];
  return time ? time.slice(0, 5) : null;
}

function dateOnly(dateTime?: string): string | null {
  if (!dateTime) return null;
  return dateTime.slice(0, 10);
}

export type OperationalOrderKind = "lavacao" | "estacionamento";

export interface OperationalOrderService {
  description: string;
  amount: number;
}

/**
 * Ordem operacional finalizada (com saída registrada), já mascarada — fonte única reutilizada
 * por /movimentacoes, /lavacao, /estacionamento e pelos cards do dashboard. Nunca inclui placa
 * ou telefone completos.
 */
export interface OperationalOrder {
  externalId: string;
  code: string | null;
  date: string;
  entryDateTime: string | null;
  exitDateTime: string | null;
  entryTime: string | null;
  exitTime: string | null;
  clientName: string | null;
  clientPhoneMasked: string | null;
  vehicleModel: string;
  plateMasked: string;
  services: OperationalOrderService[];
  kind: OperationalOrderKind;
  parkingAmount: number;
  servicesAmount: number;
  totalAmount: number;
  paymentMethodName: string;
  paymentMethodCategory: PaymentMethod;
  situation: string;
}

export interface OperationalOrdersResult {
  orders: OperationalOrder[];
  jumpparkConfigured: boolean;
  error: string | null;
  period: { from: string; to: string };
}

function mapOrder(order: JumpParkServiceOrder): OperationalOrder {
  const services: OperationalOrderService[] = (order.services ?? []).map((item) => ({
    description: item.description ?? item.name ?? "Serviço",
    amount: Number(item.amount ?? 0),
  }));
  const servicesAmount = Number(order.amountServices ?? 0);

  return {
    externalId: order.serviceOrderId ?? `${order.plate ?? "sem-placa"}-${order.entryDateTime ?? ""}`,
    code: order.serviceOrderCode ?? null,
    date: dateOnly(order.exitDateTime) ?? dateOnly(order.entryDateTime) ?? "",
    entryDateTime: order.entryDateTime ?? null,
    exitDateTime: order.exitDateTime ?? null,
    entryTime: timeOnly(order.entryDateTime),
    exitTime: timeOnly(order.exitDateTime),
    clientName: order.clientName ?? null,
    clientPhoneMasked: maskPhone(order.clientPhone),
    vehicleModel: order.vehicleModel ?? "Não informado",
    plateMasked: maskPlate(order.plate),
    services,
    kind: services.length > 0 || servicesAmount > 0 ? "lavacao" : "estacionamento",
    parkingAmount: Number(order.amount ?? 0),
    servicesAmount,
    totalAmount: Number(order.totalAmount ?? 0),
    paymentMethodName: order.paymentMethodName ?? "Não informado",
    paymentMethodCategory: classifyPaymentMethod(order.paymentMethodName ?? ""),
    situation: order.financialSituationName ?? order.operationSituationName ?? "Não informado",
  };
}

function errorMessageFor(error: unknown): string {
  if (error instanceof JumpParkNotConfiguredError) return "JumpPark não configurado neste ambiente.";
  if (error instanceof JumpParkRequestError) {
    if (error.status === 401 || error.status === 403) return "As credenciais do JumpPark foram rejeitadas.";
    return `A API do JumpPark respondeu com erro (HTTP ${error.status}).`;
  }
  if (error instanceof Error && error.name === "AbortError") return "A API do JumpPark não respondeu a tempo (timeout).";
  return "A API do JumpPark não respondeu.";
}

/**
 * Ordens finalizadas (com saída registrada) de um período — fonte real única para as telas
 * operacionais desta sprint. `/serviceorders/export/json` não é paginado nas amostras
 * investigadas (ver docs/jumppark-data-map.md); nenhuma paginação é assumida ou inventada.
 */
export async function fetchOperationalOrders(from: string, to: string): Promise<OperationalOrdersResult> {
  const period = { from, to };
  if (!isJumpParkConfigured()) {
    return { orders: [], jumpparkConfigured: false, error: "JumpPark não configurado neste ambiente.", period };
  }

  try {
    const raw = await fetchServiceOrders(from, to);
    const orders = raw
      .filter((o) => !!o.exitDateTime)
      .map(mapOrder)
      .sort((a, b) => (b.exitDateTime ?? "").localeCompare(a.exitDateTime ?? ""));
    return { orders, jumpparkConfigured: true, error: null, period };
  } catch (error) {
    return { orders: [], jumpparkConfigured: true, error: errorMessageFor(error), period };
  }
}

export interface PaymentBreakdownEntry {
  method: PaymentMethod;
  label: string;
  amount: number;
  count: number;
}

export interface OperationalSummary {
  ordersCount: number;
  vehiclesServed: number;
  washCount: number;
  parkingCount: number;
  revenue: number;
  washRevenue: number;
  parkingRevenue: number;
  averageTicket: number | null;
  clientsIdentified: number;
  paymentBreakdown: PaymentBreakdownEntry[];
}

/** Agregação pura sobre ordens já buscadas — nunca faz I/O, sempre testável isoladamente. */
export function computeOperationalSummary(orders: OperationalOrder[]): OperationalSummary {
  const ordersCount = orders.length;
  const vehiclesServed = new Set(orders.map((o) => o.plateMasked)).size;
  const washOrders = orders.filter((o) => o.kind === "lavacao");
  const parkingOrders = orders.filter((o) => o.kind === "estacionamento");
  const revenue = round2(orders.reduce((sum, o) => sum + o.totalAmount, 0));
  const washRevenue = round2(washOrders.reduce((sum, o) => sum + o.totalAmount, 0));
  const parkingRevenue = round2(parkingOrders.reduce((sum, o) => sum + o.totalAmount, 0));
  const clientsIdentified = new Set(orders.filter((o) => o.clientName).map((o) => o.clientName)).size;

  const paymentTotals = new Map<PaymentMethod, { amount: number; count: number }>();
  for (const order of orders) {
    const entry = paymentTotals.get(order.paymentMethodCategory) ?? { amount: 0, count: 0 };
    entry.amount = round2(entry.amount + order.totalAmount);
    entry.count += 1;
    paymentTotals.set(order.paymentMethodCategory, entry);
  }
  const paymentBreakdown: PaymentBreakdownEntry[] = Array.from(paymentTotals.entries())
    .map(([method, v]) => ({ method, label: PAYMENT_LABELS[method], ...v }))
    .sort((a, b) => b.amount - a.amount);

  return {
    ordersCount,
    vehiclesServed,
    washCount: washOrders.length,
    parkingCount: parkingOrders.length,
    revenue,
    washRevenue,
    parkingRevenue,
    averageTicket: ordersCount > 0 ? round2(revenue / ordersCount) : null,
    clientsIdentified,
    paymentBreakdown,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export type ComparisonTrend = "aumento" | "queda" | "estavel" | "indisponivel";

export interface PeriodComparison {
  current: number;
  previous: number | null;
  deltaPercent: number | null;
  trend: ComparisonTrend;
}

/**
 * Compara um valor atual com o do período anterior — nunca inventa percentual quando o valor
 * anterior é `null` (indisponível) ou zero (base sem sentido para variação percentual).
 */
export function comparePeriods(current: number, previous: number | null): PeriodComparison {
  if (previous === null) return { current, previous: null, deltaPercent: null, trend: "indisponivel" };
  if (previous === 0) {
    if (current === 0) return { current, previous, deltaPercent: 0, trend: "estavel" };
    return { current, previous, deltaPercent: null, trend: "aumento" };
  }
  const deltaPercent = round2(((current - previous) / previous) * 100);
  const trend: ComparisonTrend = deltaPercent > 0.5 ? "aumento" : deltaPercent < -0.5 ? "queda" : "estavel";
  return { current, previous, deltaPercent, trend };
}

export interface ReferencePeriodSummaries {
  today: OperationalSummary;
  yesterday: OperationalSummary;
  week: OperationalSummary;
  month: OperationalSummary;
  jumpparkConfigured: boolean;
  error: string | null;
}

/**
 * Resumos de hoje/ontem/semana/mês, sempre nas mesmas janelas fixas — usados pelos cards de
 * referência de /lavacao e /estacionamento, independente do período selecionado pelo usuário
 * para a tabela filtrada abaixo.
 */
export async function fetchReferencePeriodSummaries(): Promise<ReferencePeriodSummaries> {
  const periods = { today: resolvePeriod("today"), yesterday: resolvePeriod("yesterday"), week: resolvePeriod("week"), month: resolvePeriod("month") };
  const [today, yesterday, week, month] = await Promise.all([
    fetchOperationalOrders(periods.today.from, periods.today.to),
    fetchOperationalOrders(periods.yesterday.from, periods.yesterday.to),
    fetchOperationalOrders(periods.week.from, periods.week.to),
    fetchOperationalOrders(periods.month.from, periods.month.to),
  ]);

  const firstError = [today, yesterday, week, month].find((r) => r.error)?.error ?? null;

  return {
    today: computeOperationalSummary(today.orders),
    yesterday: computeOperationalSummary(yesterday.orders),
    week: computeOperationalSummary(week.orders),
    month: computeOperationalSummary(month.orders),
    jumpparkConfigured: today.jumpparkConfigured,
    error: firstError,
  };
}
