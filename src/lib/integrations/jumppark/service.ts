import "server-only";
import { jumpParkClient, JumpParkNotConfiguredError, JumpParkRequestError } from "./client";
import type {
  JumpParkFinancialReport,
  JumpParkServiceOrdersResponse,
  JumpParkServiceOrder,
} from "./types";
import type { PaymentBreakdown } from "@/types/finance";
import type { PaymentMethod } from "@/types/common";

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

/** Espelha `fetch_jumppark_diario` do script Python de referência. */
export async function fetchDailyFinancial(date: string): Promise<JumpParkDailyFinancial> {
  const report = await jumpParkClient.request<JumpParkFinancialReport>("/reports/financial", {
    startDate: date,
    endDate: date,
  });

  const services = report.data?.services ?? {};
  const total = Number(services.totalAmount ?? 0);
  const vehicles = Number(services.total ?? 0);

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

export { JumpParkNotConfiguredError, JumpParkRequestError };
