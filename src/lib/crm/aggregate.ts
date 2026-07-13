/**
 * Agregação pura (sem I/O) do CRM: recebe ordens já buscadas do JumpPark e itens de Contas a
 * Receber já buscados, e deriva clientes, veículos, timeline, financeiro, status e sugestões —
 * tudo calculado ao vivo, nada persistido, nada inventado.
 */
import type { JumpParkServiceOrder } from "@/lib/integrations/jumppark";
import type { AccountsReceivableView } from "@/lib/finance/types";
import { maskPhone, maskPlate } from "@/lib/utils/mask";
import { formatDateBR } from "@/lib/utils/format";
import { buildWhatsAppNumber, identityKey, normalizeName, normalizePhone, normalizePlate, slugifyCustomerId } from "./normalize";
import type {
  CrmCustomer,
  CrmFinancialItem,
  CrmFinancialSummary,
  CrmOpportunity,
  CrmRecommendation,
  CrmServiceSummary,
  CrmTimelineEntry,
  CrmVehicleSummary,
  CustomerStatus,
} from "./types";

interface RawVisit {
  orderId: string;
  date: string;
  time: string | null;
  plate: string | null;
  plateMasked: string;
  vehicleModel: string;
  color: string | null;
  services: { description: string; amount: number }[];
  totalAmount: number;
  paymentMethod: string;
  situation: string;
}

interface CustomerGroup {
  name: string;
  phone: string | null;
  visits: RawVisit[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dateOnly(dateTime?: string): string | null {
  if (!dateTime) return null;
  return dateTime.slice(0, 10);
}

function timeOnly(dateTime?: string): string | null {
  if (!dateTime) return null;
  const time = dateTime.split(" ")[1];
  return time ? time.slice(0, 5) : null;
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00.000Z`).getTime();
  const to = new Date(`${toIso}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / 86_400_000);
}

function groupOrdersByCustomer(orders: JumpParkServiceOrder[]): Map<string, CustomerGroup> {
  const groups = new Map<string, CustomerGroup>();

  for (const order of orders) {
    if (!order.exitDateTime) continue; // só atendimentos concluídos contam como visita
    const key = identityKey(order.clientPhone, order.clientName);
    if (!key) continue; // sem telefone e sem nome — não há cliente para atribuir

    const date = dateOnly(order.entryDateTime) ?? dateOnly(order.exitDateTime);
    if (!date) continue;

    const services = (order.services ?? []).map((s) => ({
      description: s.description ?? s.name ?? "Serviço",
      amount: Number(s.amount ?? 0),
    }));

    const visit: RawVisit = {
      orderId: order.serviceOrderId ?? `${order.plate ?? "sem-placa"}-${order.entryDateTime ?? ""}`,
      date,
      time: timeOnly(order.entryDateTime),
      plate: normalizePlate(order.plate),
      plateMasked: maskPlate(order.plate),
      vehicleModel: order.vehicleModel ?? "Não informado",
      color: order.vehicleColor ?? null,
      services,
      totalAmount: Number(order.totalAmount ?? Number(order.amount ?? 0) + Number(order.amountServices ?? 0)),
      paymentMethod: order.paymentMethodName ?? "Não informado",
      situation: order.financialSituationName ?? order.operationSituationName ?? "Não informado",
    };

    const normalizedName = normalizeName(order.clientName);
    const normalizedPhone = normalizePhone(order.clientPhone);
    const existing = groups.get(key);

    if (existing) {
      existing.visits.push(visit);
      if (normalizedName) existing.name = normalizedName;
      if (normalizedPhone) existing.phone = normalizedPhone;
    } else {
      groups.set(key, { name: normalizedName ?? "Cliente sem nome", phone: normalizedPhone, visits: [visit] });
    }
  }

  return groups;
}

/** Novo/Ativo/VIP/Em risco/Perdido — só a partir de contagens reais, nenhum limite monetário inventado. */
export function computeStatus(visitCount: number, daysSinceLastVisit: number | null): { status: CustomerStatus; reason: string } {
  if (daysSinceLastVisit === null) {
    return { status: "novo", reason: "Sem data de última visita conhecida." };
  }
  if (daysSinceLastVisit > 90) {
    return { status: "perdido", reason: `Sem atendimento há ${daysSinceLastVisit} dias.` };
  }
  if (daysSinceLastVisit > 45) {
    return { status: "em_risco", reason: `Sem atendimento há ${daysSinceLastVisit} dias.` };
  }
  if (visitCount >= 5) {
    return { status: "vip", reason: `${visitCount} atendimentos conhecidos — última visita há ${daysSinceLastVisit} dia(s).` };
  }
  if (visitCount === 1) {
    return { status: "novo", reason: `Primeiro atendimento conhecido há ${daysSinceLastVisit} dia(s).` };
  }
  return { status: "ativo", reason: `${visitCount} atendimentos conhecidos — última visita há ${daysSinceLastVisit} dia(s).` };
}

/** Intervalo médio (dias) entre visitas em datas distintas — null quando há menos de 2 datas. */
export function computeAverageInterval(visitDates: string[]): number | null {
  const distinct = Array.from(new Set(visitDates)).sort();
  if (distinct.length < 2) return null;
  let totalGap = 0;
  for (let i = 1; i < distinct.length; i++) {
    totalGap += daysBetween(distinct[i - 1], distinct[i]);
  }
  return Math.round(totalGap / (distinct.length - 1));
}

function computeTopServices(visits: RawVisit[], limit = 5): CrmServiceSummary[] {
  const map = new Map<string, { count: number; totalAmount: number }>();
  for (const visit of visits) {
    for (const service of visit.services) {
      const current = map.get(service.description) ?? { count: 0, totalAmount: 0 };
      current.count += 1;
      current.totalAmount = round2(current.totalAmount + service.amount);
      map.set(service.description, current);
    }
  }
  return Array.from(map.entries())
    .map(([description, v]) => ({ description, ...v }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, limit);
}

function computeVehicles(visits: RawVisit[]): CrmVehicleSummary[] {
  const map = new Map<string, RawVisit[]>();
  for (const visit of visits) {
    const key = visit.plate ?? `model:${visit.vehicleModel}`;
    const list = map.get(key) ?? [];
    list.push(visit);
    map.set(key, list);
  }
  return Array.from(map.values())
    .map((list) => {
      const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date));
      const totalSpent = round2(list.reduce((sum, v) => sum + v.totalAmount, 0));
      const recentServices = Array.from(new Set(sorted.slice(0, 3).flatMap((v) => v.services.map((s) => s.description))));
      return {
        plateMasked: sorted[0].plateMasked,
        model: sorted[0].vehicleModel,
        color: sorted.find((v) => v.color)?.color ?? null,
        visitCount: list.length,
        totalSpent,
        lastVisit: sorted[0].date,
        recentServices,
      };
    })
    .sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""));
}

function computeTimeline(visits: RawVisit[]): CrmTimelineEntry[] {
  return [...visits]
    .sort((a, b) => `${b.date}${b.time ?? ""}`.localeCompare(`${a.date}${a.time ?? ""}`))
    .map((v) => ({
      orderId: v.orderId,
      date: v.date,
      time: v.time,
      vehicleModel: v.vehicleModel,
      plateMasked: v.plateMasked,
      services: v.services.map((s) => s.description),
      amount: v.totalAmount,
      paymentMethod: v.paymentMethod,
      situation: v.situation,
    }));
}

/**
 * Correspondência apenas por nome (sem FK real disponível sem migration) — melhor esforço,
 * sempre sinalizado como tal (`matched`) para nunca ser confundido com um vínculo garantido.
 */
function computeFinancial(name: string, arItems: AccountsReceivableView[]): CrmFinancialSummary {
  const normalized = name.trim().toLowerCase();
  const matches = arItems.filter((item) => item.partyName.trim().toLowerCase() === normalized);
  if (matches.length === 0) {
    return { matched: false, items: [], totalOpen: 0, totalOverdue: 0, totalReceived: 0 };
  }

  const items: CrmFinancialItem[] = matches
    .map((m) => ({
      id: m.id,
      description: m.description,
      dueDate: m.dueDate,
      expectedAmount: m.expectedAmount,
      receivedAmount: m.receivedAmount,
      outstandingAmount: m.outstandingAmount,
      status: m.computedStatus,
      receivedAt: m.receivedAt,
      paymentMethod: m.paymentMethod,
    }))
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));

  return {
    matched: true,
    items,
    totalOpen: round2(matches.filter((m) => m.outstandingAmount > 0).reduce((s, m) => s + m.outstandingAmount, 0)),
    totalOverdue: round2(matches.filter((m) => m.computedStatus === "overdue").reduce((s, m) => s + m.outstandingAmount, 0)),
    totalReceived: round2(matches.reduce((s, m) => s + m.receivedAmount, 0)),
  };
}

function buildOpportunities(status: CustomerStatus, daysSinceLastVisit: number | null, averageIntervalDays: number | null): CrmOpportunity[] {
  if (daysSinceLastVisit === null) return [];

  if (status === "perdido") {
    return [
      {
        reason: `Última visita há ${daysSinceLastVisit} dias — acima de 90 dias sem retorno.`,
        suggestedAction: "Considerar contato de reativação.",
      },
    ];
  }

  if (status === "em_risco") {
    const intervalNote = averageIntervalDays !== null ? ` Intervalo médio entre visitas: ${averageIntervalDays} dias.` : "";
    return [
      {
        reason: `Última visita há ${daysSinceLastVisit} dias.${intervalNote}`,
        suggestedAction: "Cliente passou do prazo usual de retorno — bom momento para contato.",
      },
    ];
  }

  if (averageIntervalDays !== null && daysSinceLastVisit > averageIntervalDays) {
    return [
      {
        reason: `Já se passaram ${daysSinceLastVisit} dias — acima do intervalo médio de ${averageIntervalDays} dias entre visitas.`,
        suggestedAction: "Cliente pode estar pronto para um novo atendimento.",
      },
    ];
  }

  return [];
}

function buildRecommendations(topServices: CrmServiceSummary[], timeline: CrmTimelineEntry[]): CrmRecommendation[] {
  const recommendations: CrmRecommendation[] = [];

  if (topServices[0]) {
    recommendations.push({
      title: `Oferecer ${topServices[0].description}`,
      reason: `Serviço mais realizado por este cliente (${topServices[0].count}x).`,
    });
  }

  const vitrificacao = timeline.find((entry) => entry.services.some((s) => s.toLowerCase().includes("vitrifica")));
  if (vitrificacao) {
    recommendations.push({
      title: "Renovação de vitrificação",
      reason: `Vitrificação registrada em ${formatDateBR(vitrificacao.date)}.`,
    });
  }

  return recommendations;
}

function buildWhatsAppMessage(name: string, vehicleModel: string | null): string {
  const vehicle = vehicleModel ?? "veículo";
  return `Olá, ${name}! Tudo bem? Passando para saber como está o seu ${vehicle}. Já faz algum tempo desde o último atendimento conosco. Caso queira, podemos verificar um horário para cuidar dele novamente.`;
}

export function buildCrmCustomers(orders: JumpParkServiceOrder[], arItems: AccountsReceivableView[], asOfDate: string): CrmCustomer[] {
  const groups = groupOrdersByCustomer(orders);
  const customers: CrmCustomer[] = [];

  for (const [key, group] of groups) {
    const visits = [...group.visits].sort((a, b) => a.date.localeCompare(b.date));
    const dates = visits.map((v) => v.date);
    const firstVisit = dates[0] ?? null;
    const lastVisit = dates[dates.length - 1] ?? null;
    const daysSinceLastVisit = lastVisit ? daysBetween(lastVisit, asOfDate) : null;
    const visitCount = visits.length;
    const totalSpent = round2(visits.reduce((sum, v) => sum + v.totalAmount, 0));
    const averageTicket = visitCount > 0 ? round2(totalSpent / visitCount) : 0;
    const averageIntervalDays = computeAverageInterval(dates);
    const { status, reason } = computeStatus(visitCount, daysSinceLastVisit);
    const topServices = computeTopServices(visits);
    const vehicles = computeVehicles(visits);
    const timeline = computeTimeline(visits);
    const financial = computeFinancial(group.name, arItems);
    const opportunities = buildOpportunities(status, daysSinceLastVisit, averageIntervalDays);
    const recommendations = buildRecommendations(topServices, timeline);

    const phoneMasked = group.phone ? maskPhone(group.phone) : null;
    const whatsappUrl = group.phone
      ? `https://wa.me/${buildWhatsAppNumber(group.phone)}?text=${encodeURIComponent(buildWhatsAppMessage(group.name, vehicles[0]?.model ?? null))}`
      : null;

    customers.push({
      id: slugifyCustomerId(key),
      name: group.name,
      phoneMasked,
      hasPhone: Boolean(group.phone),
      whatsappUrl,
      status,
      statusReason: reason,
      firstVisit,
      lastVisit,
      daysSinceLastVisit,
      visitCount,
      totalSpent,
      averageTicket,
      averageIntervalDays,
      topServices,
      vehicles,
      timeline,
      financial,
      opportunities,
      recommendations,
    });
  }

  return customers.sort((a, b) => (b.lastVisit ?? "").localeCompare(a.lastVisit ?? ""));
}
