import "server-only";
import type { FinanceRepository } from "@/lib/finance/repository";
import type { AccountsReceivable, CashMovement, Contract, RecordPaymentInput } from "@/lib/finance/types";
import { initialAccountsReceivable } from "@/lib/finance/data/accounts-receivable";
import { initialCashMovements } from "@/lib/finance/data/cash-movements";
import { initialContracts } from "@/lib/finance/data/contracts";
import { computeOutstanding, computeAccountsReceivableStatus } from "@/lib/finance/status";

/**
 * Implementação em memória, baseada em dados iniciais tipados no código — mesmo padrão de
 * src/lib/inventory/static-repository.ts. Mesma limitação crítica: em ambiente serverless
 * (Vercel), não há garantia de persistência entre invocações. Por isso `recordPayment` está
 * implementado (arquitetura completa), mas nenhuma ação da UI o chama ainda — ver
 * docs/finance-module.md, seção "Segurança".
 */
export interface StaticFinanceRepositorySeed {
  accountsReceivable?: AccountsReceivable[];
  cashMovements?: CashMovement[];
  contracts?: Contract[];
}

export class StaticFinanceRepository implements FinanceRepository {
  private accountsReceivable: AccountsReceivable[];
  private cashMovements: CashMovement[];
  private contracts: Contract[];

  /** Aceita dados iniciais alternativos — usado pelos testes para preparar cenários específicos. */
  constructor(seed: StaticFinanceRepositorySeed = {}) {
    this.accountsReceivable = (seed.accountsReceivable ?? initialAccountsReceivable).map((item) => ({ ...item }));
    this.cashMovements = (seed.cashMovements ?? initialCashMovements).map((item) => ({ ...item }));
    this.contracts = (seed.contracts ?? initialContracts).map((item) => ({ ...item }));
  }

  async listAccountsReceivable(): Promise<AccountsReceivable[]> {
    return this.accountsReceivable.map((item) => ({ ...item }));
  }

  async getAccountsReceivable(id: string): Promise<AccountsReceivable | null> {
    const item = this.accountsReceivable.find((i) => i.id === id);
    return item ? { ...item } : null;
  }

  async recordPayment(input: RecordPaymentInput): Promise<AccountsReceivable> {
    const item = this.accountsReceivable.find((i) => i.id === input.accountsReceivableId);
    if (!item) throw new Error(`Conta a receber não encontrada: ${input.accountsReceivableId}`);

    item.receivedAmount += input.amount;
    item.outstandingAmount = computeOutstanding(item.expectedAmount, item.receivedAmount);
    item.receivedAt = input.paidAt;
    item.paymentMethod = input.method;
    item.status = computeAccountsReceivableStatus(item, input.paidAt);
    item.updatedAt = new Date().toISOString();

    return { ...item };
  }

  async listCashMovements(): Promise<CashMovement[]> {
    return this.cashMovements.map((item) => ({ ...item }));
  }

  async listContracts(): Promise<Contract[]> {
    return this.contracts.map((item) => ({ ...item }));
  }
}
