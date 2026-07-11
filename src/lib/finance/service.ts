import "server-only";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { toAccountsReceivableView } from "@/lib/finance/status";
import type { AccountsReceivableView, CashMovement, Contract } from "@/lib/finance/types";

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
