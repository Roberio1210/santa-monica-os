import { classifyServiceCategory, mapJumpParkOrderToOperationalOrder, type JumpParkOrderInput } from "@/lib/domain/operational";
import type { PaymentMethod } from "@/types/common";
import { unmaskForOperationalView } from "@/lib/painel-gerencial/operational-view";
import type { CustomerAggregate, ManagementIndicators, ManagementOrderRow, ServiceAggregate } from "@/lib/painel-gerencial/types";

/**
 * Agregações puras sobre ordens da JumpPark, reaproveitando o mapper de domínio do Sprint 10
 * (`mapJumpParkOrderToOperationalOrder`) para categoria de serviço, forma de pagamento, bruto,
 * desconto e líquido — nunca reimplementa essa lógica. Nunca faz I/O; toda busca real acontece em
 * `service.ts`.
 */

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  pix: "Pix",
  outro: "Outro",
};

/** Regra idêntica à já usada em `finance/classification.ts` (mirrorada, não importada, por isolamento do read model). */
const PENDING_SITUATION_PATTERN = /pendente|em aberto|pós.?pago|pos.?pago/i;

function dateOnly(dateTime?: string | null): string | null {
  if (!dateTime) return null;
  return dateTime.slice(0, 10);
}

function timeOnly(dateTime?: string | null): string | null {
  if (!dateTime) return null;
  const time = dateTime.split(" ")[1];
  return time ? time.slice(0, 5) : null;
}

function readMetadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Converte ordens finalizadas (com saída registrada) da JumpPark em linhas do Painel Gerencial.
 * Placa e telefone saem SEM máscara (`unmaskForOperationalView`) — apresentação operacional
 * autorizada, restrita à área autenticada (ver operational-view.ts). Ordens sem saída são
 * excluídas, mesmo critério já usado em `/movimentacoes` e `/lavacao`.
 */
export function buildManagementOrderRows(rawOrders: JumpParkOrderInput[]): ManagementOrderRow[] {
  return rawOrders
    .filter((order) => !!order.exitDateTime)
    .map((order) => {
      const mapped = mapJumpParkOrderToOperationalOrder(order);
      const services = order.services ?? [];
      const serviceLines = services.map((item) => {
        const description = item.description ?? item.name ?? "Serviço";
        return {
          description,
          category: classifyServiceCategory([description]),
          amount: Number(item.amount ?? 0),
        };
      });

      const paymentMethodCategory = (readMetadataString(mapped.metadata, "paymentMethodCategory") ?? "outro") as PaymentMethod;
      const situation = order.financialSituationName ?? order.operationSituationName ?? "Não informado";

      return {
        externalId: mapped.externalId,
        date: dateOnly(order.exitDateTime) ?? dateOnly(order.entryDateTime) ?? "",
        entryTime: timeOnly(order.entryDateTime),
        exitTime: timeOnly(order.exitDateTime),
        customerId: mapped.customerId,
        customerName: unmaskForOperationalView(order.clientName),
        customerPhone: unmaskForOperationalView(order.clientPhone),
        vehicleId: mapped.vehicleId,
        vehicleModel: order.vehicleModel ?? "Não informado",
        licensePlate: unmaskForOperationalView(order.plate),
        serviceLines,
        serviceCategory: mapped.serviceCategory,
        employeeName: readMetadataString(mapped.metadata, "exitOperator") ?? readMetadataString(mapped.metadata, "entryOperator"),
        paymentMethodLabel: PAYMENT_LABELS[paymentMethodCategory] ?? PAYMENT_LABELS.outro,
        paymentMethodCategory,
        grossAmount: mapped.grossAmount,
        discountAmount: mapped.discountAmount,
        netAmount: mapped.netAmount,
        situation,
        paymentStatus: mapped.paymentStatus,
        source: "JumpPark",
      } satisfies ManagementOrderRow;
    })
    .sort((a, b) => `${b.date}${b.exitTime ?? ""}`.localeCompare(`${a.date}${a.exitTime ?? ""}`));
}

export function computeManagementIndicators(rows: ManagementOrderRow[]): ManagementIndicators {
  const grossRevenue = round2(rows.reduce((sum, r) => sum + r.grossAmount, 0));
  const discountTotal = round2(rows.reduce((sum, r) => sum + r.discountAmount, 0));
  const netRevenue = round2(rows.reduce((sum, r) => sum + r.netAmount, 0));
  const ordersCount = rows.length;
  const vehiclesCount = new Set(rows.map((r) => r.vehicleId).filter((id): id is string => !!id)).size;
  const customersCount = new Set(rows.map((r) => r.customerId).filter((id): id is string => !!id)).size;
  const receivedAmount = round2(rows.filter((r) => r.paymentStatus === "paid").reduce((sum, r) => sum + r.netAmount, 0));
  const pendingAmount = round2(rows.filter((r) => PENDING_SITUATION_PATTERN.test(r.situation)).reduce((sum, r) => sum + r.netAmount, 0));

  return {
    grossRevenue,
    discountTotal,
    netRevenue,
    ordersCount,
    vehiclesCount,
    customersCount,
    averageTicket: ordersCount > 0 ? round2(netRevenue / ordersCount) : null,
    receivedAmount,
    pendingAmount,
  };
}

/** Um agregado por `customerId` real (identidade derivada de telefone/nome) — nunca inclui atendimento sem cliente identificado. */
export function buildCustomerAggregates(rows: ManagementOrderRow[]): CustomerAggregate[] {
  const groups = new Map<string, ManagementOrderRow[]>();
  for (const row of rows) {
    if (!row.customerId) continue;
    const list = groups.get(row.customerId) ?? [];
    list.push(row);
    groups.set(row.customerId, list);
  }

  const aggregates: CustomerAggregate[] = [];
  for (const [customerId, group] of groups) {
    const sorted = [...group].sort((a, b) => `${b.date}${b.exitTime ?? ""}`.localeCompare(`${a.date}${a.exitTime ?? ""}`));
    const mostRecent = sorted[0];
    const totalSpent = round2(group.reduce((sum, r) => sum + r.netAmount, 0));
    const services = Array.from(new Set(group.flatMap((r) => r.serviceLines.map((s) => s.description))));

    aggregates.push({
      customerId,
      name: mostRecent.customerName,
      phone: mostRecent.customerPhone,
      vehicleModel: mostRecent.vehicleModel,
      licensePlate: mostRecent.licensePlate,
      visits: group.length,
      totalSpent,
      averageTicket: round2(totalSpent / group.length),
      lastVisit: mostRecent.date,
      services,
    });
  }
  return aggregates;
}

export function rankCustomersBySpend(customers: CustomerAggregate[]): CustomerAggregate[] {
  return [...customers].sort((a, b) => b.totalSpent - a.totalSpent);
}

export function rankCustomersByVisits(customers: CustomerAggregate[]): CustomerAggregate[] {
  return [...customers].sort((a, b) => b.visits - a.visits);
}

/**
 * Um agregado por descrição de serviço (linha individual, não a ordem inteira) — garante que
 * Martelinho nunca seja absorvido por Lavação, e que nenhum serviço seja descartado
 * silenciosamente. Desconto/líquido por serviço são alocados proporcionalmente ao valor bruto da
 * linha dentro da ordem (a JumpPark só informa desconto no nível da ordem, nunca por serviço) —
 * quando o desconto da ordem é 0 (caso observado em toda amostra real até hoje), a alocação
 * resulta em 0 sem nenhuma suposição adicional.
 */
export function buildServiceAggregates(rows: ManagementOrderRow[]): ServiceAggregate[] {
  interface Acc {
    category: string;
    quantity: number;
    grossAmount: number;
    discountAmount: number;
  }
  const groups = new Map<string, Acc>();

  for (const row of rows) {
    const orderGross = row.serviceLines.reduce((sum, s) => sum + s.amount, 0);
    for (const line of row.serviceLines) {
      const share = orderGross > 0 ? line.amount / orderGross : 0;
      const allocatedDiscount = round2(row.discountAmount * share);
      const acc = groups.get(line.description) ?? { category: line.category, quantity: 0, grossAmount: 0, discountAmount: 0 };
      acc.quantity += 1;
      acc.grossAmount = round2(acc.grossAmount + line.amount);
      acc.discountAmount = round2(acc.discountAmount + allocatedDiscount);
      groups.set(line.description, acc);
    }
  }

  const totalGross = round2(Array.from(groups.values()).reduce((sum, a) => sum + a.grossAmount, 0));

  const aggregates: ServiceAggregate[] = Array.from(groups.entries()).map(([description, acc]) => {
    const netAmount = round2(acc.grossAmount - acc.discountAmount);
    return {
      description,
      category: acc.category as ServiceAggregate["category"],
      quantity: acc.quantity,
      grossAmount: acc.grossAmount,
      discountAmount: acc.discountAmount,
      netAmount,
      revenueShare: totalGross > 0 ? round2((acc.grossAmount / totalGross) * 100) : 0,
      averageTicket: acc.quantity > 0 ? round2(acc.grossAmount / acc.quantity) : 0,
    };
  });

  return aggregates.sort((a, b) => b.grossAmount - a.grossAmount);
}

/** Faturamento líquido por dia (YYYY-MM-DD) — usado pela análise de "dias abaixo da média" em insights.ts. */
export function groupNetRevenueByDay(rows: ManagementOrderRow[]): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    if (!row.date) continue;
    byDay.set(row.date, round2((byDay.get(row.date) ?? 0) + row.netAmount));
  }
  return byDay;
}
