import { XMLParser } from "fast-xml-parser";
import type {
  StoneAccountEvent,
  StoneAccountInstallment,
  StoneAccountTransaction,
  StoneBilling,
  StoneCancellation,
  StoneChargeback,
  StoneChargebackRefund,
  StoneConciliationFile,
  StoneEntryMode,
  StoneEventCounters,
  StoneFavoredBankAccount,
  StoneFinancialEvent,
  StoneHeader,
  StoneInstallment,
  StonePayment,
  StonePoi,
  StonePoiType,
  StoneTrailer,
  StoneTransaction,
  StoneWalletNatureId,
  StoneWalletPosition,
} from "@/lib/integrations/stone/types";

/**
 * Parser do XML de conciliação → tipos de `types.ts`. Estrutura de aninhamento confirmada contra
 * o exemplo oficial "Arquivo completo - Layout 2.4"
 * (https://conciliacao.stone.com.br/reference/arquivo-completo-layout-24-1):
 * `Conciliation > Header`, `FinancialTransactions > Transaction`, `FinancialEvents > Event`,
 * `FinancialTransactionsAccounts > Transaction > Installments > Installment`,
 * `FinancialEventsAccounts > Event`, `Payments > Payment > FavoredBankAccount`,
 * `WalletPosition > Wallets > Wallet`, `Trailer` (sem repetição).
 *
 * `FinancialTransactionsExpected`/`FinancialEventsExpected` (Layout 2.4, "eventos previstos que
 * não se concretizaram") existem no XML mas são deliberadamente omitidos de `StoneConciliationFile`
 * — não fazem parte dos 11 itens pedidos nem das decisões já tomadas (ver
 * docs/stone-integration-architecture.md, seção 3.2: agenda/saldo futuro é cálculo do Diretor
 * Financeiro, nunca um container pronto da Stone).
 *
 * Nenhum `any` — o resultado bruto do parser é tratado como `unknown` e só acessado através dos
 * helpers abaixo, que nunca lançam para um campo ausente (devolvem `""`/`0`/`null`/`[]` honestos).
 */

const parser = new XMLParser({ ignoreAttributes: true, parseTagValue: false, trimValues: true });

function field(node: unknown, key: string): unknown {
  if (node === null || node === undefined || typeof node !== "object") return undefined;
  return (node as Record<string, unknown>)[key];
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null || value === "") return [];
  return Array.isArray(value) ? value : [value];
}

function str(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function strOrNull(value: unknown): string | null {
  return value === undefined || value === null || value === "" ? null : String(value);
}

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isNaN(n) ? 0 : n;
}

function numOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

function bool(value: unknown): boolean {
  return String(value).toLowerCase() === "true";
}

function boolOrNull(value: unknown): boolean | null {
  return value === undefined || value === null ? null : bool(value);
}

function mapHeader(raw: unknown): StoneHeader {
  return {
    generationDateTime: str(field(raw, "GenerationDateTime")),
    stoneCode: str(field(raw, "StoneCode")),
    layoutVersion: str(field(raw, "LayoutVersion")),
    fileId: str(field(raw, "FileId")),
    referenceDate: str(field(raw, "ReferenceDate")),
  };
}

function mapEventCounters(raw: unknown): StoneEventCounters {
  return {
    cancellationCharges: num(field(raw, "CancellationCharges")),
    cancellation: num(field(raw, "Cancellation")),
    captures: num(field(raw, "Captures")),
    chargebackRefunds: num(field(raw, "ChargebackRefunds")),
    chargebacks: num(field(raw, "Chargebacks")),
    payments: num(field(raw, "Payments")),
  };
}

function mapPoi(raw: unknown): StonePoi {
  return { poiType: num(field(raw, "PoiType")) as StonePoiType, serialNumber: strOrNull(field(raw, "SerialNumber")) };
}

function mapBilling(raw: unknown): StoneBilling | null {
  if (raw === undefined || raw === null) return null;
  return { chargedAmount: num(field(raw, "ChargedAmount")), previsionChargeDate: str(field(raw, "PrevisionChargeDate")) };
}

function mapCancellation(raw: unknown): StoneCancellation {
  return {
    paymentId: str(field(raw, "PaymentId")),
    operationKey: str(field(raw, "OperationKey")),
    installmentNumber: numOrNull(field(raw, "InstallmentNumber")),
    cancellationDateTime: str(field(raw, "CancellationDateTime")),
    returnedAmount: num(field(raw, "ReturnedAmount")),
    billing: mapBilling(field(raw, "Billing")),
  };
}

function mapChargeback(raw: unknown): StoneChargeback | null {
  if (raw === undefined || raw === null) return null;
  return {
    paymentId: str(field(raw, "PaymentId")),
    id: str(field(raw, "Id")),
    amount: num(field(raw, "Amount")),
    date: str(field(raw, "Date")),
    chargeDate: str(field(raw, "ChargeDate")),
    reasonCode: numOrNull(field(raw, "ReasonCode")),
  };
}

function mapChargebackRefund(raw: unknown): StoneChargebackRefund | null {
  if (raw === undefined || raw === null) return null;
  return {
    paymentId: str(field(raw, "PaymentId")),
    id: str(field(raw, "Id")),
    amount: num(field(raw, "Amount")),
    date: str(field(raw, "Date")),
    paymentDate: str(field(raw, "PaymentDate")),
    reasonCode: numOrNull(field(raw, "ReasonCode")),
  };
}

function mapInstallment(raw: unknown): StoneInstallment {
  return {
    installmentNumber: num(field(raw, "InstallmentNumber")),
    grossAmount: num(field(raw, "GrossAmount")),
    netAmount: num(field(raw, "NetAmount")),
    previsionPaymentDate: strOrNull(field(raw, "PrevisionPaymentDate")),
    saleFee: numOrNull(field(raw, "SaleFee")),
    mdrAmount: numOrNull(field(raw, "MdrAmount")),
    originalPaymentDate: strOrNull(field(raw, "OriginalPaymentDate")),
    suspendedByChargeback: boolOrNull(field(raw, "SuspendedByChargeback")),
    chargeback: mapChargeback(field(raw, "Chargeback")),
    chargebackRefund: mapChargebackRefund(field(raw, "ChargebackRefund")),
  };
}

function mapAccountInstallment(raw: unknown): StoneAccountInstallment {
  return {
    installmentNumber: num(field(raw, "InstallmentNumber")),
    grossAmount: num(field(raw, "GrossAmount")),
    netAmount: num(field(raw, "NetAmount")),
    paymentDate: str(field(raw, "PaymentDate")),
    advanceRateAmount: numOrNull(field(raw, "AdvanceRateAmount")),
    mdrAmount: numOrNull(field(raw, "MdrAmount")),
    saleFee: numOrNull(field(raw, "SaleFee")),
    advancedReceivableOriginalPaymentDate: strOrNull(field(raw, "AdvancedReceivableOriginalPaymentDate")),
    paymentId: str(field(raw, "PaymentId")),
    chargeback: mapChargeback(field(raw, "Chargeback")),
    chargebackRefund: mapChargebackRefund(field(raw, "ChargebackRefund")),
  };
}

function mapTransaction(raw: unknown): StoneTransaction {
  return {
    events: mapEventCounters(field(raw, "Events")),
    acquirerTransactionKey: str(field(raw, "AcquirerTransactionKey")),
    initiatorTransactionKey: strOrNull(field(raw, "InitiatorTransactionKey")),
    authorizationDateTime: str(field(raw, "AuthorizationDateTime")),
    captureLocalDateTime: str(field(raw, "CaptureLocalDateTime")),
    international: bool(field(raw, "International")),
    accountType: str(field(raw, "AccountType")),
    installmentType: str(field(raw, "InstallmentType")),
    numberOfInstallments: num(field(raw, "NumberOfInstallments")),
    authorizedAmount: num(field(raw, "AuthorizedAmount")),
    capturedAmount: num(field(raw, "CapturedAmount")),
    canceledAmount: num(field(raw, "CanceledAmount")),
    authorizationCurrencyCode: num(field(raw, "AuthorizationCurrencyCode")),
    issuerAuthorizationCode: str(field(raw, "IssuerAuthorizationCode")),
    brandId: num(field(raw, "BrandId")),
    cardNumber: str(field(raw, "CardNumber")),
    poi: mapPoi(field(raw, "Poi")),
    entryMode: num(field(raw, "EntryMode")) as StoneEntryMode,
    cancellations: toArray(field(field(raw, "Cancellations"), "Cancellation")).map(mapCancellation),
    installments: toArray(field(field(raw, "Installments"), "Installment")).map(mapInstallment),
  };
}

function mapAccountTransaction(raw: unknown): StoneAccountTransaction {
  return {
    events: mapEventCounters(field(raw, "Events")),
    acquirerTransactionKey: str(field(raw, "AcquirerTransactionKey")),
    initiatorTransactionKey: strOrNull(field(raw, "InitiatorTransactionKey")),
    authorizationDateTime: str(field(raw, "AuthorizationDateTime")),
    captureLocalDateTime: str(field(raw, "CaptureLocalDateTime")),
    poi: mapPoi(field(raw, "Poi")),
    cancellations: toArray(field(field(raw, "Cancellations"), "Cancellation")).map(mapCancellation),
    installments: toArray(field(field(raw, "Installments"), "Installment")).map(mapAccountInstallment),
  };
}

function mapFinancialEvent(raw: unknown): StoneFinancialEvent {
  return {
    eventId: str(field(raw, "EventId")),
    description: str(field(raw, "Description")),
    type: num(field(raw, "Type")) as StoneFinancialEvent["type"],
    previsionPaymentDate: strOrNull(field(raw, "PrevisionPaymentDate")),
    amount: num(field(raw, "Amount")),
    linkedMerchant: strOrNull(field(raw, "LinkedMerchant")),
  };
}

function mapAccountEvent(raw: unknown): StoneAccountEvent {
  return {
    eventId: str(field(raw, "EventId")),
    description: str(field(raw, "Description")),
    type: num(field(raw, "Type")),
    acquirerTransactionKey: strOrNull(field(raw, "AcquirerTransactionKey")),
    installmentNumber: numOrNull(field(raw, "InstallmentNumber")),
    paymentDate: str(field(raw, "PaymentDate")),
    linkedMerchant: strOrNull(field(raw, "LinkedMerchant")),
    amount: num(field(raw, "Amount")),
    advanceRateAmount: numOrNull(field(raw, "AdvanceRateAmount")),
  };
}

function mapFavoredBankAccount(raw: unknown): StoneFavoredBankAccount | null {
  if (raw === undefined || raw === null) return null;
  return { bankCode: str(field(raw, "BankCode")), bankBranch: str(field(raw, "BankBranch")), bankAccountNumber: str(field(raw, "BankAccountNumber")) };
}

function mapPayment(raw: unknown): StonePayment {
  return {
    id: strOrNull(field(raw, "Id")),
    walletTypeId: num(field(raw, "WalletTypeId")),
    totalAmount: num(field(raw, "TotalAmount")),
    totalFinancialAccountsAmount: numOrNull(field(raw, "TotalFinancialAccountsAmount")),
    lastNegativeAmount: numOrNull(field(raw, "LastNegativeAmount")),
    favoredBankAccount: mapFavoredBankAccount(field(raw, "FavoredBankAccount")),
  };
}

function mapWallet(raw: unknown): StoneWalletPosition {
  return {
    walletTypeId: num(field(raw, "WalletTypeId")),
    walletNatureId: num(field(raw, "WalletNatureId")) as StoneWalletNatureId,
    category: str(field(raw, "Category")),
    amount: num(field(raw, "Amount")),
  };
}

function mapTrailer(raw: unknown): StoneTrailer {
  return {
    capturedTransactionsQuantity: num(field(raw, "CapturedTransactionsQuantity")),
    canceledTransactionsQuantity: num(field(raw, "CanceledTransactionsQuantity")),
    paidInstallmentsQuantity: num(field(raw, "PaidInstallmentsQuantity")),
    chargedCancellationsQuantity: num(field(raw, "ChargedCancellationsQuantity")),
    chargebacksQuantity: num(field(raw, "ChargebacksQuantity")),
    chargebacksRefundQuantity: num(field(raw, "ChargebacksRefundQuantity")),
    chargedChargebacksQuantity: num(field(raw, "ChargedChargebacksQuantity")),
    paidChargebacksRefundQuantity: num(field(raw, "PaidChargebacksRefundQuantity")),
    paidEventsQuantity: num(field(raw, "PaidEventsQuantity")),
    chargedEventsQuantity: num(field(raw, "ChargedEventsQuantity")),
  };
}

export class StoneInvalidXmlError extends Error {
  constructor() {
    super("XML de conciliação Stone inválido — elemento <Conciliation>/<Header> ausente ou malformado.");
    this.name = "StoneInvalidXmlError";
  }
}

/**
 * `layout` vem de quem pediu o arquivo (`service.ts`) — o XML em si não declara isso de forma
 * própria além de `Header.LayoutVersion`. Lança `StoneInvalidXmlError` quando o texto recebido
 * não é um XML de conciliação real (sem `<Conciliation>`/`<Header>` reconhecíveis) — nunca
 * confundido com "arquivo vazio" (que tem Header real, só sem transações no dia).
 */
export function parseConciliationXml(xml: string, layout: "XML2_2" | "XML2_4"): StoneConciliationFile {
  const parsed: unknown = parser.parse(xml);
  const root = field(parsed, "Conciliation");
  if (root === undefined || field(root, "Header") === undefined || !str(field(field(root, "Header"), "ReferenceDate"))) {
    throw new StoneInvalidXmlError();
  }

  return {
    header: mapHeader(field(root, "Header")),
    financialTransactions: toArray(field(field(root, "FinancialTransactions"), "Transaction")).map(mapTransaction),
    financialEvents: toArray(field(field(root, "FinancialEvents"), "Event")).map(mapFinancialEvent),
    financialTransactionsAccounts: toArray(field(field(root, "FinancialTransactionsAccounts"), "Transaction")).map(mapAccountTransaction),
    financialEventsAccounts: toArray(field(field(root, "FinancialEventsAccounts"), "Event")).map(mapAccountEvent),
    payments: toArray(field(field(root, "Payments"), "Payment")).map(mapPayment),
    walletPositions: toArray(field(field(field(root, "WalletPosition"), "Wallets"), "Wallet")).map(mapWallet),
    trailer: mapTrailer(field(root, "Trailer")),
    layout,
  };
}
