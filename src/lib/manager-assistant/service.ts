import "server-only";
import { getAttendanceRepository } from "@/lib/attendance/repository-factory";
import { fetchManagerBoard } from "@/lib/attendance/service";
import { summarizeCustomerHistory } from "@/lib/attendance/history";
import { saoPauloDateISO } from "@/lib/utils/timezone";
import { getManagerAssistantRepository } from "@/lib/manager-assistant/repository-factory";
import { deriveManagerAlerts, type AlertType, type ManagerAlert } from "@/lib/manager-assistant/alerts";
import { derivePriorities, type OperationalPriority } from "@/lib/manager-assistant/priorities";
import { deriveClientAttention, type ClientAttentionEntry } from "@/lib/manager-assistant/clientAttention";
import type { CreateDiscountInput, Discount, Notification, NotificationRecipient, NotificationStatus } from "@/lib/manager-assistant/types";
import type { ServiceOrderStatus } from "@/lib/attendance/types";

/** Mesmo utilitário de `crm-intelligente/overview.ts:groupBy` — pequeno demais para justificar extrair um módulo compartilhado só por isso. */
function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key) ?? [];
    list.push(item);
    map.set(key, list);
  }
  return map;
}

/**
 * Orquestração do Assistente Operacional do Gerente — único ponto de I/O deste módulo.
 * Reaproveita o Atendimento (`fetchManagerBoard`, repositório de clientes/visitas/ordens em lote)
 * e o repositório próprio (descontos + notificações), nunca duplica dados: alertas e prioridades
 * são sempre recalculados ao vivo a partir do board real, nunca lidos de volta da tabela de
 * notificações.
 */

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Destinatário de cada tipo de alerta — segue os exemplos do enunciado (Seção 6). */
const ALERT_RECIPIENT: Record<AlertType, NotificationRecipient> = {
  execucao_atraso: "ambos",
  conferencia_atraso: "gerente",
  pronto_atraso: "gerente",
  sem_servicos: "gerente",
  sem_valor: "proprietario",
  diagnostico_pendente: "gerente",
};

export interface ManagerAlertView extends ManagerAlert {
  notificationId: string | null;
  status: NotificationStatus | null;
}

/**
 * Auditoria de Network Transfer do Neon (25/09/2026) — N+1 remanescente: antes, 1 consulta
 * `getDiagnosticByVisit` por pedido na coluna "recebido" (Q(N) = N). `saveDiagnostic` faz upsert
 * por `serviceVisitId` (constraint única, ver `attendance/postgres-repository.ts`), então nunca há
 * mais de um diagnóstico por visita — "existe diagnóstico para a visita" é exatamente equivalente
 * a "a visita aparece no resultado de uma busca em lote". Reaproveita `listDiagnosticsForVisits`
 * (método batch já criado nesta auditoria para o N+1 do Manager Assistant, `attendance/
 * repository.ts`) — nenhum método novo, nenhuma mudança de schema. Só o conteúdo de `diagnostic`
 * é descartado (nunca foi usado aqui, só a existência) — `recebidoWithoutDiagnostic` continua
 * sendo exatamente os `order`s da coluna "recebido" sem diagnóstico, na mesma ordem de antes.
 */
async function computeLiveAlerts(): Promise<{ alerts: ManagerAlert[]; activeOrders: Awaited<ReturnType<typeof fetchManagerBoard>>["columns"][number]["orders"]; recebidoWithoutDiagnosticCount: number; board: Awaited<ReturnType<typeof fetchManagerBoard>> }> {
  const attendanceRepo = getAttendanceRepository();
  const board = await fetchManagerBoard();
  const activeOrders = board.columns.flatMap((c) => c.orders);
  const recebidoOrders = board.columns.find((c) => c.status === "recebido")?.orders ?? [];

  const recebidoVisitIds = recebidoOrders.map((o) => o.visitId);
  const diagnosticsForRecebido = await attendanceRepo.listDiagnosticsForVisits(recebidoVisitIds);
  const visitIdsWithDiagnostic = new Set(diagnosticsForRecebido.map((d) => d.serviceVisitId));
  const recebidoWithoutDiagnostic = recebidoOrders.filter((order) => !visitIdsWithDiagnostic.has(order.visitId));

  const alerts = deriveManagerAlerts({ activeOrders, deliveredToday: board.deliveredToday, recebidoWithoutDiagnostic });

  return { alerts, activeOrders, recebidoWithoutDiagnosticCount: recebidoWithoutDiagnostic.length, board };
}

/** Persiste cada alerta como notificação — idempotente por `dedupeKey`, nunca duplica a mesma condição. */
async function persistAlertNotifications(alerts: ManagerAlert[]): Promise<void> {
  const assistantRepo = getManagerAssistantRepository();
  await Promise.all(
    alerts.map((alert) =>
      assistantRepo.upsertNotificationIfAbsent({
        type: alert.type,
        priority: alert.level,
        title: alert.title,
        description: alert.description,
        occurredAt: alert.occurredAt,
        sourceOrderId: alert.serviceOrderId,
        sourceCustomerId: alert.customerId,
        sourceVehicleId: alert.vehicleId,
        recipient: ALERT_RECIPIENT[alert.type],
        dedupeKey: alert.dedupeKey,
      }),
    ),
  );
}

export interface OwnerSummary {
  dateIso: string;
  atendimentosCriados: number;
  veiculosEntregues: number;
  /** Contagem ao vivo (agora), não histórica — o schema não guarda "quantos estavam abertos ao final do dia X". */
  veiculosAbertosAgora: number;
  faturamentoRegistrado: number;
  ticketMedio: number | null;
  tempoMedioMinutos: number | null;
  descontos: { count: number; totalAmount: number };
  ordensSemValor: number;
  alertasCriticos: number;
  recomendacoesTecnicas: number;
  servicosAprovados: number;
}

/** Resumo do dia — funciona para hoje ("Agora") ou qualquer dia passado ("Fechamento"), sempre recalculado a partir dos dados reais, nunca de um snapshot. */
export async function fetchOwnerSummary(dateIso: string): Promise<OwnerSummary> {
  const attendanceRepo = getAttendanceRepository();
  const assistantRepo = getManagerAssistantRepository();

  const [todaysOrders, catalog, todaysEntries, deliveredOnDate, discounts, recomendacoesTecnicas, allNotifications, activeBoardOrders] = await Promise.all([
    attendanceRepo.listServiceOrdersVisitedOnDate(dateIso),
    attendanceRepo.listServiceCatalog(),
    attendanceRepo.listOrdersInRange(dateIso, dateIso),
    attendanceRepo.listDeliveredOnDate(dateIso),
    assistantRepo.listDiscountsInRange(dateIso, dateIso),
    attendanceRepo.countRecommendationsCreatedOnDate(dateIso),
    assistantRepo.listNotifications({}),
    attendanceRepo.listBoardOrders(),
  ]);

  const servicePriceById = Object.fromEntries(catalog.filter((s) => s.defaultPrice !== null).map((s) => [s.id, s.defaultPrice as number]));
  const orderValues = todaysOrders.filter((o) => o.items.length > 0).map((o) => o.items.reduce((s, item) => s + (servicePriceById[item.serviceId] ?? 0), 0));
  const faturamentoRegistrado = round2(orderValues.reduce((s, v) => s + v, 0));
  const ticketMedio = orderValues.length > 0 ? round2(faturamentoRegistrado / orderValues.length) : null;

  const durations = deliveredOnDate.map((o) => (Date.parse(o.updatedAt) - Date.parse(o.visitCreatedAt)) / 60_000);
  const tempoMedioMinutos = durations.length > 0 ? Math.round(durations.reduce((s, m) => s + m, 0) / durations.length) : null;

  const ordensSemValor = deliveredOnDate.filter((o) => o.totalValue === 0).length;
  const servicosAprovados = todaysEntries.reduce((sum, o) => sum + o.serviceNames.length, 0);
  const alertasCriticos = allNotifications.filter((n) => n.priority === "critico" && saoPauloDateISO(new Date(n.occurredAt)) === dateIso).length;
  const discountsTotalAmount = round2(discounts.reduce((s, d) => s + d.discountAmount, 0));

  return {
    dateIso,
    atendimentosCriados: todaysEntries.length,
    veiculosEntregues: deliveredOnDate.length,
    veiculosAbertosAgora: activeBoardOrders.length,
    faturamentoRegistrado,
    ticketMedio,
    tempoMedioMinutos,
    descontos: { count: discounts.length, totalAmount: discountsTotalAmount },
    ordensSemValor,
    alertasCriticos,
    recomendacoesTecnicas,
    servicosAprovados,
  };
}

export interface DiscountsSummary {
  items: Discount[];
  count: number;
  totalAmount: number;
  percentOfRevenue: number | null;
  maxDiscount: number | null;
}

export interface ManagerAssistant {
  generatedAt: string;
  alerts: ManagerAlertView[];
  priorities: OperationalPriority[];
  clientsAttention: ClientAttentionEntry[];
  discountsToday: DiscountsSummary;
  summaryNow: OwnerSummary;
  notifications: Notification[];
}

/** Orquestrador principal de `/assistente-gerente` — sincroniza notificações e monta as 6 seções. */
export async function fetchManagerAssistant(): Promise<ManagerAssistant> {
  const attendanceRepo = getAttendanceRepository();
  const assistantRepo = getManagerAssistantRepository();
  const today = saoPauloDateISO();

  const { alerts, activeOrders, recebidoWithoutDiagnosticCount, board } = await computeLiveAlerts();
  await persistAlertNotifications(alerts);

  const notifications = await assistantRepo.listNotifications({ limit: 200 });
  const notificationByDedupeKey = new Map(notifications.map((n) => [n.dedupeKey, n]));
  const alertViews: ManagerAlertView[] = alerts.map((alert) => {
    const notification = notificationByDedupeKey.get(alert.dedupeKey) ?? null;
    return { ...alert, notificationId: notification?.id ?? null, status: notification?.status ?? null };
  });

  const countByStatus = (status: ServiceOrderStatus) => activeOrders.filter((o) => o.status === status).length;

  const priorities = derivePriorities({
    aguardandoExecucao: countByStatus("aguardando_execucao"),
    execucaoAtrasada: alerts.filter((a) => a.type === "execucao_atraso").length,
    aguardandoConferencia: countByStatus("aguardando_conferencia"),
    prontos: countByStatus("pronto_entrega"),
    diagnosticoPendente: recebidoWithoutDiagnosticCount,
    ordensSemValor: board.deliveredToday.filter((o) => o.totalValue === 0).length,
  });

  const todaysEntries = await attendanceRepo.listOrdersInRange(today, today);
  const uniqueCustomerIds = Array.from(new Set(todaysEntries.map((o) => o.customerId)));

  /**
   * Auditoria de Network Transfer do Neon (25/09/2026) — antes, cada cliente único do dia
   * disparava seu próprio `fetchCustomerSearchResult` (que sozinho já fazia 6 consultas via
   * `buildHistory`) + `listVisitsByCustomer`: N clientes = até 7×N consultas, cada uma sem nenhuma
   * janela temporal (histórico de vida inteira). Reescrito no mesmo espírito de
   * `crm-intelligente/overview.ts:listCustomerOverviews` — poucas consultas em LOTE (uma por
   * categoria de dado, nunca uma por cliente) e agrupamento em memória. `summarizeCustomerHistory`
   * (mesma função pura de sempre, `attendance/history.ts`) continua recebendo exatamente os mesmos
   * campos por cliente — só a origem dos dados mudou, nunca o cálculo.
   */
  const [customersList, catalog] = await Promise.all([attendanceRepo.getCustomersByIds(uniqueCustomerIds), attendanceRepo.listServiceCatalog()]);
  const servicePriceById = Object.fromEntries(catalog.filter((s) => s.defaultPrice !== null).map((s) => [s.id, s.defaultPrice as number]));

  const [allVehicles, allVisits] = await Promise.all([attendanceRepo.listVehiclesForCustomers(uniqueCustomerIds), attendanceRepo.listVisitsForCustomers(uniqueCustomerIds)]);
  const visitIds = allVisits.map((v) => v.id);
  const visitToCustomerId = new Map(allVisits.map((v) => [v.id, v.customerId]));

  const [allDiagnostics, allRecommendations, allOrders] = await Promise.all([
    attendanceRepo.listDiagnosticsForVisits(visitIds),
    attendanceRepo.listRecommendationsForVisits(visitIds),
    attendanceRepo.listServiceOrdersForVisits(visitIds),
  ]);

  const vehiclesByCustomer = groupBy(allVehicles, (v) => v.customerId);
  const visitsByCustomer = groupBy(allVisits, (v) => v.customerId);
  const diagnosticsByCustomer = groupBy(allDiagnostics, (d) => visitToCustomerId.get(d.serviceVisitId) ?? "");
  const recommendationsByCustomer = groupBy(allRecommendations, (r) => visitToCustomerId.get(r.serviceVisitId) ?? "");
  const ordersByCustomer = groupBy(allOrders, (o) => visitToCustomerId.get(o.serviceVisitId) ?? "");

  // `WHERE id IN (...)` (`getCustomersByIds`) não garante a mesma ordem de `uniqueCustomerIds` —
  // reordena aqui para preservar exatamente a ordem antiga (primeira aparição em `todaysEntries`),
  // nunca a ordem arbitrária que o Postgres devolver.
  const customerById = new Map(customersList.map((c) => [c.id, c]));
  const orderedCustomers = uniqueCustomerIds.map((id) => customerById.get(id)).filter((c): c is (typeof customersList)[number] => c !== undefined);

  const clientsAttention = orderedCustomers
    .map((customer) => {
      const vehicles = vehiclesByCustomer.get(customer.id) ?? [];
      const visits = visitsByCustomer.get(customer.id) ?? [];
      const history = summarizeCustomerHistory({
        customer,
        vehicles,
        visits,
        diagnostics: diagnosticsByCustomer.get(customer.id) ?? [],
        recommendations: recommendationsByCustomer.get(customer.id) ?? [],
        orders: ordersByCustomer.get(customer.id) ?? [],
        servicePriceById,
      });
      return deriveClientAttention({ customer, vehicles, history, visitCount: visits.length });
    })
    .filter((c): c is ClientAttentionEntry => c !== null);

  const summaryNow = await fetchOwnerSummary(today);
  const discounts = summaryNow.descontos;
  const discountItems = await assistantRepo.listDiscountsInRange(today, today);
  const percentOfRevenue = summaryNow.faturamentoRegistrado > 0 ? round2((discounts.totalAmount / summaryNow.faturamentoRegistrado) * 100) : null;
  const maxDiscount = discountItems.length > 0 ? Math.max(...discountItems.map((d) => d.discountAmount)) : null;

  return {
    generatedAt: new Date().toISOString(),
    alerts: alertViews,
    priorities,
    clientsAttention,
    discountsToday: { items: discountItems, count: discounts.count, totalAmount: discounts.totalAmount, percentOfRevenue, maxDiscount },
    summaryNow,
    notifications,
  };
}

/** Desconto registrado sem aprovação prévia — o proprietário só é informado depois, via notificação. */
export async function registerDiscount(input: CreateDiscountInput): Promise<Discount> {
  if (input.finalValue >= input.originalValue) {
    throw new Error("O valor final precisa ser menor que o valor original para registrar um desconto.");
  }
  const assistantRepo = getManagerAssistantRepository();
  const discount = await assistantRepo.createDiscount(input);

  await assistantRepo.upsertNotificationIfAbsent({
    type: "desconto_concedido",
    priority: "informativo",
    title: "Desconto concedido",
    description: `${discount.discountPercent}% de desconto (R$ ${discount.discountAmount.toFixed(2)}) — ${input.appliedBy}.`,
    occurredAt: discount.createdAt,
    sourceOrderId: discount.serviceOrderId,
    recipient: "proprietario",
    dedupeKey: `desconto_concedido:${discount.id}`,
  });

  return discount;
}

export async function markNotificationSeen(notificationId: string, status: NotificationStatus = "vista"): Promise<Notification> {
  return getManagerAssistantRepository().markNotificationStatus(notificationId, status);
}

export interface OwnerAttentionSnapshot {
  criticalAlerts: number;
  discountsToday: { count: number; totalAmount: number };
  ordersWithoutValue: number;
  overdueInExecution: number;
  readyForPickup: number;
}

/**
 * Versão enxuta de `fetchManagerAssistant` para o bloco "Precisa da sua atenção" da Central de
 * Operações — só os 5 números do enunciado, sem o custo de `clientsAttention` (que faz uma
 * consulta por cliente). Ainda persiste os alertas como notificação, mantendo a mesma
 * idempotência.
 */
export async function fetchOwnerAttentionSnapshot(): Promise<OwnerAttentionSnapshot> {
  const assistantRepo = getManagerAssistantRepository();
  const today = saoPauloDateISO();
  const { alerts, board } = await computeLiveAlerts();
  await persistAlertNotifications(alerts);
  const discounts = await assistantRepo.listDiscountsInRange(today, today);

  return {
    criticalAlerts: alerts.filter((a) => a.level === "critico").length,
    discountsToday: { count: discounts.length, totalAmount: round2(discounts.reduce((s, d) => s + d.discountAmount, 0)) },
    ordersWithoutValue: alerts.filter((a) => a.type === "sem_valor").length,
    overdueInExecution: alerts.filter((a) => a.type === "execucao_atraso").length,
    readyForPickup: board.columns.find((c) => c.status === "pronto_entrega")?.orders.length ?? 0,
  };
}
