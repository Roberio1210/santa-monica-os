import "server-only";
import { isJumpParkConfigured } from "@/lib/config/env";
import { fetchDailyFinancial, fetchTodayOperations, JumpParkNotConfiguredError, type OperationOrder } from "@/lib/integrations/jumppark";
import {
  computePayableAlerts,
  computeReceivableAlerts,
  fetchAccountsPayableOverview,
  fetchAccountsReceivableOverview,
  fetchCashFlowOverview,
  fetchClassificationQueue,
  type AccountsPayableSummary,
  type AccountsReceivableSummary,
  type PayableAlert,
  type ReceivableAlert,
} from "@/lib/finance/service";
import { fetchInventoryOverview, type InventorySummary } from "@/lib/inventory/service";
import type { AccountsPayableView, AccountsReceivableView, CashFlowAlert, CashFlowProjectionPoint, FinancialAccountBalance } from "@/lib/finance/types";

/**
 * Resultado por seção — nunca deixa uma falha de uma fonte (ex.: JumpPark fora do ar) derrubar
 * o restante da Central de Operações. Cada bloco da UI decide como mostrar seu próprio erro.
 */
export interface SectionResult<T> {
  data: T | null;
  error: string | null;
}

export interface JumpParkTodayData {
  dailyRevenue: number;
  vehicles: number;
  orders: OperationOrder[];
}

export interface CentralOverview {
  asOfDate: string;
  checkedAt: string;
  jumpparkConfigured: boolean;
  jumppark: SectionResult<JumpParkTodayData>;
  cashFlow: SectionResult<Awaited<ReturnType<typeof fetchCashFlowOverview>>>;
  accountsPayable: SectionResult<{ items: AccountsPayableView[]; summary: AccountsPayableSummary; alerts: PayableAlert[] }>;
  accountsReceivable: SectionResult<{ items: AccountsReceivableView[]; summary: AccountsReceivableSummary; alerts: ReceivableAlert[] }>;
  classificationPendingCount: SectionResult<number>;
  inventory: SectionResult<InventorySummary>;
}

async function settle<T>(promise: Promise<T>): Promise<SectionResult<T>> {
  try {
    const data = await promise;
    return { data, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err.message : "Falha ao carregar os dados." };
  }
}

/**
 * Agregador de leitura da Central de Operações — só leitura, nunca grava nada. Cada fonte é
 * buscada em paralelo e isolada com try/catch próprio (settle), então uma falha pontual (ex.:
 * JumpPark fora do ar) nunca derruba as outras seções.
 */
export async function fetchCentralOverview(asOfDate: string): Promise<CentralOverview> {
  const jumpparkConfigured = isJumpParkConfigured();

  const jumpparkPromise: Promise<JumpParkTodayData> = jumpparkConfigured
    ? Promise.all([fetchDailyFinancial(asOfDate), fetchTodayOperations(asOfDate)]).then(([daily, orders]) => ({
        dailyRevenue: daily.total,
        vehicles: orders.length,
        orders,
      }))
    : Promise.reject(new JumpParkNotConfiguredError());

  const [jumppark, cashFlow, apOverview, arOverview, classificationQueue, inventory] = await Promise.all([
    settle(jumpparkPromise),
    settle(fetchCashFlowOverview(asOfDate)),
    settle(fetchAccountsPayableOverview(asOfDate)),
    settle(fetchAccountsReceivableOverview(asOfDate)),
    settle(fetchClassificationQueue()),
    settle(fetchInventoryOverview()),
  ]);

  const accountsPayable: SectionResult<{ items: AccountsPayableView[]; summary: AccountsPayableSummary; alerts: PayableAlert[] }> = apOverview.data
    ? { data: { ...apOverview.data, alerts: computePayableAlerts(apOverview.data.items, asOfDate) }, error: null }
    : { data: null, error: apOverview.error };

  const accountsReceivable: SectionResult<{ items: AccountsReceivableView[]; summary: AccountsReceivableSummary; alerts: ReceivableAlert[] }> = arOverview.data
    ? { data: { ...arOverview.data, alerts: computeReceivableAlerts(arOverview.data.items, asOfDate) }, error: null }
    : { data: null, error: arOverview.error };

  const classificationPendingCount: SectionResult<number> = classificationQueue.data
    ? { data: classificationQueue.data.length, error: null }
    : { data: null, error: classificationQueue.error };

  return {
    asOfDate,
    checkedAt: new Date().toISOString(),
    jumpparkConfigured,
    jumppark: jumpparkConfigured ? jumppark : { data: null, error: "JumpPark não configurado neste ambiente." },
    cashFlow,
    accountsPayable,
    accountsReceivable,
    classificationPendingCount,
    inventory: inventory.data ? { data: inventory.data.summary, error: null } : { data: null, error: inventory.error },
  };
}

export type SituationLevel = "normal" | "atencao" | "critica";

/**
 * Situação geral da empresa — calculada só a partir de condições reais já presentes no
 * overview. Nunca inventa uma condição de atenção/crítica.
 */
export function computeSituation(overview: CentralOverview): SituationLevel {
  const criticalConditions = [
    overview.accountsPayable.data?.summary.totalOverdue ? overview.accountsPayable.data.summary.totalOverdue > 0 : false,
    overview.cashFlow.data?.alerts.some((a) => a.level === "saldo_negativo" || a.level === "fluxo_negativo_futuro") ?? false,
    overview.inventory.data ? overview.inventory.data.nearEmptyCount > 0 : false,
    Boolean(overview.jumpparkConfigured && overview.jumppark.error),
    Boolean(overview.cashFlow.error || overview.accountsPayable.error || overview.accountsReceivable.error),
  ];
  if (criticalConditions.some(Boolean)) return "critica";

  const attentionConditions = [
    (overview.classificationPendingCount.data ?? 0) > 0,
    overview.cashFlow.data?.alerts.some((a) => a.level === "conta_zerando" || a.level === "diferenca_saldo_informado") ?? false,
    overview.inventory.data ? overview.inventory.data.lowStockCount > 0 : false,
    overview.accountsReceivable.data?.alerts.some((a) => a.level === "vencida") ?? false,
  ];
  if (attentionConditions.some(Boolean)) return "atencao";

  return "normal";
}

export type ConsolidatedAlertSeverity = "informativo" | "atencao" | "critico";

export interface ConsolidatedAlert {
  severity: ConsolidatedAlertSeverity;
  title: string;
  description: string;
  date: string | null;
  module: string;
  href: string;
}

const severityRank: Record<ConsolidatedAlertSeverity, number> = { critico: 0, atencao: 1, informativo: 2 };

/**
 * Consolida os alertas já calculados pelos módulos existentes (Contas a Pagar/Receber, Fluxo de
 * Caixa, Estoque, Classificação, conexão JumpPark) numa única lista — nenhuma tabela nova,
 * nenhum alerta persistido, tudo recalculado a cada acesso.
 */
export function computeConsolidatedAlerts(overview: CentralOverview): ConsolidatedAlert[] {
  const alerts: ConsolidatedAlert[] = [];

  for (const alert of overview.accountsPayable.data?.alerts ?? []) {
    alerts.push({
      severity: alert.level === "vencida" ? "critico" : "atencao",
      title: alert.level === "vencida" ? "Conta a pagar vencida" : "Conta a pagar vence em breve",
      description: `${alert.description} — ${formatBRL(alert.outstandingAmount)}`,
      date: alert.dueDate,
      module: "Contas a Pagar",
      href: "/financeiro/contas-a-pagar",
    });
  }

  for (const alert of overview.accountsReceivable.data?.alerts ?? []) {
    alerts.push({
      severity: alert.level === "vencida" ? "critico" : "atencao",
      title:
        alert.level === "vencida"
          ? "Conta a receber vencida"
          : alert.level === "vence_amanha"
            ? "Conta a receber vence amanhã"
            : "Cliente recorrente inadimplente",
      description: `${alert.partyName} — ${alert.description} — ${formatBRL(alert.outstandingAmount)}`,
      date: alert.dueDate,
      module: "Contas a Receber",
      href: "/financeiro/contas-a-receber",
    });
  }

  for (const alert of overview.cashFlow.data?.alerts ?? []) {
    alerts.push(mapCashFlowAlert(alert));
  }

  if ((overview.classificationPendingCount.data ?? 0) > 0) {
    alerts.push({
      severity: "informativo",
      title: "Lançamentos sem classificação",
      description: `${overview.classificationPendingCount.data} lançamento(s) aguardando classificação gerencial.`,
      date: null,
      module: "Classificação Financeira",
      href: "/financeiro/classificacao",
    });
  }

  if (overview.inventory.data?.nearEmptyCount) {
    alerts.push({
      severity: "critico",
      title: "Itens próximos do fim",
      description: `${overview.inventory.data.nearEmptyCount} item(ns) de estoque quase esgotados.`,
      date: null,
      module: "Estoque",
      href: "/estoque",
    });
  }
  if (overview.inventory.data?.lowStockCount) {
    alerts.push({
      severity: "atencao",
      title: "Estoque baixo",
      description: `${overview.inventory.data.lowStockCount} item(ns) abaixo do mínimo definido.`,
      date: null,
      module: "Estoque",
      href: "/estoque",
    });
  }

  if (overview.jumpparkConfigured && overview.jumppark.error) {
    alerts.push({
      severity: "atencao",
      title: "Falha de conexão com o JumpPark",
      description: overview.jumppark.error,
      date: null,
      module: "JumpPark",
      href: "/configuracoes/status",
    });
  }

  for (const [label, sectionError] of [
    ["Fluxo de Caixa", overview.cashFlow.error],
    ["Contas a Pagar", overview.accountsPayable.error],
    ["Contas a Receber", overview.accountsReceivable.error],
  ] as const) {
    if (sectionError) {
      alerts.push({ severity: "atencao", title: `Falha ao carregar ${label}`, description: sectionError, date: null, module: label, href: "/financeiro" });
    }
  }

  return alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

function mapCashFlowAlert(alert: CashFlowAlert): ConsolidatedAlert {
  const titles: Record<CashFlowAlert["level"], string> = {
    saldo_negativo: "Saldo negativo",
    conta_zerando: "Conta zerando",
    fluxo_negativo_futuro: "Fluxo projetado negativo",
    conta_sem_movimentacao: "Conta sem movimentação",
    diferenca_saldo_informado: "Diferença entre saldo calculado e informado",
  };
  const severities: Record<CashFlowAlert["level"], ConsolidatedAlertSeverity> = {
    saldo_negativo: "critico",
    conta_zerando: "atencao",
    fluxo_negativo_futuro: "critico",
    conta_sem_movimentacao: "informativo",
    diferenca_saldo_informado: "atencao",
  };
  return {
    severity: severities[alert.level],
    title: titles[alert.level],
    description: alert.message,
    date: null,
    module: "Fluxo de Caixa",
    href: "/financeiro/fluxo-de-caixa",
  };
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

/** Primeira janela de projeção com saldo negativo, com sua data aproximada real (não inventada). */
export function findFirstNegativeProjection(projection: CashFlowProjectionPoint[], asOfDate: string): { point: CashFlowProjectionPoint; date: string } | null {
  const windowDays: Record<CashFlowProjectionPoint["window"], number> = { hoje: 0, amanha: 1, "7_dias": 7, "15_dias": 15, "30_dias": 30, "90_dias": 90 };
  const negative = projection.find((p) => p.saldoProjetado < 0);
  if (!negative) return null;
  const date = new Date(`${asOfDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + windowDays[negative.window]);
  return { point: negative, date: date.toISOString().slice(0, 10) };
}

export function sumOutstandingDueOn(items: (AccountsPayableView | AccountsReceivableView)[], date: string): number {
  return Math.round(items.filter((i) => i.dueDate === date).reduce((sum, i) => sum + i.outstandingAmount, 0) * 100) / 100;
}

export function sumOutstandingDueWithin(items: (AccountsPayableView | AccountsReceivableView)[], from: string, to: string): number {
  return Math.round(items.filter((i) => i.dueDate >= from && i.dueDate <= to).reduce((sum, i) => sum + i.outstandingAmount, 0) * 100) / 100;
}

export function findAccountByName(accounts: FinancialAccountBalance[], nameIncludes: string): FinancialAccountBalance | null {
  return accounts.find((a) => a.name.toLowerCase().includes(nameIncludes.toLowerCase())) ?? null;
}
