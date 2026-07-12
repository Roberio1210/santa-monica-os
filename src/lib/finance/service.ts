import "server-only";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { toAccountsPayableView, toAccountsReceivableView } from "@/lib/finance/status";
import type {
  AccountsPayableView,
  AccountsReceivableView,
  AccountTransfer,
  CashFlowAccountBalance,
  CashFlowAlert,
  CashFlowDashboard,
  CashFlowProjectionPoint,
  CashFlowProjectionWindow,
  CashLedgerEntry,
  CashMovement,
  Contract,
  CostCenter,
  FinancePaymentMethod,
  FinancialAccountBalance,
  FinancialCategory,
  Partner,
  RecurringBillTemplate,
  Supplier,
} from "@/lib/finance/types";

export interface AccountsReceivableSummary {
  totalOpen: number;
  totalReceivedThisMonth: number;
  totalOverdue: number;
  upcomingCount: number;
  count: number;
}

const UPCOMING_WINDOW_DAYS = 7;

function isSameMonth(dateIso: string, referenceIso: string): boolean {
  return dateIso.slice(0, 7) === referenceIso.slice(0, 7);
}

function addDays(dateIso: string, days: number): string {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function computeAccountsReceivableSummary(
  items: AccountsReceivableView[],
  asOfDate: string,
): AccountsReceivableSummary {
  const active = items.filter((i) => i.computedStatus !== "cancelled");

  /**
   * "reversed" (estornado) entra aqui quando ainda há saldo em aberto — o estorno desfaz o
   * recebimento, mas o valor continua sendo uma receita real a cobrar novamente.
   */
  const totalOpen = active.filter((i) => i.outstandingAmount > 0).reduce((sum, i) => sum + i.outstandingAmount, 0);

  const totalReceivedThisMonth = active
    .filter((i) => i.receivedAt !== null && isSameMonth(i.receivedAt, asOfDate))
    .reduce((sum, i) => sum + i.receivedAmount, 0);

  const totalOverdue = active.filter((i) => i.computedStatus === "overdue").reduce((sum, i) => sum + i.outstandingAmount, 0);

  const upcomingLimit = addDays(asOfDate, UPCOMING_WINDOW_DAYS);
  const upcomingCount = active.filter(
    (i) =>
      (i.computedStatus === "open" || i.computedStatus === "partially_paid") &&
      i.dueDate >= asOfDate &&
      i.dueDate <= upcomingLimit,
  ).length;

  return { totalOpen, totalReceivedThisMonth, totalOverdue, upcomingCount, count: active.length };
}

export async function fetchAccountsReceivableOverview(
  asOfDate: string = new Date().toISOString().slice(0, 10),
): Promise<{ items: AccountsReceivableView[]; summary: AccountsReceivableSummary }> {
  const items = await getFinanceRepository().listAccountsReceivable();
  const views = items
    .map((item) => toAccountsReceivableView(item, asOfDate))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { items: views, summary: computeAccountsReceivableSummary(views, asOfDate) };
}

export async function fetchCashMovements(): Promise<CashMovement[]> {
  return getFinanceRepository().listCashMovements();
}

export async function fetchContracts(): Promise<Contract[]> {
  return getFinanceRepository().listContracts();
}

// --- Dashboard de Contas a Receber ---

export interface AccountsReceivableDashboard {
  receiveToday: number;
  receiveTomorrow: number;
  receiveThisWeek: number;
  receiveThisMonth: number;
  overdueTotal: number;
  delinquentClients: { partyName: string; overdueAmount: number; overdueCount: number }[];
  byCostCenter: { costCenterName: string; amount: number }[];
  byPaymentMethod: { paymentMethod: FinancePaymentMethod; amount: number }[];
  byCategory: { categoryName: string; amount: number }[];
  upcomingDueDates: AccountsReceivableView[];
}

const UPCOMING_DUE_DATES_LIMIT = 10;

/**
 * Painel do módulo Contas a Receber — tudo calculado a partir dos registros reais em memória,
 * nunca gravado. "reversed" entra nos totais de saldo em aberto (é receita ainda a cobrar),
 * "cancelled" e "draft" nunca entram.
 */
export function computeAccountsReceivableDashboard(items: AccountsReceivableView[], asOfDate: string): AccountsReceivableDashboard {
  const outstanding = items.filter((i) => i.computedStatus !== "cancelled" && i.computedStatus !== "draft" && i.outstandingAmount > 0);

  const tomorrow = addDays(asOfDate, 1);
  const weekLimit = addDays(asOfDate, 7);
  const monthLimit = `${asOfDate.slice(0, 7)}-31`;

  const receiveToday = outstanding.filter((i) => i.dueDate === asOfDate).reduce((sum, i) => sum + i.outstandingAmount, 0);
  const receiveTomorrow = outstanding.filter((i) => i.dueDate === tomorrow).reduce((sum, i) => sum + i.outstandingAmount, 0);
  const receiveThisWeek = outstanding
    .filter((i) => i.dueDate >= asOfDate && i.dueDate <= weekLimit)
    .reduce((sum, i) => sum + i.outstandingAmount, 0);
  const receiveThisMonth = outstanding
    .filter((i) => i.dueDate.slice(0, 7) === asOfDate.slice(0, 7) && i.dueDate <= monthLimit)
    .reduce((sum, i) => sum + i.outstandingAmount, 0);
  const overdueTotal = outstanding.filter((i) => i.computedStatus === "overdue").reduce((sum, i) => sum + i.outstandingAmount, 0);

  const delinquentMap = new Map<string, { overdueAmount: number; overdueCount: number }>();
  for (const item of outstanding.filter((i) => i.computedStatus === "overdue")) {
    const current = delinquentMap.get(item.partyName) ?? { overdueAmount: 0, overdueCount: 0 };
    current.overdueAmount = Math.round((current.overdueAmount + item.outstandingAmount) * 100) / 100;
    current.overdueCount += 1;
    delinquentMap.set(item.partyName, current);
  }
  const delinquentClients = Array.from(delinquentMap.entries())
    .map(([partyName, v]) => ({ partyName, ...v }))
    .sort((a, b) => b.overdueAmount - a.overdueAmount);

  const byCostCenter = groupSum(outstanding, (i) => i.costCenterName ?? "Não informado").map(([costCenterName, amount]) => ({
    costCenterName,
    amount,
  }));
  const byPaymentMethod = groupSum(outstanding, (i) => i.paymentMethod).map(([paymentMethod, amount]) => ({
    paymentMethod: paymentMethod as FinancePaymentMethod,
    amount,
  }));
  const byCategory = groupSum(outstanding, (i) => i.categoryName ?? "Não informado").map(([categoryName, amount]) => ({
    categoryName,
    amount,
  }));

  const upcomingDueDates = outstanding
    .filter((i) => i.dueDate >= asOfDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, UPCOMING_DUE_DATES_LIMIT);

  return { receiveToday, receiveTomorrow, receiveThisWeek, receiveThisMonth, overdueTotal, delinquentClients, byCostCenter, byPaymentMethod, byCategory, upcomingDueDates };
}

function groupSum<T>(items: T[], keyFn: (item: T) => string): [string, number][] {
  const map = new Map<string, number>();
  for (const item of items as (T & { outstandingAmount: number })[]) {
    const key = keyFn(item);
    map.set(key, Math.round(((map.get(key) ?? 0) + item.outstandingAmount) * 100) / 100);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

export type ReceivableAlertLevel = "vence_amanha" | "vencida" | "cliente_recorrente_inadimplente";

export interface ReceivableAlert {
  accountsReceivableId: string;
  partyName: string;
  description: string;
  dueDate: string;
  outstandingAmount: number;
  level: ReceivableAlertLevel;
}

/**
 * Calculado sob demanda a partir das contas reais — nunca grava nada, então nunca duplica
 * alerta a cada acesso (mesmo padrão de computePayableAlerts). Cobre: receita vencida, receita
 * vence amanhã, parcela atrasada (uma linha vencida de um installmentGroup) e cliente recorrente
 * inadimplente (mais de uma conta vencida do mesmo cliente/parceiro).
 */
export function computeReceivableAlerts(items: AccountsReceivableView[], asOfDate: string): ReceivableAlert[] {
  const alerts: ReceivableAlert[] = [];
  const tomorrow = addDays(asOfDate, 1);
  const active = items.filter((i) => i.computedStatus !== "cancelled" && i.computedStatus !== "draft" && i.outstandingAmount > 0);

  for (const item of active) {
    if (item.computedStatus === "overdue") {
      alerts.push({
        accountsReceivableId: item.id,
        partyName: item.partyName,
        description: item.description,
        dueDate: item.dueDate,
        outstandingAmount: item.outstandingAmount,
        level: "vencida",
      });
    } else if (item.dueDate === tomorrow) {
      alerts.push({
        accountsReceivableId: item.id,
        partyName: item.partyName,
        description: item.description,
        dueDate: item.dueDate,
        outstandingAmount: item.outstandingAmount,
        level: "vence_amanha",
      });
    }
  }

  const overdueByParty = new Map<string, number>();
  for (const item of active.filter((i) => i.computedStatus === "overdue")) {
    overdueByParty.set(item.partyName, (overdueByParty.get(item.partyName) ?? 0) + 1);
  }
  for (const [partyName, count] of overdueByParty) {
    if (count < 2) continue;
    const worst = active
      .filter((i) => i.partyName === partyName && i.computedStatus === "overdue")
      .sort((a, b) => b.outstandingAmount - a.outstandingAmount)[0];
    if (!worst) continue;
    alerts.push({
      accountsReceivableId: worst.id,
      partyName,
      description: `Cliente recorrente inadimplente — ${count} contas vencidas`,
      dueDate: worst.dueDate,
      outstandingAmount: active
        .filter((i) => i.partyName === partyName && i.computedStatus === "overdue")
        .reduce((sum, i) => sum + i.outstandingAmount, 0),
      level: "cliente_recorrente_inadimplente",
    });
  }

  return alerts;
}

export async function fetchAccountsReceivableDashboard(
  asOfDate: string = new Date().toISOString().slice(0, 10),
): Promise<AccountsReceivableDashboard> {
  const { items } = await fetchAccountsReceivableOverview(asOfDate);
  return computeAccountsReceivableDashboard(items, asOfDate);
}

export async function fetchReceivableAlerts(asOfDate: string = new Date().toISOString().slice(0, 10)): Promise<ReceivableAlert[]> {
  const { items } = await fetchAccountsReceivableOverview(asOfDate);
  return computeReceivableAlerts(items, asOfDate);
}

export async function fetchRevenueCategories(): Promise<FinancialCategory[]> {
  return getFinanceRepository().listFinancialCategories("receita");
}

export async function fetchPartners(): Promise<Partner[]> {
  return getFinanceRepository().listPartners();
}

// --- Contas a Pagar ---

export interface AccountsPayableSummary {
  totalPending: number;
  totalOverdue: number;
  totalPaidThisMonth: number;
  upcoming7Count: number;
  upcoming30Count: number;
  count: number;
}

function diffInDays(dateIso: string, referenceIso: string): number {
  const date = new Date(`${dateIso}T00:00:00.000Z`);
  const reference = new Date(`${referenceIso}T00:00:00.000Z`);
  return Math.round((date.getTime() - reference.getTime()) / (1000 * 60 * 60 * 24));
}

export function computeAccountsPayableSummary(items: AccountsPayableView[], asOfDate: string): AccountsPayableSummary {
  const active = items.filter((i) => i.computedStatus !== "cancelada");

  const totalPending = active
    .filter((i) => i.computedStatus === "pendente" || i.computedStatus === "parcialmente_paga" || i.computedStatus === "vencida")
    .reduce((sum, i) => sum + i.outstandingAmount, 0);

  const totalOverdue = active.filter((i) => i.computedStatus === "vencida").reduce((sum, i) => sum + i.outstandingAmount, 0);

  const totalPaidThisMonth = active
    .filter((i) => i.paidAmount > 0 && isSameMonth(i.updatedAt.slice(0, 10), asOfDate))
    .reduce((sum, i) => sum + i.paidAmount, 0);

  const isUpcoming = (i: AccountsPayableView) =>
    (i.computedStatus === "pendente" || i.computedStatus === "parcialmente_paga") && i.dueDate >= asOfDate;

  const upcoming7Count = active.filter((i) => isUpcoming(i) && i.dueDate <= addDays(asOfDate, 7)).length;
  const upcoming30Count = active.filter((i) => isUpcoming(i) && i.dueDate <= addDays(asOfDate, 30)).length;

  return { totalPending, totalOverdue, totalPaidThisMonth, upcoming7Count, upcoming30Count, count: active.length };
}

export async function fetchAccountsPayableOverview(
  asOfDate: string = new Date().toISOString().slice(0, 10),
): Promise<{ items: AccountsPayableView[]; summary: AccountsPayableSummary }> {
  const items = await getFinanceRepository().listAccountsPayable();
  const views = items.map((item) => toAccountsPayableView(item, asOfDate)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return { items: views, summary: computeAccountsPayableSummary(views, asOfDate) };
}

export type PayableAlertLevel = "7_dias" | "3_dias" | "1_dia" | "no_dia" | "vencida";

export interface PayableAlert {
  accountsPayableId: string;
  description: string;
  dueDate: string;
  outstandingAmount: number;
  level: PayableAlertLevel;
}

const ALERT_THRESHOLD_LABELS: Record<number, PayableAlertLevel> = {
  7: "7_dias",
  3: "3_dias",
  1: "1_dia",
  0: "no_dia",
};

/**
 * Calculado sob demanda a partir das contas reais — nunca grava nada, então nunca duplica
 * registro a cada acesso (ver Parte 8 da tarefa). Vencida também é reportada aqui, mesmo com
 * dias negativos, para a UI destacar.
 */
export function computePayableAlerts(items: AccountsPayableView[], asOfDate: string): PayableAlert[] {
  const alerts: PayableAlert[] = [];
  for (const item of items) {
    if (item.computedStatus === "paga" || item.computedStatus === "cancelada") continue;
    const daysUntilDue = diffInDays(item.dueDate, asOfDate);
    const level = daysUntilDue < 0 ? "vencida" : ALERT_THRESHOLD_LABELS[daysUntilDue];
    if (level) {
      alerts.push({ accountsPayableId: item.id, description: item.description, dueDate: item.dueDate, outstandingAmount: item.outstandingAmount, level });
    }
  }
  return alerts;
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  return getFinanceRepository().listSuppliers();
}

export async function fetchFinancialAccounts(): Promise<FinancialAccountBalance[]> {
  return getFinanceRepository().listFinancialAccounts();
}

export async function fetchRecurringBillTemplates(): Promise<RecurringBillTemplate[]> {
  return getFinanceRepository().listRecurringBillTemplates();
}

/**
 * Gera (ou reaproveita, se já existir) a conta a pagar de uma competência específica a partir
 * de um modelo de recorrência. Idempotente: nunca cria uma segunda conta para o mesmo
 * (recurringBillTemplateId, competência) — checa antes de criar. Nunca é chamada
 * automaticamente por nenhuma tela; é uma ação explícita (ver Parte 5 do módulo Contas a Pagar).
 * Modelos de valor variável (água/energia) exigem o valor informado manualmente — não
 * inventamos um valor a partir do template.
 */
export async function generateAccountsPayableFromTemplate(templateId: string, competenceDate: string, amountOverride?: number) {
  const repo = getFinanceRepository();
  const templates = await repo.listRecurringBillTemplates();
  const template = templates.find((t) => t.id === templateId);
  if (!template) throw new Error(`Modelo de recorrência não encontrado: ${templateId}`);

  const amount = template.variableAmount ? amountOverride : template.amount;
  if (amount === undefined || amount === null) {
    throw new Error("Este modelo tem valor variável — informe o valor desta competência manualmente.");
  }
  if (!template.categoryId) throw new Error("Modelo sem categoria definida.");

  const existing = await repo.listAccountsPayable();
  const alreadyGenerated = existing.find(
    (i) => i.recurringBillTemplateId === templateId && i.competenceDate.slice(0, 7) === competenceDate.slice(0, 7),
  );
  if (alreadyGenerated) return alreadyGenerated;

  const dueDate = template.dueDay ? `${competenceDate.slice(0, 7)}-${String(template.dueDay).padStart(2, "0")}` : competenceDate;

  const [created] = await repo.createAccountsPayable({
    description: template.description,
    supplierId: template.supplierId,
    categoryId: template.categoryId,
    costCenterId: template.costCenterId,
    financialAccountId: template.financialAccountId,
    competenceDate,
    dueDate,
    originalAmount: amount,
    pendingData: template.pendingData,
    recurringBillTemplateId: templateId,
  });
  return created;
}

export async function fetchExpenseCategories(): Promise<FinancialCategory[]> {
  return getFinanceRepository().listFinancialCategories("despesa");
}

export async function fetchCostCenters(): Promise<CostCenter[]> {
  return getFinanceRepository().listCostCenters();
}

// --- Fluxo de Caixa / Livro Caixa ---

/**
 * Livro Caixa: junta cash_movements ("movimento") e account_transfers ("transferencia") numa
 * única lista ordenada cronologicamente — nenhuma tabela nova, só uma visão combinada. Toda
 * entrada e toda saída real passa por uma dessas duas tabelas, então nada fica de fora.
 */
export function computeCashLedger(movements: CashMovement[], transfers: AccountTransfer[]): CashLedgerEntry[] {
  const fromMovements: CashLedgerEntry[] = movements.map((m) => ({
    id: m.id,
    kind: "movimento",
    date: m.date,
    label: m.nature ?? m.type,
    amount: m.type === "saida" ? -m.amount : m.amount,
    description: m.description,
    financialAccountId: m.financialAccountId,
    financialAccountName: m.financialAccountName,
    toAccountId: null,
    toAccountName: null,
    categoryName: m.categoryName,
    costCenterName: m.costCenterName,
    partyName: m.partyName,
    responsibleName: m.responsibleName,
    documentRef: m.documentRef,
    competenceDate: m.competenceDate,
    balanceBefore: m.balanceBefore,
    balanceAfter: m.balanceAfter,
    notes: m.notes,
  }));

  const fromTransfers: CashLedgerEntry[] = transfers.map((t) => ({
    id: t.id,
    kind: "transferencia",
    date: t.date,
    label: t.type,
    amount: t.amount,
    description: t.description,
    financialAccountId: t.fromAccountId,
    financialAccountName: t.fromAccountName,
    toAccountId: t.toAccountId,
    toAccountName: t.toAccountName,
    categoryName: null,
    costCenterName: null,
    partyName: null,
    responsibleName: t.responsibleName,
    documentRef: t.documentRef,
    competenceDate: null,
    balanceBefore: null,
    balanceAfter: null,
    notes: t.notes,
  }));

  return [...fromMovements, ...fromTransfers].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
}

export async function fetchCashLedger(): Promise<CashLedgerEntry[]> {
  const repo = getFinanceRepository();
  const [movements, transfers] = await Promise.all([repo.listCashMovements(), repo.listAccountTransfers()]);
  return computeCashLedger(movements, transfers);
}

const CASH_FLOW_TOP_N = 5;

/**
 * Painel do Fluxo de Caixa — saldos, resultado do período e maiores despesas/receitas, tudo
 * calculado a partir de cash_movements/account_transfers/accounts_receivable/accounts_payable
 * reais. "Receitas previstas"/"despesas previstas" são o saldo em aberto de Contas a Receber/
 * Pagar (o que ainda deve entrar/sair), não os movimentos já ocorridos.
 */
export function computeCashFlowDashboard(
  accounts: FinancialAccountBalance[],
  movements: CashMovement[],
  arItems: AccountsReceivableView[],
  apItems: AccountsPayableView[],
  asOfDate: string,
): CashFlowDashboard {
  const saldoGeral = Math.round(accounts.reduce((sum, a) => sum + a.currentBalance, 0) * 100) / 100;
  const saldoPorConta: CashFlowAccountBalance[] = accounts.map((a) => ({
    financialAccountId: a.id,
    name: a.name,
    currentBalance: a.currentBalance,
    informedBalance: a.informedBalance,
    belowThreshold: a.belowThreshold,
  }));

  const todayMovements = movements.filter((m) => m.date === asOfDate);
  const entradasHoje = todayMovements.filter((m) => m.type === "entrada").reduce((sum, m) => sum + m.amount, 0);
  const saidasHoje = todayMovements.filter((m) => m.type === "saida").reduce((sum, m) => sum + m.amount, 0);
  const resultadoDia = Math.round((entradasHoje - saidasHoje) * 100) / 100;

  const weekStart = addDays(asOfDate, -6);
  const weekMovements = movements.filter((m) => m.date >= weekStart && m.date <= asOfDate);
  const resultadoSemana =
    Math.round(
      (weekMovements.filter((m) => m.type === "entrada").reduce((sum, m) => sum + m.amount, 0) -
        weekMovements.filter((m) => m.type === "saida").reduce((sum, m) => sum + m.amount, 0)) *
        100,
    ) / 100;

  const monthMovements = movements.filter((m) => isSameMonth(m.date, asOfDate));
  const resultadoMes =
    Math.round(
      (monthMovements.filter((m) => m.type === "entrada").reduce((sum, m) => sum + m.amount, 0) -
        monthMovements.filter((m) => m.type === "saida").reduce((sum, m) => sum + m.amount, 0)) *
        100,
    ) / 100;

  const receitasPrevistas = Math.round(
    arItems
      .filter((i) => i.computedStatus !== "cancelled" && i.computedStatus !== "draft" && i.outstandingAmount > 0)
      .reduce((sum, i) => sum + i.outstandingAmount, 0) * 100,
  ) / 100;
  const despesasPrevistas = Math.round(
    apItems
      .filter((i) => i.computedStatus !== "cancelada" && i.computedStatus !== "rascunho" && i.outstandingAmount > 0)
      .reduce((sum, i) => sum + i.outstandingAmount, 0) * 100,
  ) / 100;

  const maioresDespesas = movements
    .filter((m) => m.type === "saida")
    .sort((a, b) => b.amount - a.amount)
    .slice(0, CASH_FLOW_TOP_N)
    .map((m) => ({ description: m.description, amount: m.amount, date: m.date }));
  const maioresReceitas = movements
    .filter((m) => m.type === "entrada")
    .sort((a, b) => b.amount - a.amount)
    .slice(0, CASH_FLOW_TOP_N)
    .map((m) => ({ description: m.description, amount: m.amount, date: m.date }));

  const entradasPorCentroCusto = groupSumByAmount(
    movements.filter((m) => m.type === "entrada"),
    (m) => m.costCenterName ?? "Não informado",
  ).map(([costCenterName, amount]) => ({ costCenterName, amount }));
  const saidasPorCentroCusto = groupSumByAmount(
    movements.filter((m) => m.type === "saida"),
    (m) => m.costCenterName ?? "Não informado",
  ).map(([costCenterName, amount]) => ({ costCenterName, amount }));

  return {
    saldoGeral,
    saldoPorConta,
    entradasHoje,
    saidasHoje,
    resultadoDia,
    resultadoSemana,
    resultadoMes,
    receitasPrevistas,
    despesasPrevistas,
    maioresDespesas,
    maioresReceitas,
    entradasPorCentroCusto,
    saidasPorCentroCusto,
  };
}

function groupSumByAmount<T extends { amount: number }>(items: T[], keyFn: (item: T) => string): [string, number][] {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, Math.round(((map.get(key) ?? 0) + item.amount) * 100) / 100);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

const PROJECTION_WINDOWS: { window: CashFlowProjectionWindow; days: number }[] = [
  { window: "hoje", days: 0 },
  { window: "amanha", days: 1 },
  { window: "7_dias", days: 7 },
  { window: "15_dias", days: 15 },
  { window: "30_dias", days: 30 },
  { window: "90_dias", days: 90 },
];

/**
 * Projeção de saldo por janela, considerando o saldo atual real + contas a receber/pagar já
 * lançadas (inclui parcelamentos, já que cada parcela é uma linha própria com seu vencimento).
 * Recorrências ainda não materializadas em accounts_payable não entram — nunca inventamos um
 * valor/data futuro para um lançamento que ainda não existe (ver generateAccountsPayableFromTemplate,
 * ação explícita e não automática).
 */
export function computeCashFlowProjection(
  saldoGeral: number,
  arItems: AccountsReceivableView[],
  apItems: AccountsPayableView[],
  asOfDate: string,
): CashFlowProjectionPoint[] {
  const openAr = arItems.filter((i) => i.computedStatus !== "cancelled" && i.computedStatus !== "draft" && i.outstandingAmount > 0);
  const openAp = apItems.filter((i) => i.computedStatus !== "cancelada" && i.computedStatus !== "rascunho" && i.outstandingAmount > 0);

  return PROJECTION_WINDOWS.map(({ window, days }) => {
    const limit = addDays(asOfDate, days);
    const contasAReceber = Math.round(
      openAr.filter((i) => i.dueDate <= limit).reduce((sum, i) => sum + i.outstandingAmount, 0) * 100,
    ) / 100;
    const contasAPagar = Math.round(
      openAp.filter((i) => i.dueDate <= limit).reduce((sum, i) => sum + i.outstandingAmount, 0) * 100,
    ) / 100;
    const saldoProjetado = Math.round((saldoGeral + contasAReceber - contasAPagar) * 100) / 100;
    return { window, contasAReceber, contasAPagar, saldoProjetado };
  });
}

const ACCOUNT_INACTIVITY_ALERT_DAYS = 30;

/**
 * Calculado sob demanda — nunca persiste nada, mesmo padrão de computePayableAlerts/
 * computeReceivableAlerts. "conta_zerando" só dispara para contas com fundo fixo definido (ex.:
 * Caixa físico) — nunca inventamos um limiar para Stone/Ailos, que não têm fundo fixo.
 */
export function computeCashFlowAlerts(
  accounts: FinancialAccountBalance[],
  movements: CashMovement[],
  transfers: AccountTransfer[],
  projection: CashFlowProjectionPoint[],
  asOfDate: string,
): CashFlowAlert[] {
  const alerts: CashFlowAlert[] = [];

  for (const account of accounts) {
    if (account.currentBalance < 0) {
      alerts.push({
        level: "saldo_negativo",
        financialAccountId: account.id,
        financialAccountName: account.name,
        message: `Saldo negativo em ${account.name}.`,
        amount: account.currentBalance,
      });
    } else if (account.belowThreshold) {
      alerts.push({
        level: "conta_zerando",
        financialAccountId: account.id,
        financialAccountName: account.name,
        message: `${account.name} está abaixo do fundo fixo esperado.`,
        amount: account.currentBalance,
      });
    }

    if (account.informedBalance !== null && Math.abs(account.informedBalance - account.currentBalance) > 0.01) {
      alerts.push({
        level: "diferenca_saldo_informado",
        financialAccountId: account.id,
        financialAccountName: account.name,
        message: `Saldo calculado (${account.currentBalance}) difere do saldo informado (${account.informedBalance}) em ${account.name}.`,
        amount: Math.round((account.informedBalance - account.currentBalance) * 100) / 100,
      });
    }

    const lastMovementDate = movements
      .filter((m) => m.financialAccountId === account.id)
      .concat(transfers.filter((t) => t.fromAccountId === account.id || t.toAccountId === account.id).map((t) => ({ date: t.date }) as CashMovement))
      .map((m) => m.date)
      .sort()
      .at(-1);
    if (!lastMovementDate || diffInDays(asOfDate, lastMovementDate) > ACCOUNT_INACTIVITY_ALERT_DAYS) {
      alerts.push({
        level: "conta_sem_movimentacao",
        financialAccountId: account.id,
        financialAccountName: account.name,
        message: lastMovementDate
          ? `${account.name} não tem movimentação há mais de ${ACCOUNT_INACTIVITY_ALERT_DAYS} dias.`
          : `${account.name} nunca teve nenhuma movimentação registrada.`,
        amount: null,
      });
    }
  }

  const negativeFuture = projection.find((p) => p.saldoProjetado < 0);
  if (negativeFuture) {
    alerts.push({
      level: "fluxo_negativo_futuro",
      financialAccountId: null,
      financialAccountName: null,
      message: `Fluxo de caixa projetado fica negativo na janela "${negativeFuture.window}" (saldo projetado: ${negativeFuture.saldoProjetado}).`,
      amount: negativeFuture.saldoProjetado,
    });
  }

  return alerts;
}

export async function fetchCashFlowOverview(asOfDate: string = new Date().toISOString().slice(0, 10)): Promise<{
  dashboard: CashFlowDashboard;
  projection: CashFlowProjectionPoint[];
  alerts: CashFlowAlert[];
  ledger: CashLedgerEntry[];
  accounts: FinancialAccountBalance[];
}> {
  const repo = getFinanceRepository();
  const [accounts, movements, transfers, arOverview, apOverview] = await Promise.all([
    repo.listFinancialAccounts(),
    repo.listCashMovements(),
    repo.listAccountTransfers(),
    fetchAccountsReceivableOverview(asOfDate),
    fetchAccountsPayableOverview(asOfDate),
  ]);

  const dashboard = computeCashFlowDashboard(accounts, movements, arOverview.items, apOverview.items, asOfDate);
  const projection = computeCashFlowProjection(dashboard.saldoGeral, arOverview.items, apOverview.items, asOfDate);
  const alerts = computeCashFlowAlerts(accounts, movements, transfers, projection, asOfDate);
  const ledger = computeCashLedger(movements, transfers);

  return { dashboard, projection, alerts, ledger, accounts };
}
