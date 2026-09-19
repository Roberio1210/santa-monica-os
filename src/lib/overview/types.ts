import type { PeriodRange } from "@/lib/utils/timezone";

/**
 * Missão 82 (VG1) — DTO da Visão Geral operacional. Cada domínio carrega seu próprio status de
 * disponibilidade — nunca um status único global: uma fonte fora do ar (ex.: Stone) nunca deve
 * "zerar" ou esconder as demais seções (Parte Q da missão).
 *
 * "ok": dado real e completo para o período.
 * "partial": dado real mas com alguma limitação conhecida (ex.: liquidação Stone do próprio dia
 *   ainda incompleta, capacidade não aplicável a período com mais de 1 dia).
 * "unavailable": a fonte atual não permite calcular isto com segurança — nunca um valor
 *   estimado/zerado no lugar (ex.: saldo Stone, carros no pátio).
 */
export type OverviewDataStatus = "ok" | "partial" | "unavailable";

export interface OverviewRevenueSection {
  status: OverviewDataStatus;
  /** DRE regime "competência" — serviço/venda reconhecido no período, nunca confundido com dinheiro recebido. */
  realizado: number | null;
  realizadoIndisponivelMotivo: string | null;
  realizadoEstetica: number;
  realizadoEstacionamento: number;
  /** DRE regime "caixa" — dinheiro efetivamente recebido no período. */
  recebido: number | null;
  recebidoIndisponivelMotivo: string | null;
  /** Soma de accounts_receivable com vencimento no período e ainda em aberto — nunca uma projeção de agenda. */
  previsto: number;
}

export interface OverviewAppointmentDayGroup {
  dateIso: string;
  items: {
    id: string;
    scheduledAt: string;
    status: string;
    customerName: string | null;
    vehicleLabel: string;
    plate: string | null;
    serviceName: string;
    expectedDurationMinutes: number | null;
  }[];
}

export interface OverviewAppointmentsSection {
  status: OverviewDataStatus;
  totalCount: number;
  countByStatus: Record<string, number>;
  /** Agrupado por data (calendário de São Paulo) — sempre presente, mesmo com 1 dia só. */
  byDay: OverviewAppointmentDayGroup[];
}

export interface OverviewServicesSection {
  status: OverviewDataStatus;
  /** Contagem por nome de serviço, EXCLUSIVAMENTE a partir de `appointments` — nunca somado com
   *  ordens JumpPark (não há chave de junção confiável entre os dois hoje, ver Missão 81A/82). */
  byService: { serviceName: string; realizadoCount: number; previstoCount: number }[];
}

export type OverviewCapacitySection =
  | { status: "ok"; applicable: true; boxesCount: number; dailyOperatingMinutes: number; dailyCapacityMinutes: number; committedMinutes: number; availableMinutes: number; percentOccupied: number }
  | { status: "unavailable"; applicable: true; reason: string }
  | { status: "unavailable"; applicable: false; reason: string };

export interface OverviewFinanceItem {
  id: string;
  description: string;
  partyName: string;
  dueDate: string;
  amount: number;
  isOverdue: boolean;
}

export interface OverviewFinanceSection {
  status: OverviewDataStatus;
  receivable: { totalAmount: number; items: OverviewFinanceItem[] };
  payable: { totalAmount: number; items: OverviewFinanceItem[] };
}

export interface OverviewStoneSection {
  status: OverviewDataStatus;
  /** Nunca "saldo" — a integração atual não fornece saldo bancário em tempo real (Missão 81A, Parte G). */
  saldoDisponivel: null;
  saldoIndisponivelMotivo: string;
  vendasNoPeriodo: { count: number; netAmount: number };
  liquidacoesNoPeriodo: { count: number; settledAmount: number };
  ultimaSincronizacao: string | null;
}

export interface OverviewYardSection {
  status: "unavailable";
  message: string;
  detail: string;
}

export type OverviewAlertSeverity = "info" | "warning" | "critical";

export interface OverviewAlert {
  id: string;
  severity: OverviewAlertSeverity;
  message: string;
}

export interface OverviewMetadata {
  generatedAt: string;
  timezone: "America/Sao_Paulo";
}

export interface OperationalOverview {
  period: PeriodRange;
  metadata: OverviewMetadata;
  revenue: OverviewRevenueSection;
  appointments: OverviewAppointmentsSection;
  services: OverviewServicesSection;
  capacity: OverviewCapacitySection;
  finance: OverviewFinanceSection;
  stone: OverviewStoneSection;
  yard: OverviewYardSection;
  alerts: OverviewAlert[];
}
