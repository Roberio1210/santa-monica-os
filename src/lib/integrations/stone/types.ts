/**
 * Tipos da integração Stone — Conciliação Cliente Stone (Sprint 7.0, Z1). Baseado exclusivamente
 * na documentação oficial: https://conciliacao.stone.com.br/reference/overview-da-api-cliente-stone.
 * Nenhum campo aqui foi inventado — cada um corresponde a um campo real documentado. Onde a
 * documentação não detalhou algo (ex.: campos condicionais), o comentário explica a condição real
 * documentada, nunca uma suposição nossa.
 *
 * Convenção: identificadores (PaymentId, EventId, StoneCode, chaves de transação) são tipados
 * como `string` mesmo quando a doc os descreve como "Num" — evita perda de precisão/zeros à
 * esquerda em números de 9+ dígitos, mesma prática já usada para IDs em todo o projeto. Valores
 * monetários, quantidades e contadores são `number`.
 *
 * Independência de camada: `integrations/stone/` nunca importa de `zezinho/` — mesma disciplina já
 * praticada por `integrations/weather/` e `integrations/jumppark/`. `StoneResultStatus` replica
 * (não importa) `ToolResultStatus` (`zezinho/tools/types.ts`) porque é o mesmo vocabulário de
 * honestidade sobre disponibilidade de dado já usado desde a Sprint 4/5.
 */

// --- Enums e tabelas de código documentadas ---

/** 1 Débito, 2 Crédito, 3 Pré-pago Débito (desde 22/05/2023), 4 Pré-pago Crédito (desde 22/05/2023), 5 Voucher, 10 Boleto. */
export type StoneAccountType = 1 | 2 | 3 | 4 | 5 | 10;

/**
 * 1 Visa, 2 MasterCard, 3 Amex, 4 Cabal, 5 UnionPay, 9 Hipercard, 171 Elo. Para boleto, o valor é
 * "1" concatenado ao número do banco emissor (ex.: Santander = 1033) — por isso o tipo aceita
 * qualquer número, não só os 7 códigos de bandeira.
 */
export type StoneBrandId = number;

/** 1 Chip&Pin, 2 Tarja magnética, 3 Código de barras, 4 OCR, 5 Cartão de circuito integrado, 7 Aproximação (ICC), 80 Fallback ICC→tarja, 81 E-commerce, 90 Tarja completa (trilha 2), 91 Aproximação por tarja. */
export type StoneEntryMode = 1 | 2 | 3 | 4 | 5 | 7 | 80 | 81 | 90 | 91;

/** 1 POS, 2 Micro POS, 3 TEF, 4 E-commerce, 5 Pinpad, 6 Software, 7 Aplicativo. */
export type StonePoiType = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** 1 À vista lojista, 2 Parcelado lojista, 3 Parcelado emissor. */
export type StoneInstallmentType = 1 | 2 | 3;

/** 1 FeeNegotiation (taxas de antecipação/MDR separadas), 2 Sales Fee (taxa única combinada), 255 Default. */
export type StoneFeeType = 1 | 2 | 255;

/**
 * 2 InternalTransfer, 5 FinancialAdjustment, 8 Split, 10 Charge, 11 CrossBalance, 12 LoanPayment,
 * 13 CrossBalanceCrossAccount, 14 Guarantee, 15 OwnershipAssignment, 17 PrepaymentDisbursement
 * ("Antecipação Stone"), 18 PrepaymentWithdraw, 19 PrepaymentDeposit, 20 PrepaymentFee.
 */
export type StoneEventType = 2 | 5 | 8 | 10 | 11 | 12 | 13 | 14 | 15 | 17 | 18 | 19 | 20;

/**
 * Identificador do arranjo de pagamento (bandeira + débito/crédito/antecipação). Ex.: 2 Visa
 * Débito, 3 Visa Crédito, 4 Visa Antecipação, 17 Boleto — tabela completa com ~28 valores na
 * documentação (`/reference/wallettypeid`); mantido como `number` aberto porque a Stone pode
 * adicionar arranjos novos sem aviso.
 */
export type StoneWalletTypeId = number;

/** 1 Default (agenda normal), 5 Warranty (garantia), 7 OwnershipAssignment (cessão), 8 InternalOwnershipAssignment (cessão com antecipação Stone). */
export type StoneWalletNatureId = 1 | 5 | 7 | 8;

// --- Estruturas comuns (reaproveitadas por Transaction e AccountTransaction) ---

/** Contadores dos eventos da transação no dia de referência — nunca os eventos em si, só as quantidades. */
export interface StoneEventCounters {
  cancellationCharges: number;
  cancellation: number;
  captures: number;
  chargebackRefunds: number;
  chargebacks: number;
  payments: number;
}

export interface StonePoi {
  poiType: StonePoiType;
  /** Só presente quando `poiType === 1` (POS) — documentação explícita. */
  serialNumber: string | null;
}

/** Lista de cobranças relativa a um cancelamento — só existe quando o cancelamento ocorreu fora do dia de captura. */
export interface StoneBilling {
  chargedAmount: number;
  previsionChargeDate: string;
}

export interface StoneCancellation {
  paymentId: string;
  operationKey: string;
  /** Só em cancelamentos parciais — ausente em cancelamento total. */
  installmentNumber: number | null;
  cancellationDateTime: string;
  returnedAmount: number;
  billing: StoneBilling | null;
}

export interface StoneChargeback {
  paymentId: string;
  id: string;
  amount: number;
  date: string;
  chargeDate: string;
  /** Pode ser nulo quando o motivo é classificado como "Compliance" e não vem do banco emissor. */
  reasonCode: number | null;
}

export interface StoneChargebackRefund {
  paymentId: string;
  id: string;
  amount: number;
  date: string;
  paymentDate: string;
  reasonCode: number | null;
}

/** Parcela dentro de `FinancialTransactions.Transaction` — nunca dentro de `FinancialTransactionsAccounts` (ver `StoneAccountInstallment`). */
export interface StoneInstallment {
  installmentNumber: number;
  grossAmount: number;
  netAmount: number;
  /** Ausente quando a parcela está suspensa (ex.: por chargeback). */
  previsionPaymentDate: string | null;
  /** Presente só quando `FeeType === 2` (taxa única combinada). */
  saleFee: number | null;
  /** Presente só quando `FeeType !== 2` (taxas separadas). */
  mdrAmount: number | null;
  /** Presente em cancelamentos parciais. */
  originalPaymentDate: string | null;
  suspendedByChargeback: boolean | null;
  chargeback: StoneChargeback | null;
  chargebackRefund: StoneChargebackRefund | null;
}

/** Venda/captura — o registro central de `FinancialTransactions`. */
export interface StoneTransaction {
  events: StoneEventCounters;
  acquirerTransactionKey: string;
  /** "Nosso Número" para boleto; código recebido pelo sistema cliente nos demais casos. */
  initiatorTransactionKey: string | null;
  authorizationDateTime: string;
  captureLocalDateTime: string;
  international: boolean;
  /**
   * Raw (Alfa4 na doc do campo em `Transaction`) — a tabela de referência `StoneAccountType`
   * (enum numérico) descreve os mesmos códigos, mas a doc do campo em si tipa como texto; mantido
   * como `string` para nunca forçar uma conversão não confirmada. Comparar com `StoneAccountType`
   * ao interpretar (ex.: `String(1) === accountType`).
   */
  accountType: string;
  /** Raw (Alfa60 na doc do campo) — mesma ressalva de `accountType`; comparar com `StoneInstallmentType` ao interpretar. */
  installmentType: string;
  numberOfInstallments: number;
  authorizedAmount: number;
  capturedAmount: number;
  canceledAmount: number;
  /** Código ISO 4217. */
  authorizationCurrencyCode: number;
  issuerAuthorizationCode: string;
  brandId: StoneBrandId;
  /** Número do cartão truncado — nunca o PAN completo. */
  cardNumber: string;
  poi: StonePoi;
  entryMode: StoneEntryMode;
  /** Só presente quando há eventos de cancelamento no dia. */
  cancellations: StoneCancellation[];
  installments: StoneInstallment[];
}

/** Parcela dentro de `FinancialTransactionsAccounts.Transaction` — campos de antecipação vivem aqui, nunca em `StoneInstallment`. */
export interface StoneAccountInstallment {
  installmentNumber: number;
  grossAmount: number;
  netAmount: number;
  paymentDate: string;
  /** Valor cobrado pela antecipação do recebível — só quando há financiamento de antecipação e `FeeType !== 2`. */
  advanceRateAmount: number | null;
  mdrAmount: number | null;
  /** Taxa única (antecipação + MDR combinadas) — só quando `FeeType === 2`. */
  saleFee: number | null;
  /** Data em que o recebível seria pago sem a antecipação — presente junto com `advanceRateAmount`. */
  advancedReceivableOriginalPaymentDate: string | null;
  /** Referência ao elemento de `Payments` que liquidou esta parcela. */
  paymentId: string;
  chargeback: StoneChargeback | null;
  chargebackRefund: StoneChargebackRefund | null;
}

/** Mesma transação de `FinancialTransactions`, na visão de "contas"/liquidação (usada para antecipação — ver seção 1.2 do documento de arquitetura). */
export interface StoneAccountTransaction {
  events: StoneEventCounters;
  acquirerTransactionKey: string;
  initiatorTransactionKey: string | null;
  authorizationDateTime: string;
  captureLocalDateTime: string;
  poi: StonePoi;
  cancellations: StoneCancellation[];
  installments: StoneAccountInstallment[];
}

/** Evento financeiro (liquidação, ajuste, antecipação, etc.) — `FinancialEvents.Event`. */
export interface StoneFinancialEvent {
  eventId: string;
  description: string;
  type: StoneEventType;
  previsionPaymentDate: string | null;
  amount: number;
  /** StoneCode da contraparte — só em transferências internas (positivo/negativo conforme envio/recebimento). */
  linkedMerchant: string | null;
}

/** Evento na visão de "contas" (`FinancialEventsAccounts.Events`) — usado para splits. */
export interface StoneAccountEvent {
  eventId: string;
  description: string;
  /** Sinal indica crédito/débito (ex.: -22 débito, 5 crédito) — não é o mesmo domínio de `StoneEventType`. */
  type: number;
  /** Só em splits. */
  acquirerTransactionKey: string | null;
  /** Só em splits. */
  installmentNumber: number | null;
  paymentDate: string;
  /** Só em transferências internas, splits e cross-balance cross-account. */
  linkedMerchant: string | null;
  amount: number;
  /** Só em splits (arquivo da contraparte do split). */
  advanceRateAmount: number | null;
}

export interface StoneFavoredBankAccount {
  bankCode: string;
  bankBranch: string;
  bankAccountNumber: string;
}

/** Repasse bancário — `Payments.Payment`. */
export interface StonePayment {
  /** Só preenchido em dias com pagamento efetivamente liquidado. */
  id: string | null;
  walletTypeId: StoneWalletTypeId;
  /** Valor depositado na conta do lojista. */
  totalAmount: number;
  /** Campo descontinuado pela Stone — sempre enviado como zero quando o saldo da carteira fica negativo. Mantido só por completude da doc. */
  totalFinancialAccountsAmount: number | null;
  /** Só preenchido quando o cliente tem saldo negativo pendente com a Stone. */
  lastNegativeAmount: number | null;
  favoredBankAccount: StoneFavoredBankAccount | null;
}

/**
 * Posição de carteira/saldo — só existe no Layout 2.4. NUNCA representa saldo em tempo real: é a
 * posição do arquivo diário processado (decisão do usuário, ver seção 3.1 do documento de
 * arquitetura) — `amount` é "valor total do saldo" daquela carteira NAQUELE dia, nunca "agora".
 */
export interface StoneWalletPosition {
  walletTypeId: StoneWalletTypeId;
  walletNatureId: StoneWalletNatureId;
  category: string;
  amount: number;
}

/** Contadores de fechamento do arquivo — nunca um resumo de negócio, só quantidades brutas. */
export interface StoneTrailer {
  capturedTransactionsQuantity: number;
  canceledTransactionsQuantity: number;
  paidInstallmentsQuantity: number;
  chargedCancellationsQuantity: number;
  chargebacksQuantity: number;
  chargebacksRefundQuantity: number;
  chargedChargebacksQuantity: number;
  paidChargebacksRefundQuantity: number;
  paidEventsQuantity: number;
  chargedEventsQuantity: number;
}

export interface StoneHeader {
  /** Formato aaaammddHHmmss. */
  generationDateTime: string;
  stoneCode: string;
  layoutVersion: string;
  fileId: string;
  /** Formato aaaammdd — data a que o arquivo se refere. */
  referenceDate: string;
}

/** O arquivo de conciliação completo — a raiz do XML devolvido pelo endpoint principal. */
export interface StoneConciliationFile {
  header: StoneHeader;
  financialTransactions: StoneTransaction[];
  financialEvents: StoneFinancialEvent[];
  financialTransactionsAccounts: StoneAccountTransaction[];
  financialEventsAccounts: StoneAccountEvent[];
  payments: StonePayment[];
  /** Sempre `[]` no Layout 2.2 — container não existe nesse layout. */
  walletPositions: StoneWalletPosition[];
  trailer: StoneTrailer;
  layout: "XML2_2" | "XML2_4";
}

// --- PIX (arquivo/fluxo separado) ---

export type StonePixSaleStatus = "paid" | "canceled";

/** Um registro do arquivo CSV de PIX — nomes de campo mantidos próximos ao `snake_case` original da doc, convertidos para camelCase. */
export interface StonePixTransaction {
  id: string;
  /** Valor bruto da captura. */
  amount: number;
  status: StonePixSaleStatus;
  paymentMethod: string;
  /** Data de criação da venda, em UTC. */
  createdAt: string;
  merchantDocument: string;
  pixType: string;
  /** Identificação de rastreamento do PIX (end-to-end id). */
  pixE2eId: string;
  pixKey: string;
  isPixSaleKey: boolean;
  paidAmount: number;
  canceledAmount: number;
  feeAmount: number;
  expiresIn: string | null;
  payerName: string | null;
  payerDocumentType: string | null;
  payerDocument: string | null;
  /** Código do banco do pagador dado pelo Banco Central. */
  payerIspb: string | null;
  payerInstitutionName: string | null;
  terminalType: string | null;
  terminalSerialNumber: string | null;
  /** Status do evento financeiro relacionado. */
  eventOperation: string | null;
  eventProviderDatetime: string | null;
  eventOperationAmount: number | null;
  qrcodeContent: string | null;
  description: string | null;
  refundId: string | null;
  refundReason: string | null;
}

/** Payload que a Stone envia ao nosso webhook quando o arquivo PIX assíncrono fica pronto. */
export interface StoneWebhookNotificationPayload {
  type: "pix";
  /** URL pré-assinada — download direto, nenhuma outra chamada necessária. */
  url: string;
  document: string;
  /** Formato AAAA-MM-DD. */
  referenceDate: string;
}

// --- Status e resultados normalizados (mesmo vocabulário de ToolResultStatus, zezinho/tools/types.ts) ---

export type StoneResultStatus = "ok" | "not_configured" | "temporary_failure" | "stale_data" | "insufficient_permission" | "no_data";

interface StoneResultBase {
  status: StoneResultStatus;
  error: string | null;
  /** Quando este resultado foi obtido — não necessariamente igual à data de referência do arquivo. */
  collectedAt: string;
  limitations: string[];
}

export interface StoneConciliationResult extends StoneResultBase {
  file: StoneConciliationFile | null;
  referenceDate: string;
}

/**
 * Wrapper honesto para `WalletPosition` — nunca chamado de "saldo disponível" em nenhum lugar do
 * sistema (decisão do usuário, seção 3.1 do documento de arquitetura). Sempre carrega a data do
 * arquivo e o instante do processamento, para que quem consome nunca confunda com saldo em tempo
 * real.
 */
export interface StoneWalletPositionResult extends StoneResultBase {
  positions: StoneWalletPosition[];
  /** Data de referência do arquivo de onde a posição foi extraída — `null` quando `status !== "ok"`. */
  referenceDate: string | null;
  /** Instante em que nosso sistema processou esse arquivo — nunca "agora" para efeito de saldo. */
  processedAt: string | null;
}

export type StonePixRequestStatus = "requested" | "not_configured" | "temporary_failure" | "insufficient_permission";

/** Resultado de pedir a geração do arquivo PIX — sempre assíncrono; o arquivo em si chega depois via webhook. */
export interface StonePixFileRequestResult {
  status: StonePixRequestStatus;
  error: string | null;
  referenceDate: string;
  requestedAt: string;
}

// --- Configuração ---

export interface StoneEnv {
  apiKey: string;
  /** Mapeado da variável `STONE_ACCOUNT_ID` — corresponde ao `affiliationCode`/StoneCode da documentação. */
  affiliationCode: string;
}
