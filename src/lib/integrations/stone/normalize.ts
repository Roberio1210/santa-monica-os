import type { StoneAccountTransaction, StoneConciliationFile, StoneTransaction } from "@/lib/integrations/stone/types";

/**
 * Normalização Stone → Santa Monica OS (Sprint 7.0, Z2). Separação explícita em três camadas
 * (decisão do usuário): Stone XML types (`types.ts`, Z1, nomes exatamente como a documentação
 * oficial) → Stone normalized types (este arquivo, nomes internos claros) → Financial facts
 * (`reasoning/facts.ts`, via `reconciliationSummary.ts`). Nomes que vazariam confusão para o
 * resto do sistema (`WalletPosition`, `PrevisionPaymentDate`, `PaymentDate`) nunca aparecem além
 * daqui — sempre `lastProcessedFinancialPosition`/`expectedPaymentDate`/`settledPaymentDate`.
 *
 * Cada registro normalizado mantém o dado original relevante para auditoria (`raw`/campos de
 * identificação) — nunca descarta a evidência, só reorganiza para clareza.
 */

export type NormalizedCardFlow = "debito" | "credito" | "outro";

const DEBIT_ACCOUNT_TYPES = new Set(["1", "3"]); // Débito, Pré-pago Débito
const CREDIT_ACCOUNT_TYPES = new Set(["2", "4"]); // Crédito, Pré-pago Crédito

function classifyCardFlow(accountType: string): NormalizedCardFlow {
  if (DEBIT_ACCOUNT_TYPES.has(accountType)) return "debito";
  if (CREDIT_ACCOUNT_TYPES.has(accountType)) return "credito";
  return "outro";
}

/** Converte `aaaammdd` → `aaaa-mm-dd` e `aaaammddHHmmss` → `aaaa-mm-ddTHH:mm:ss` — nunca reformata um valor que não tenha um desses dois tamanhos exatos (devolve como veio, honesto sobre não reconhecer o formato). */
export function formatStoneDate(compact: string): string {
  if (compact.length === 8) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  if (compact.length === 14) return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(8, 10)}:${compact.slice(10, 12)}:${compact.slice(12, 14)}`;
  return compact;
}

export interface NormalizedCancellation {
  operationKey: string;
  amount: number;
  occurredAt: string;
}

export interface NormalizedSaleTransaction {
  /** NSU — chave real da adquirente, preservada para auditoria (a chave externa estável é gerada por `identity.ts`, não aqui). */
  acquirerTransactionKey: string;
  authorizationCode: string;
  authorizedAt: string;
  capturedAt: string;
  cardFlow: NormalizedCardFlow;
  installmentsCount: number;
  grossAmount: number;
  netAmount: number;
  feeAmount: number;
  brandId: number;
  terminalSerialNumber: string | null;
  cancellations: NormalizedCancellation[];
  /** Registro bruto completo — preservado para auditoria quando um detalhe não coberto pelos campos acima for necessário. */
  raw: StoneTransaction;
}

export interface NormalizedChargeback {
  id: string;
  saleExternalReference: string;
  amount: number;
  occurredAt: string;
}

export interface NormalizedChargebackRefund {
  id: string;
  saleExternalReference: string;
  amount: number;
  occurredAt: string;
}

/** Renomeado de `PrevisionPaymentDate` — o que a venda AINDA espera receber, nunca confundido com o que já foi liquidado. */
export interface NormalizedExpectedPayment {
  saleExternalReference: string;
  installmentNumber: number;
  amount: number;
  expectedPaymentDate: string | null;
}

/** Repasse bancário efetivamente liquidado — só existe quando `StonePayment.id` está preenchido (a própria doc: "só em dias com pagamento efetivamente liquidado"). */
export interface NormalizedRealizedPayment {
  paymentId: string;
  amount: number;
  walletTypeId: number;
  bankAccount: { bankCode: string; bankBranch: string; accountNumber: string } | null;
}

/** Renomeado de `PaymentDate` (no contexto de antecipação) — só existe quando há financiamento de antecipação real (`advanceRateAmount` presente). */
export interface NormalizedAdvance {
  saleExternalReference: string;
  installmentNumber: number;
  advanceFeeAmount: number;
  originalExpectedPaymentDate: string | null;
  settledPaymentDate: string;
}

/**
 * Renomeado de `WalletPosition` — NUNCA "saldo disponível"/"saldo em tempo real" (decisão do
 * usuário, Z1). É a posição registrada no arquivo diário processado, nada além disso.
 */
export interface NormalizedFinancialPosition {
  amount: number;
  category: string;
  walletTypeId: number;
}

export interface NormalizedConciliation {
  referenceDate: string;
  generationDateTime: string;
  establishmentCode: string;
  layout: "XML2_2" | "XML2_4";

  sales: NormalizedSaleTransaction[];
  chargebacks: NormalizedChargeback[];
  chargebackRefunds: NormalizedChargebackRefund[];
  expectedPayments: NormalizedExpectedPayment[];
  realizedPayments: NormalizedRealizedPayment[];
  advances: NormalizedAdvance[];
  /** Vazio quando o arquivo não tem o container (Layout 2.2, ou dia sem posição registrada). */
  financialPositions: NormalizedFinancialPosition[];
  /** Distintos, coletados de `Poi.SerialNumber` — "estabelecimentos ou terminais, quando disponíveis". */
  terminalSerialNumbers: string[];
}

function normalizeSale(tx: StoneTransaction): NormalizedSaleTransaction {
  const netAmount = tx.installments.length > 0 ? tx.installments.reduce((sum, i) => sum + i.netAmount, 0) : tx.capturedAmount;
  return {
    acquirerTransactionKey: tx.acquirerTransactionKey,
    authorizationCode: tx.issuerAuthorizationCode,
    authorizedAt: formatStoneDate(tx.authorizationDateTime),
    capturedAt: formatStoneDate(tx.captureLocalDateTime),
    cardFlow: classifyCardFlow(tx.accountType),
    installmentsCount: tx.numberOfInstallments,
    grossAmount: tx.capturedAmount,
    netAmount,
    feeAmount: Math.max(0, tx.capturedAmount - netAmount),
    brandId: tx.brandId,
    terminalSerialNumber: tx.poi.serialNumber,
    cancellations: tx.cancellations.map((c) => ({ operationKey: c.operationKey, amount: c.returnedAmount, occurredAt: formatStoneDate(c.cancellationDateTime) })),
    raw: tx,
  };
}

function chargebacksFromTransaction(tx: StoneTransaction): NormalizedChargeback[] {
  return tx.installments
    .filter((i) => i.chargeback !== null)
    .map((i) => ({ id: i.chargeback!.id, saleExternalReference: tx.acquirerTransactionKey, amount: i.chargeback!.amount, occurredAt: formatStoneDate(i.chargeback!.date) }));
}

function chargebackRefundsFromTransaction(tx: StoneTransaction): NormalizedChargebackRefund[] {
  return tx.installments
    .filter((i) => i.chargebackRefund !== null)
    .map((i) => ({ id: i.chargebackRefund!.id, saleExternalReference: tx.acquirerTransactionKey, amount: i.chargebackRefund!.amount, occurredAt: formatStoneDate(i.chargebackRefund!.date) }));
}

function expectedPaymentsFromTransaction(tx: StoneTransaction): NormalizedExpectedPayment[] {
  return tx.installments.map((i) => ({
    saleExternalReference: tx.acquirerTransactionKey,
    installmentNumber: i.installmentNumber,
    amount: i.netAmount,
    expectedPaymentDate: i.previsionPaymentDate ? formatStoneDate(i.previsionPaymentDate) : null,
  }));
}

function advancesFromAccountTransaction(tx: StoneAccountTransaction): NormalizedAdvance[] {
  return tx.installments
    .filter((i) => i.advanceRateAmount !== null)
    .map((i) => ({
      saleExternalReference: tx.acquirerTransactionKey,
      installmentNumber: i.installmentNumber,
      advanceFeeAmount: i.advanceRateAmount!,
      originalExpectedPaymentDate: i.advancedReceivableOriginalPaymentDate ? formatStoneDate(i.advancedReceivableOriginalPaymentDate) : null,
      settledPaymentDate: formatStoneDate(i.paymentDate),
    }));
}

export function normalizeConciliation(file: StoneConciliationFile): NormalizedConciliation {
  const terminalSerialNumbers = Array.from(new Set(file.financialTransactions.map((tx) => tx.poi.serialNumber).filter((s): s is string => s !== null)));

  return {
    referenceDate: formatStoneDate(file.header.referenceDate),
    generationDateTime: formatStoneDate(file.header.generationDateTime),
    establishmentCode: file.header.stoneCode,
    layout: file.layout,
    sales: file.financialTransactions.map(normalizeSale),
    chargebacks: file.financialTransactions.flatMap(chargebacksFromTransaction),
    chargebackRefunds: file.financialTransactions.flatMap(chargebackRefundsFromTransaction),
    expectedPayments: file.financialTransactions.flatMap(expectedPaymentsFromTransaction),
    realizedPayments: file.payments
      .filter((p) => p.id !== null)
      .map((p) => ({
        paymentId: p.id as string,
        amount: p.totalAmount,
        walletTypeId: p.walletTypeId,
        bankAccount: p.favoredBankAccount ? { bankCode: p.favoredBankAccount.bankCode, bankBranch: p.favoredBankAccount.bankBranch, accountNumber: p.favoredBankAccount.bankAccountNumber } : null,
      })),
    advances: file.financialTransactionsAccounts.flatMap(advancesFromAccountTransaction),
    financialPositions: file.walletPositions.map((w) => ({ amount: w.amount, category: w.category, walletTypeId: w.walletTypeId })),
    terminalSerialNumbers,
  };
}
