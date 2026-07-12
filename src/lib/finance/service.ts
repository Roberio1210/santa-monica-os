import "server-only";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { toAccountsPayableView, toAccountsReceivableView } from "@/lib/finance/status";
import type {
  AccountsPayableView,
  AccountsReceivableView,
  CashMovement,
  Contract,
  CostCenter,
  FinancialAccountBalance,
  FinancialCategory,
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

  const totalOpen = active
    .filter((i) => i.computedStatus === "open" || i.computedStatus === "partially_paid" || i.computedStatus === "overdue")
    .reduce((sum, i) => sum + i.outstandingAmount, 0);

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
