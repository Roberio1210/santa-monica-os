import "server-only";
import { jumpParkClient, JumpParkNotConfiguredError, JumpParkRequestError } from "./client";
import type {
  JumpParkFinancialReport,
  JumpParkServiceOrdersResponse,
  JumpParkServiceOrder,
  JumpParkObservations,
} from "./types";
import type { PaymentBreakdown } from "@/types/finance";
import type { PaymentMethod } from "@/types/common";
import { maskPlate, maskPhone } from "@/lib/utils/mask";
import { saoPauloDateISO } from "@/lib/utils/timezone";
import { classifyPaymentMethod } from "@/lib/utils/paymentMethod";

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
  /** Data (YYYY-MM-DD) derivada de entryDateTime, com fallback para exitDateTime — opcional para não quebrar fixtures existentes que não a definem. */
  date?: string | null;
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
 * Mapeia ordens cruas da API para o formato já mascarado/formatado usado em toda a interface —
 * extraído de `fetchTodayOperations` (Missão 26/Fase 1) para ser reaproveitado também pela
 * sincronização JumpPark → Neon (`sync.ts`), que nunca deve montar esse objeto a partir da
 * resposta HTTP crua (ver docs/jumppark-sync-strategy.md, "Preservação do payload bruto").
 * Só inclui ordens finalizadas (com saída registrada).
 */
export function mapOperationOrders(orders: JumpParkServiceOrder[]): OperationOrder[] {
  return orders
    .filter((order) => !!order.exitDateTime)
    .map((order) => {
      const services: OperationServiceItem[] = (order.services ?? []).map((item) => ({
        description: item.description ?? item.name ?? "Serviço",
        amount: Number(item.amount ?? 0),
      }));

      const dateSource = order.entryDateTime ?? order.exitDateTime;

      return {
        id: order.serviceOrderId ?? `${order.plate ?? "sem-placa"}-${order.entryDateTime ?? ""}`,
        code: order.serviceOrderCode ?? null,
        date: dateSource ? dateSource.split(" ")[0] : null,
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

/**
 * Ordens finalizadas (com saída registrada) de um dia, já mascaradas e
 * formatadas para exibição — usado pela tela "Movimentações de Hoje".
 * Nunca retorna placa ou telefone completos.
 */
export async function fetchTodayOperations(date: string): Promise<OperationOrder[]> {
  const orders = await fetchServiceOrders(date, date);
  return mapOperationOrders(orders);
}

export interface PersistableServiceOrderItem {
  description: string;
  quantity: number | null;
  amount: number;
  serviceContractId: string | null;
  commissioners: unknown | null;
}

export interface PersistableServiceOrder {
  externalId: string;
  code: string | null;
  entryTime: string | null;
  exitTime: string | null;
  orderDate: string;
  /** Null quando a ordem não tem placa na fonte — nunca o texto "Não informado" (isso é só para exibição, não para persistência/identidade). */
  plateMasked: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  clientName: string | null;
  clientPhoneMasked: string | null;
  clientEmail: string | null;
  parkingAmount: number;
  servicesAmount: number;
  totalAmount: number;
  paymentMethod: string | null;
  situation: string | null;
  operationSituationName: string | null;
  situationId: number | null;
  financialSituationId: number | null;
  discountAmount: number | null;
  discountType: string | null;
  typePrice: string | null;
  cardCode: number | null;
  staffEntryName: string | null;
  staffExitName: string | null;
  establishmentId: string | null;
  establishmentName: string | null;
  observations: JumpParkObservations | null;
  items: PersistableServiceOrderItem[];
}

function toNullableNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function toNullableInt(value: string | number | null | undefined): number | null {
  const num = toNullableNumber(value);
  return num === null ? null : Math.trunc(num);
}

function toNullableString(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  return str.length > 0 ? str : null;
}

/** `maskPlate` retorna o texto "Não informado" (pensado para exibição) — para persistência, ausência de placa deve virar `null`, nunca esse texto. */
function maskPlateForPersistence(plate?: string | null): string | null {
  if (!plate?.trim()) return null;
  return maskPlate(plate);
}

/**
 * Mapeia uma ordem crua da API para o formato completo de persistência (Missão 27 — backfill e
 * enriquecimento) — inclui todos os campos reais documentados em docs/jumppark-data-map.md, além
 * dos já usados por `mapOperationOrders`. Distinta de `mapOperationOrders` (que continua existindo
 * só para a exibição já usada em "Movimentações de Hoje") para não arriscar quebrar esse caminho já
 * testado. Nunca inventa campo: tudo que a API não retornou vira `null`.
 */
export function mapServiceOrderForPersistence(order: JumpParkServiceOrder): PersistableServiceOrder {
  const dateSource = order.entryDateTime ?? order.exitDateTime;
  const items: PersistableServiceOrderItem[] = (order.services ?? []).map((item) => ({
    description: item.description ?? item.name ?? "Serviço",
    quantity: item.quantity ?? null,
    amount: Number(item.amount ?? 0),
    serviceContractId: toNullableString(item.serviceContractId),
    commissioners: item.commissioners ?? null,
  }));

  return {
    externalId: order.serviceOrderId ?? `${order.plate ?? "sem-placa"}-${order.entryDateTime ?? ""}`,
    code: order.serviceOrderCode ?? null,
    entryTime: formatTime(order.entryDateTime),
    exitTime: formatTime(order.exitDateTime),
    orderDate: dateSource ? dateSource.split(" ")[0] : "",
    plateMasked: maskPlateForPersistence(order.plate),
    vehicleModel: order.vehicleModel ?? null,
    vehicleColor: order.vehicleColor ?? null,
    clientName: order.clientName ?? null,
    clientPhoneMasked: maskPhone(order.clientPhone),
    clientEmail: order.clientEmail ?? null,
    parkingAmount: Number(order.amount ?? 0),
    servicesAmount: Number(order.amountServices ?? 0),
    totalAmount: Number(order.totalAmount ?? 0),
    paymentMethod: order.paymentMethodName ?? null,
    situation: order.financialSituationName ?? order.operationSituationName ?? null,
    operationSituationName: order.operationSituationName ?? null,
    situationId: toNullableInt(order.situationId),
    financialSituationId: toNullableInt(order.financialSituationId),
    discountAmount: toNullableNumber(order.discountAmount),
    discountType: order.discountType ?? null,
    typePrice: order.typePrice ?? null,
    cardCode: toNullableInt(order.cardCode),
    staffEntryName: order.userName ?? null,
    staffExitName: order.userOutputName ?? null,
    establishmentId: toNullableString(order.establishmentId),
    establishmentName: order.establishmentName ?? null,
    observations: order.observations ?? null,
    items,
  };
}

export { JumpParkNotConfiguredError, JumpParkRequestError };
