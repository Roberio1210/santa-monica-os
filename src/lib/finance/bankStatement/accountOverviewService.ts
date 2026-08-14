import "server-only";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { getBankStatementRepository } from "@/lib/finance/bankStatement/repository-factory";
import { computeAccountPeriodSummary, type AccountPeriodSummary } from "@/lib/finance/status";
import type { BankStatementLine, BankStatementLineStatus, BankStatementLineDirection } from "@/lib/finance/bankStatement/types";
import type { FinancialAccountBalance } from "@/lib/finance/types";

/**
 * Missão Financeiro V2.1 (Fase E) — visão operacional de UMA conta financeira (hoje só Stone),
 * combinando o saldo real (cash_movements/account_transfers, já existente) com o extrato
 * importado (bank_statement_lines, novo). Nunca mascara divergência entre o saldo calculado e o
 * saldo informado manualmente pelo usuário (`informedBalance`, já existente em
 * `financial_accounts` — reaproveitado, nenhuma coluna nova).
 */
export interface StoneAccountOverview {
  account: FinancialAccountBalance | null;
  periodFrom: string;
  periodTo: string;
  summary: AccountPeriodSummary;
  /** summary.closingBalance - informedBalance, quando o usuário já conferiu manualmente o saldo do banco. Null quando nunca conferido. */
  divergenceVsInformedBalance: number | null;
  lines: BankStatementLine[];
}

export interface StoneAccountLineFilter {
  status?: BankStatementLineStatus;
  direction?: BankStatementLineDirection;
  dateFrom?: string;
  dateTo?: string;
}

export async function fetchStoneAccountOverview(financialAccountId: string, periodFrom: string, periodTo: string, lineFilter?: StoneAccountLineFilter): Promise<StoneAccountOverview> {
  const financeRepo = getFinanceRepository();
  const bankRepo = getBankStatementRepository();

  const [accounts, cashMovements, transfers, lines] = await Promise.all([
    financeRepo.listFinancialAccounts(),
    financeRepo.listCashMovements(),
    financeRepo.listAccountTransfers(),
    bankRepo.listLines({ financialAccountId, ...lineFilter, dateFrom: lineFilter?.dateFrom ?? periodFrom, dateTo: lineFilter?.dateTo ?? periodTo }),
  ]);

  const account = accounts.find((a) => a.id === financialAccountId) ?? null;
  const accountMovements = cashMovements.filter((m) => m.financialAccountId === financialAccountId);
  const transfersIn = transfers.filter((t) => t.toAccountId === financialAccountId);
  const transfersOut = transfers.filter((t) => t.fromAccountId === financialAccountId);

  const summary = computeAccountPeriodSummary(account?.fixedFundAmount ?? null, accountMovements, transfersIn, transfersOut, periodFrom, periodTo);

  const divergenceVsInformedBalance = account?.informedBalance !== null && account?.informedBalance !== undefined ? Math.round((summary.closingBalance - account.informedBalance) * 100) / 100 : null;

  return { account, periodFrom, periodTo, summary, divergenceVsInformedBalance, lines };
}
