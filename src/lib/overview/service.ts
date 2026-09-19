import "server-only";
import { getPlanningRepository } from "@/lib/planning/repository-factory";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { getStonePersistenceRepository } from "@/lib/integrations/stone/persistence/repository-factory";
import { fetchDreReport } from "@/lib/finance/service";
import { toAccountsReceivableView, toAccountsPayableView } from "@/lib/finance/status";
import { OCCUPYING_STATUSES } from "@/lib/planning/types";
import { saoPauloDateISO, type PeriodRange } from "@/lib/utils/timezone";
import { buildAppointmentsSection, buildCapacitySection, buildFinanceSection, buildOverviewAlerts, buildServicesSection, filterPayableDueInRange, filterReceivableDueInRange } from "@/lib/overview/compute";
import type { OperationalOverview, OverviewAppointmentsSection, OverviewCapacitySection, OverviewFinanceSection, OverviewRevenueSection, OverviewServicesSection, OverviewStoneSection } from "@/lib/overview/types";

/**
 * Missão 82 (VG1) — camada agregadora própria da Visão Geral. Único ponto que a página consulta;
 * nunca dezenas de queries independentes no componente. Cada domínio é buscado em paralelo
 * (Promise.all) e cada um pode falhar/ficar indisponível sem derrubar os demais (Parte Q).
 *
 * Nunca substitui "saldo Stone" por soma de vendas/recebíveis, nunca estima carros no pátio a
 * partir de dado que não representa presença física — ver Missão 81A (auditoria) para a
 * justificativa de cada limitação abaixo.
 */
export async function getOperationalOverview(period: PeriodRange): Promise<OperationalOverview> {
  const todayIso = saoPauloDateISO();

  // Missão 82, Parte Q — cada domínio é isolado: uma falha (ex.: Stone fora do ar) nunca derruba
  // os demais nem vira um zero silencioso — vira uma seção "unavailable" com o motivo, só para
  // aquele domínio. `Promise.allSettled` (via os catches abaixo) preserva o paralelismo.
  const [revenue, appointmentsResult, finance, stone] = await Promise.all([
    fetchRevenueSection(period).catch((error) => withUnavailableRevenue(error)),
    fetchAppointmentsAndCapacity(period).catch((error) => withUnavailableAppointments(error)),
    fetchFinanceSection(period).catch((error) => withUnavailableFinance(error)),
    fetchStoneSection(period).catch((error) => withUnavailableStone(error)),
  ]);

  const { appointments, services, capacity } = appointmentsResult;

  const alerts = buildOverviewAlerts({ todayIso, finance, appointments, capacity, stone, revenue });

  return {
    period,
    metadata: { generatedAt: new Date().toISOString(), timezone: "America/Sao_Paulo" },
    revenue,
    appointments,
    services,
    capacity,
    finance,
    stone,
    yard: {
      status: "unavailable",
      message: "Controle em tempo real do pátio ainda não disponível.",
      detail: "Será ativado com o novo controle de entrada e saída do Santa Monica OS.",
    },
    alerts,
  };
}

async function fetchRevenueSection(period: PeriodRange): Promise<OverviewRevenueSection> {
  const [competencia, caixa] = await Promise.all([
    fetchDreReport("competencia", period.from, period.to, "consolidado"),
    fetchDreReport("caixa", period.from, period.to, "consolidado"),
  ]);

  const financeRepo = getFinanceRepository();
  const receivable = await financeRepo.listAccountsReceivable();
  const asOfToday = saoPauloDateISO();
  const previstoItems = filterReceivableDueInRange(
    receivable.map((r) => toAccountsReceivableView(r, asOfToday)),
    period.from,
    period.to,
  );

  return {
    status: competencia.receitaBruta === null && caixa.receitaBruta === null ? "unavailable" : competencia.receitaBruta === null || caixa.receitaBruta === null ? "partial" : "ok",
    realizado: competencia.receitaBruta,
    realizadoIndisponivelMotivo: competencia.receitaBrutaIndisponivelMotivo,
    realizadoEstetica: competencia.receitaBrutaEstetica.amount,
    realizadoEstacionamento: competencia.receitaBrutaEstacionamento.amount,
    recebido: caixa.receitaBruta,
    recebidoIndisponivelMotivo: caixa.receitaBrutaIndisponivelMotivo,
    previsto: previstoItems.reduce((sum, i) => sum + i.amount, 0),
  };
}

async function fetchAppointmentsAndCapacity(period: PeriodRange) {
  const planningRepo = getPlanningRepository();
  const rows = await planningRepo.listAppointmentsInRange(period.from, period.to);

  const appointments = buildAppointmentsSection(rows);
  const services = buildServicesSection(rows);

  const capacityConfig = period.from === period.to ? await planningRepo.getActiveCapacityConfig() : null;
  const occupying = rows.filter((r) => (OCCUPYING_STATUSES as readonly string[]).includes(r.status)).map((r) => ({ expectedDurationMinutes: r.expectedDurationMinutes }));
  const capacity = buildCapacitySection(period, capacityConfig, occupying);

  return { appointments, services, capacity };
}

async function fetchFinanceSection(period: PeriodRange) {
  const financeRepo = getFinanceRepository();
  const [receivable, payable] = await Promise.all([financeRepo.listAccountsReceivable(), financeRepo.listAccountsPayable()]);
  const asOfToday = saoPauloDateISO();

  const receivableItems = filterReceivableDueInRange(
    receivable.map((r) => toAccountsReceivableView(r, asOfToday)),
    period.from,
    period.to,
  );
  const payableItems = filterPayableDueInRange(
    payable.map((p) => toAccountsPayableView(p, asOfToday)),
    period.from,
    period.to,
  );

  return buildFinanceSection(receivableItems, payableItems);
}

async function fetchStoneSection(period: PeriodRange): Promise<OverviewStoneSection> {
  const repo = getStonePersistenceRepository();
  const [captured, settled, lastRun] = await Promise.all([
    repo.listNormalizedTransactionsByCapturedDateRange(period.from, period.to),
    repo.listNormalizedTransactionsBySettledDateRange(period.from, period.to),
    repo.getLatestSucceededImportRun(),
  ]);

  const settledAmount = settled.reduce((sum, t) => sum + (t.settledAmount ?? 0), 0);

  return {
    // "partial" quando o período inclui o próprio dia de hoje — a liquidação do dia corrente
    // costuma chegar só D+1 ou mais (Missões 68-77), então o número de hoje é sempre incompleto.
    status: period.to >= saoPauloDateISO() ? "partial" : "ok",
    saldoDisponivel: null,
    saldoIndisponivelMotivo: "A integração atual não fornece saldo bancário em tempo real.",
    vendasNoPeriodo: { count: captured.length, netAmount: captured.reduce((sum, t) => sum + t.netAmount, 0) },
    liquidacoesNoPeriodo: { count: settled.length, settledAmount },
    ultimaSincronizacao: lastRun?.finishedAt ?? null,
  };
}

/**
 * Fallbacks por domínio (Missão 82, Parte Q) — nunca lançam, sempre devolvem uma seção
 * "unavailable" honesta com o motivo real do erro (nunca escondido, nunca virado zero).
 */
function withUnavailableRevenue(error: unknown): OverviewRevenueSection {
  console.error("[visao-geral] falha ao calcular faturamento:", error);
  const motivo = "Erro ao calcular faturamento neste período.";
  return { status: "unavailable", realizado: null, realizadoIndisponivelMotivo: motivo, realizadoEstetica: 0, realizadoEstacionamento: 0, recebido: null, recebidoIndisponivelMotivo: motivo, previsto: 0 };
}

function withUnavailableAppointments(error: unknown): { appointments: OverviewAppointmentsSection; services: OverviewServicesSection; capacity: OverviewCapacitySection } {
  console.error("[visao-geral] falha ao carregar agenda/capacidade:", error);
  return {
    appointments: { status: "unavailable", totalCount: 0, countByStatus: {}, byDay: [] },
    services: { status: "unavailable", byService: [] },
    capacity: { status: "unavailable", applicable: false, reason: "Erro ao carregar a agenda deste período." },
  };
}

function withUnavailableFinance(error: unknown): OverviewFinanceSection {
  console.error("[visao-geral] falha ao carregar contas a receber/pagar:", error);
  return { status: "unavailable", receivable: { totalAmount: 0, items: [] }, payable: { totalAmount: 0, items: [] } };
}

function withUnavailableStone(error: unknown): OverviewStoneSection {
  console.error("[visao-geral] falha ao carregar dados Stone:", error);
  return {
    status: "unavailable",
    saldoDisponivel: null,
    saldoIndisponivelMotivo: "A integração atual não fornece saldo bancário em tempo real.",
    vendasNoPeriodo: { count: 0, netAmount: 0 },
    liquidacoesNoPeriodo: { count: 0, settledAmount: 0 },
    ultimaSincronizacao: null,
  };
}
