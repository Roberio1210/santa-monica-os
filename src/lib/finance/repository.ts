import type { AccountsReceivable, CashMovement, Contract, RecordPaymentInput } from "@/lib/finance/types";

/**
 * Contrato de acesso a dados financeiros, desacoplado da implementação — mesmo padrão de
 * src/lib/inventory/repository.ts. Uma futura implementação Postgres deve satisfazer esta
 * mesma interface sem exigir mudança nos componentes que a consomem.
 */
export interface FinanceRepository {
  listAccountsReceivable(): Promise<AccountsReceivable[]>;
  getAccountsReceivable(id: string): Promise<AccountsReceivable | null>;
  /**
   * Registra um recebimento (total ou parcial) e atualiza receivedAmount/outstandingAmount do
   * registro correspondente. Não implementado na UI pública nesta fase (ver Parte 8 —
   * segurança: nenhuma ação de escrita fica exposta sem autenticação).
   */
  recordPayment(input: RecordPaymentInput): Promise<AccountsReceivable>;
  listCashMovements(): Promise<CashMovement[]>;
  listContracts(): Promise<Contract[]>;
}
