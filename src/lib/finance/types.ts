/**
 * Espelha exatamente src/db/schema/finance.ts (accountsReceivable). Qualquer mudança no schema
 * do banco deve ser replicada aqui e vice-versa.
 * "reversed" (estornado) é manual, como "draft"/"cancelled" — nunca recalculado automaticamente
 * (módulo Contas a Receber, adicionado via ALTER TYPE ADD VALUE, sem remover valores existentes).
 */
export type AccountsReceivableStatus = "draft" | "open" | "partially_paid" | "paid" | "overdue" | "cancelled" | "reversed";

export type FinancePaymentMethod =
  | "dinheiro"
  | "debito"
  | "credito"
  | "pix"
  | "boleto"
  | "transferencia"
  | "outro"
  | "desconhecido";

export interface AccountsReceivable {
  id: string;
  customerId: string | null;
  partnerId: string | null;
  contractId: string | null;
  /** Nome do cliente/parceiro para exibição, sem exigir join — preenchido pelo repositório. */
  partyName: string;
  /** Centro de custo da receita (Estética Automotiva, Estacionamento, Administrativo). */
  costCenterId: string | null;
  costCenterName: string | null;
  /** Categoria de receita (Lavação, Polimento, Faróis, etc.), do plano de contas já existente. */
  categoryId: string | null;
  categoryName: string | null;
  /** Conta onde o valor é esperado/foi recebido (Stone, Ailos). */
  financialAccountId: string | null;
  financialAccountName: string | null;
  description: string;
  /** Mês/data de competência — a que período o valor se refere. Nunca a data de recebimento. */
  competenceDate: string;
  issueDate: string | null;
  dueDate: string;
  expectedAmount: number;
  receivedAmount: number;
  /** Sempre expectedAmount - receivedAmount, mantido em sincronia por status.ts. */
  outstandingAmount: number;
  /** Status armazenado (fonte da verdade para draft/cancelled/reversed — os demais podem ser recalculados). */
  status: AccountsReceivableStatus;
  paymentMethod: FinancePaymentMethod;
  invoiceNumber: string | null;
  invoiceIssued: boolean;
  receivedAt: string | null;
  /** Agrupa parcelas da mesma receita (ex.: 4x Stone). Null quando não é parcelado. */
  installmentGroupId: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  /** Taxa cobrada no recebimento (ex.: taxa Stone). Null até haver baixa com taxa informada. */
  feeAmount: number | null;
  /** receivedAmount - feeAmount acumulado das baixas. Null até haver recebimento. */
  netAmount: number | null;
  /** Texto livre — sem sessão de usuário real ainda (mesmo padrão de inventory_movements.responsible). */
  responsibleName: string | null;
  approverName: string | null;
  source: string;
  externalId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountsReceivableView extends AccountsReceivable {
  /** Status recalculado a partir de outstandingAmount/dueDate (ver src/lib/finance/status.ts). */
  computedStatus: AccountsReceivableStatus;
  isOverdue: boolean;
}

export interface RecordPaymentInput {
  accountsReceivableId: string;
  amount: number;
  paidAt: string;
  method: FinancePaymentMethod;
  notes?: string | null;
}

export interface CreateAccountsReceivableInput {
  description: string;
  customerId?: string | null;
  partnerId?: string | null;
  contractId?: string | null;
  costCenterId?: string | null;
  categoryId?: string | null;
  financialAccountId?: string | null;
  competenceDate: string;
  issueDate?: string | null;
  dueDate: string;
  expectedAmount: number;
  paymentMethod?: FinancePaymentMethod;
  invoiceNumber?: string | null;
  invoiceIssued?: boolean;
  notes?: string | null;
  status?: AccountsReceivableStatus;
  responsibleName?: string | null;
  approverName?: string | null;
  /** Quando > 1, gera N parcelas de expectedAmount/installmentTotal, vencendo em meses seguintes. */
  installmentTotal?: number;
  /** Slug estável para idempotência (mesmo padrão de CreateAccountsPayableInput.externalId, Missão Financeiro V2) — reprocessar a mesma origem nunca cria um segundo recebível. Só aplicado quando installmentTotal <= 1. */
  externalId?: string | null;
}

export interface UpdateAccountsReceivableInput {
  id: string;
  description?: string;
  customerId?: string | null;
  partnerId?: string | null;
  contractId?: string | null;
  costCenterId?: string | null;
  categoryId?: string | null;
  financialAccountId?: string | null;
  competenceDate?: string;
  issueDate?: string | null;
  dueDate?: string;
  expectedAmount?: number;
  paymentMethod?: FinancePaymentMethod;
  invoiceNumber?: string | null;
  invoiceIssued?: boolean;
  notes?: string | null;
  responsibleName?: string | null;
  approverName?: string | null;
}

export interface ReceivableSettlement {
  id: string;
  accountsReceivableId: string;
  amount: number;
  paidAt: string | null;
  method: FinancePaymentMethod;
  financialAccountId: string | null;
  /** Taxa descontada nesta baixa específica (ex.: taxa Stone). Null quando não informada. */
  feeAmount: number | null;
  /** amount - feeAmount desta baixa. Igual a amount quando feeAmount é null. */
  netAmount: number | null;
  reversed: boolean;
  reversedAt: string | null;
  notes: string | null;
}

export interface RecordReceivablePaymentInput {
  accountsReceivableId: string;
  amount: number;
  paidAt: string;
  method: FinancePaymentMethod;
  financialAccountId?: string | null;
  /** Taxa cobrada nesta baixa (ex.: taxa Stone). Nunca inventada — só quando realmente informada. */
  feeAmount?: number | null;
  notes?: string | null;
  /** Sem isto, receber mais que outstandingAmount lança ReceivableOverpaymentError. */
  allowOverpayment?: boolean;
}

export type CashMovementType = "entrada" | "saida";

/** Classificação opcional — só relevante para lançamentos manuais (ver schema, cash_movement_nature). */
export type CashMovementNature = "receita" | "despesa" | "ajuste" | "estorno" | "taxa_bancaria" | "tarifa" | "juros";

export interface CashMovement {
  id: string;
  date: string;
  type: CashMovementType;
  nature: CashMovementNature | null;
  amount: number;
  description: string;
  accountsReceivableId: string | null;
  accountsPayableId: string | null;
  categoryId: string | null;
  categoryName: string | null;
  costCenterId: string | null;
  costCenterName: string | null;
  financialAccountId: string | null;
  financialAccountName: string | null;
  paymentId: string | null;
  partnerId: string | null;
  customerId: string | null;
  supplierId: string | null;
  /** Nome resolvido de partner/customer/supplier — o que estiver preenchido, sem exigir join na UI. */
  partyName: string | null;
  responsibleName: string | null;
  documentRef: string | null;
  competenceDate: string | null;
  /** Fotografia do saldo da conta imediatamente antes/depois deste movimento (ver schema). */
  balanceBefore: number | null;
  balanceAfter: number | null;
  source: string;
  externalId: string | null;
  notes: string | null;
}

export interface CreateCashMovementInput {
  date: string;
  type: CashMovementType;
  nature?: CashMovementNature | null;
  amount: number;
  description: string;
  categoryId?: string | null;
  costCenterId?: string | null;
  financialAccountId: string;
  partnerId?: string | null;
  customerId?: string | null;
  supplierId?: string | null;
  responsibleName?: string | null;
  documentRef?: string | null;
  competenceDate?: string | null;
  notes?: string | null;
}

/** Fechamento C8 — corrige a competência de um cash_movement já existente (lacuna real: não havia update para cash_movements antes desta correção). */
export interface UpdateCashMovementCompetenceInput {
  id: string;
  competenceDate: string;
  reason: string;
}

/** Fechamento C8 — reduz o valor de um cash_movement já existente quando um único Pix continha duas naturezas econômicas (ex.: semanal + meta). */
export interface ReduceCashMovementAmountInput {
  id: string;
  newAmount: number;
  reason: string;
}

export interface InformAccountBalanceInput {
  financialAccountId: string;
  informedBalance: number;
}

export type ContractType = "parceria_pos_paga" | "mensalidade";
export type ContractStatus = "ativo" | "suspenso" | "encerrado";

export interface Partner {
  id: string;
  name: string;
  type: "parceria_pos_paga" | "contrato_mensal" | "outro";
}

export interface CreatePartnerInput {
  name: string;
  type: Partner["type"];
  contactName?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
}

/**
 * Missão Financeiro V2 (Prioridade 4) — capacidade operacional de registrar um contrato real
 * (mensalista/parceria). O benefício é opcional e único aqui de propósito: cobre o caso comum
 * (ex.: "6 lavações/mês, não cumulativas") sem construir uma UI de múltiplos benefícios que
 * nenhum contrato real hoje precisa — pode ser estendido quando um caso real exigir mais de um.
 */
export interface CreateContractInput {
  partnerId: string;
  title: string;
  type: ContractType;
  status?: ContractStatus;
  startDate?: string | null;
  endDate?: string | null;
  billingClosingDay?: number | null;
  dueDay?: number | null;
  /** Valor fixo do contrato. Null quando variável — nunca inventado. */
  baseValue?: number | null;
  notes?: string | null;
  benefit?: {
    description: string;
    quantityPerPeriod?: number | null;
    periodType?: string;
    cumulative?: boolean;
  } | null;
}

export interface ContractValuePeriod {
  id: string;
  contractId: string;
  amount: number;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  notes: string | null;
}

export interface ContractBenefit {
  id: string;
  contractId: string;
  description: string;
  quantityPerPeriod: number | null;
  periodType: string;
  cumulative: boolean;
}

// --- Fundação (plano de contas) ---

export type FinancialCategoryType = "receita" | "despesa";

export interface FinancialCategory {
  id: string;
  name: string;
  type: FinancialCategoryType;
}

export interface CostCenter {
  id: string;
  name: string;
}

// --- Contas a Pagar ---

export interface Supplier {
  id: string;
  name: string;
  contactName: string | null;
  taxId: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
}

export type FinancialAccountType = "conta_pagamento" | "conta_bancaria" | "dinheiro";

export interface FinancialAccount {
  id: string;
  name: string;
  type: FinancialAccountType;
  /** Fundo fixo desejado (só relevante para "dinheiro") e limiar de alerta de saldo baixo. */
  fixedFundAmount: number | null;
  /** Saldo conferido manualmente pelo usuário (ex.: olhando extrato) — nunca calculado. */
  informedBalance: number | null;
  informedBalanceAt: string | null;
  notes: string | null;
}

/**
 * Missão Financeiro V4.0 — de onde veio `currentBalance`: "extrato_bancario" quando a conta tem
 * extrato importado (`bank_statement_lines`) — usa 100% das linhas reais, mais completo; ou
 * "cash_movements" quando não há extrato importado para a conta (fallback, mesmo mecanismo de
 * antes). Nunca oculto na UI — o gestor precisa saber qual é a base de cada saldo mostrado.
 */
export type AccountBalanceSource = "extrato_bancario" | "cash_movements";

export interface AccountBalanceCoverage {
  totalCount: number;
  classifiedCount: number;
  classifiedPercent: number | null;
  /** Missão V4.1 — totalCount - classifiedCount, exposto para nunca obrigar a UI a recalcular. */
  unclassifiedCount: number;
  /** Missão V4.1 — soma do valor das linhas ainda não conciliadas desta conta. */
  unclassifiedAmount: number;
  importPeriodFrom: string | null;
  importPeriodTo: string | null;
}

export interface FinancialAccountBalance extends FinancialAccount {
  /** Sempre calculado a partir de dados reais — nunca um valor gravado à parte. Ver `balanceSource` para a origem exata. */
  currentBalance: number;
  belowThreshold: boolean;
  balanceSource: AccountBalanceSource;
  /** Só presente quando `balanceSource === "extrato_bancario"` — indica quanto do saldo já foi conciliado/classificado (não afeta o valor do saldo, que já usa 100% das linhas reais). */
  coverage: AccountBalanceCoverage | null;
}

/**
 * "aporte_socios" (fromAccountId null) e "retirada" (toAccountId null) reaproveitam o mesmo
 * padrão from/to nullable já usado por transferência/reposição de caixa.
 */
/** "emprestimo_recebido"/"emprestimo_devolvido" — Missão Financeiro V4.0: dívida com terceiros/sócios que espera devolução (ex.: RF Base Participações, empréstimo de sócio), distinta de aporte (capital, sem devolução) e da categoria "Empréstimos e financiamentos" (financiamento bancário formal). */
export type AccountTransferType = "transferencia" | "reposicao_caixa" | "aporte_socios" | "retirada" | "emprestimo_recebido" | "emprestimo_devolvido";

export interface AccountTransfer {
  id: string;
  type: AccountTransferType;
  fromAccountId: string | null;
  fromAccountName: string | null;
  toAccountId: string | null;
  toAccountName: string | null;
  amount: number;
  date: string;
  description: string;
  responsibleName: string | null;
  documentRef: string | null;
  notes: string | null;
}

export interface RecordAccountTransferInput {
  type: AccountTransferType;
  fromAccountId?: string | null;
  toAccountId?: string | null;
  amount: number;
  date: string;
  description: string;
  responsibleName?: string | null;
  documentRef?: string | null;
  notes?: string | null;
}

export interface RecurringBillTemplate {
  id: string;
  description: string;
  supplierId: string | null;
  supplierName: string | null;
  categoryId: string | null;
  costCenterId: string | null;
  financialAccountId: string | null;
  amount: number | null;
  variableAmount: boolean;
  dueDay: number | null;
  periodicity: string;
  pendingData: boolean;
  notes: string | null;
}

/**
 * Missão de Instrumentação Gerencial — cadastro de um novo modelo de recorrência real, pelo
 * usuário. Antes desta missão só existiam modelos semeados manualmente no banco (10 reais:
 * Aluguel, JumpPark, Verisure, Vivo, Stylus Contabilidade, Água, Energia etc.) — não havia como
 * cadastrar um novo pelo próprio sistema quando surge uma despesa fixa nova.
 */
export interface CreateRecurringBillTemplateInput {
  description: string;
  supplierId?: string | null;
  categoryId: string;
  costCenterId?: string | null;
  financialAccountId?: string | null;
  /** Null = valor variável por competência (ex.: água/energia) — nunca inventar um valor fixo quando o real varia. */
  amount: number | null;
  variableAmount: boolean;
  dueDay?: number | null;
  periodicity?: string;
  pendingData?: boolean;
  notes?: string | null;
}

export type AccountsPayableStatus = "rascunho" | "pendente" | "parcialmente_paga" | "paga" | "vencida" | "cancelada";

export interface AccountsPayable {
  id: string;
  description: string;
  supplierId: string | null;
  supplierName: string | null;
  categoryId: string;
  categoryName: string;
  costCenterId: string | null;
  costCenterName: string | null;
  financialAccountId: string | null;
  financialAccountName: string | null;
  competenceDate: string;
  issueDate: string | null;
  dueDate: string;
  originalAmount: number;
  paidAmount: number;
  /** Sempre originalAmount - paidAmount, mantido em sincronia por status.ts. */
  outstandingAmount: number;
  paymentMethod: FinancePaymentMethod;
  documentNumber: string | null;
  /** Status armazenado (fonte da verdade para rascunho/cancelada — os demais podem ser recalculados). */
  status: AccountsPayableStatus;
  pendingData: boolean;
  recurringBillTemplateId: string | null;
  installmentGroupId: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  attachmentRef: string | null;
  source: string;
  externalId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountsPayableView extends AccountsPayable {
  computedStatus: AccountsPayableStatus;
  isOverdue: boolean;
}

export interface CreateAccountsPayableInput {
  description: string;
  supplierId?: string | null;
  categoryId: string;
  costCenterId?: string | null;
  financialAccountId?: string | null;
  competenceDate: string;
  issueDate?: string | null;
  dueDate: string;
  originalAmount: number;
  paymentMethod?: FinancePaymentMethod;
  documentNumber?: string | null;
  notes?: string | null;
  status?: AccountsPayableStatus;
  pendingData?: boolean;
  /** Quando > 1, gera N parcelas de originalAmount/installmentTotal, vencendo em meses seguintes. */
  installmentTotal?: number;
  /** Preenchido só quando a conta vem de generateAccountsPayableFromTemplate — nunca pela UI. */
  recurringBillTemplateId?: string | null;
  /**
   * Chave de idempotência opcional (Missão de Instrumentação Gerencial) — quando informada, nunca
   * cria uma segunda conta a pagar para o mesmo `externalId`: retorna a já existente. Usada pela
   * integração Compra → Estoque → Financeiro (`compra-estoque:{movementId}`) para nunca duplicar a
   * despesa ao reprocessar a mesma entrada de estoque. Ignorada quando `installmentTotal > 1`
   * (parcelamento nunca é gerado por esse fluxo).
   */
  externalId?: string | null;
}

export interface UpdateAccountsPayableInput {
  id: string;
  description?: string;
  supplierId?: string | null;
  categoryId?: string;
  costCenterId?: string | null;
  financialAccountId?: string | null;
  competenceDate?: string;
  issueDate?: string | null;
  dueDate?: string;
  originalAmount?: number;
  paymentMethod?: FinancePaymentMethod;
  documentNumber?: string | null;
  notes?: string | null;
  pendingData?: boolean;
}

export interface PayableSettlement {
  id: string;
  accountsPayableId: string;
  amount: number;
  paidAt: string | null;
  method: FinancePaymentMethod;
  financialAccountId: string | null;
  reversed: boolean;
  reversedAt: string | null;
  notes: string | null;
}

export interface RecordPayablePaymentInput {
  accountsPayableId: string;
  amount: number;
  paidAt: string;
  method: FinancePaymentMethod;
  financialAccountId?: string | null;
  notes?: string | null;
  /** Sem isto, pagar mais que outstandingAmount lança PayableOverpaymentError. */
  allowOverpayment?: boolean;
}

export interface AuditLogEntry {
  id: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  createdAt: string;
}

export interface Contract {
  id: string;
  partnerId: string;
  partnerName: string;
  title: string;
  type: ContractType;
  status: ContractStatus;
  startDate: string | null;
  endDate: string | null;
  billingClosingDay: number | null;
  dueDay: number | null;
  baseValue: number | null;
  notes: string | null;
  valuePeriods: ContractValuePeriod[];
  benefits: ContractBenefit[];
}

// --- Fluxo de Caixa / Livro Caixa ---

/**
 * Livro Caixa unificado: cada linha vem de cash_movements ("movimento") ou de account_transfers
 * ("transferencia") — nunca uma tabela nova, só uma visão combinada e ordenada
 * cronologicamente. Transferências nunca contam como receita/despesa (ver computeAccountBalance).
 */
export type CashLedgerEntryKind = "movimento" | "transferencia";

export interface CashLedgerEntry {
  id: string;
  kind: CashLedgerEntryKind;
  date: string;
  /** Rótulo de exibição: type/nature do movimento, ou o type da transferência. */
  label: string;
  amount: number;
  description: string;
  financialAccountId: string | null;
  financialAccountName: string | null;
  /** Só preenchido para kind "transferencia". */
  toAccountId: string | null;
  toAccountName: string | null;
  categoryName: string | null;
  costCenterName: string | null;
  partyName: string | null;
  responsibleName: string | null;
  documentRef: string | null;
  competenceDate: string | null;
  /** Missão V4.1, Fase 5 — nature resolvida via resolveClassification/resolveCashMovementNatureClassification/resolveTransferClassification (dre.ts), reaproveitado, nunca recalculado à parte. Null só quando o chamador não passou classifications/rules (ex.: testes antigos). */
  nature: FinancialNature | null;
  /** true para receita_operacional/despesa_operacional/custo_direto; false para as demais naturezas (transferência, aporte, retirada, empréstimo, resultado financeiro, etc.); null quando nature é null. */
  isOperational: boolean | null;
  /** "classificado" (origin resolvido e sem revisão pendente), "revisao_necessaria" ou "pendente" (sem classificação alguma) — nunca reclassifica nada, só expõe o status já resolvido pela DRE. */
  classificationStatus: "classificado" | "revisao_necessaria" | "pendente" | null;
  balanceBefore: number | null;
  balanceAfter: number | null;
  notes: string | null;
}

export interface CashFlowAccountBalance {
  financialAccountId: string;
  name: string;
  currentBalance: number;
  informedBalance: number | null;
  belowThreshold: boolean;
  balanceSource: AccountBalanceSource;
  coverage: AccountBalanceCoverage | null;
}

export interface CashFlowDashboard {
  saldoGeral: number;
  saldoPorConta: CashFlowAccountBalance[];
  entradasHoje: number;
  saidasHoje: number;
  resultadoDia: number;
  resultadoSemana: number;
  resultadoMes: number;
  receitasPrevistas: number;
  despesasPrevistas: number;
  maioresDespesas: { description: string; amount: number; date: string }[];
  maioresReceitas: { description: string; amount: number; date: string }[];
  entradasPorCentroCusto: { costCenterName: string; amount: number }[];
  saidasPorCentroCusto: { costCenterName: string; amount: number }[];
  /** Missão V4.1 — período selecionado pelo gestor (Fase 2). Quando nenhum é passado, é igual a asOfDate (equivalente a "Hoje", mesmo valor de entradasHoje/saidasHoje). */
  periodFrom: string;
  periodTo: string;
  /** Entradas/saídas realizadas (cash_movements reais) dentro de [periodFrom, periodTo] — nunca inclui transferências entre contas próprias. */
  entradasPeriodo: number;
  saidasPeriodo: number;
  variacaoLiquidaPeriodo: number;
}

/** Missão V4.1, Fase 2 — janelas fixas do seletor de período do Fluxo de Caixa. */
export type CashFlowPeriodPreset = "hoje" | "7_dias" | "mes_atual" | "mes_anterior" | "personalizado";

export interface CashFlowPeriodRange {
  from: string;
  to: string;
}

/** Missão V4.1, Fase 6 — faixas de vencimento para Contas a Receber/Pagar, sempre relativas a "hoje" (asOfDate), independentes do período selecionado (Fase 2 só afeta indicadores/movimentações realizadas). */
export type AgingBucket = "vencida" | "hoje" | "7_dias" | "15_dias" | "30_dias" | "futuro";

export interface AgingBucketSummary {
  bucket: AgingBucket;
  count: number;
  amount: number;
}

export type CashFlowProjectionWindow = "hoje" | "amanha" | "7_dias" | "15_dias" | "30_dias" | "90_dias";

export interface CashFlowProjectionPoint {
  window: CashFlowProjectionWindow;
  contasAReceber: number;
  contasAPagar: number;
  saldoProjetado: number;
}

export type CashFlowAlertLevel =
  | "saldo_negativo"
  | "conta_zerando"
  | "fluxo_negativo_futuro"
  | "conta_sem_movimentacao"
  | "diferenca_saldo_informado"
  | "concentracao_pagamentos"
  | "saida_excepcional"
  | "queda_entradas"
  | "conta_a_pagar_vencida"
  | "conta_a_receber_vencida"
  | "movimentacao_sem_classificacao";

export interface CashFlowAlert {
  level: CashFlowAlertLevel;
  financialAccountId: string | null;
  financialAccountName: string | null;
  message: string;
  amount: number | null;
}

// --- Contabilidade Gerencial: classificação, DRE, rateio, fechamento ---
// DRE gerencial para apoio à administração. Não substitui escrituração contábil,
// demonstrações oficiais ou obrigações preparadas pela contabilidade.

export type DreLine = "receita_bruta" | "deducoes_receita" | "custos_diretos" | "despesas_operacionais" | "resultado_financeiro" | "tributos" | "fora_dre";

export type FinancialNature =
  | "receita_operacional"
  | "deducao_receita"
  | "custo_direto"
  | "despesa_operacional"
  | "resultado_financeiro"
  | "investimento"
  | "ativo"
  | "passivo"
  | "transferencia"
  | "aporte"
  | "retirada"
  | "emprestimo"
  | "reembolso"
  | "nao_classificavel";

export type ClassificationOrigin = "regra_automatica" | "herdada_categoria" | "herdada_fornecedor" | "herdada_cliente" | "manual" | "importacao_futura" | "pendente";

/**
 * Missão Financeiro V3.1 — "jumppark_service_order" identifica receita derivada diretamente de
 * `jumppark_service_orders` (nunca persistida em accounts_receivable), para o gestor distinguir na
 * DRE o que veio da operação real (JumpPark) do que veio de conciliação bancária/AR manual.
 *
 * Missão UX/Navegação 2 — "historical_spreadsheet_revenue" identifica receita derivada de
 * `historical_spreadsheet_wash_records`/`historical_spreadsheet_parking_records` (planilha
 * histórica pré-JumpPark, fonte oficial exclusiva antes de `DATA_CORTE_JUMPPARK` — ver
 * `src/lib/config/historical-source-precedence.ts`). Mesmo tratamento de
 * `jumppark_service_order`: determinística, nunca passa por classificação manual, porque não é um
 * lançamento editável — é derivada 1:1 da planilha a cada cálculo.
 */
export type ClassificationSourceKind =
  | "accounts_payable"
  | "accounts_receivable"
  | "cash_movement"
  | "account_transfer"
  | "jumppark_service_order"
  | "stone_fee"
  | "historical_spreadsheet_revenue";

/** Subconjunto de `ClassificationSourceKind` que pode ser classificado manualmente via `classifyEntity` — receita JumpPark/planilha histórica é sempre determinística (ver `dre.ts`), nunca reclassificável manualmente. */
export type ManuallyClassifiableSourceKind = Exclude<ClassificationSourceKind, "jumppark_service_order" | "stone_fee" | "historical_spreadsheet_revenue">;

/**
 * Missão UX/Navegação 2 — status de confiabilidade/origem de um período financeiro consultado,
 * nunca confundido com `AccountingPeriod["status"]` (esse é o workflow de fechamento
 * aberto/em_revisao/fechado/reaberto; este é sobre DE ONDE o número vem e o quão completo ele é):
 * - "fechado_oficial": existe um `DreSnapshot` oficial cobrindo EXATAMENTE o mês consultado —
 *   os números vêm do snapshot congelado, nunca recalculados.
 * - "fonte_historica": todo o intervalo consultado é anterior a `DATA_CORTE_JUMPPARK` — receita vem
 *   da planilha histórica (`historical_spreadsheet_*`), nunca do JumpPark.
 * - "calculado": todo (ou parte) o intervalo é a partir de `DATA_CORTE_JUMPPARK` — fluxo normal
 *   (JumpPark/cash_movements/contas a pagar/receber).
 * - "parcial": não há receita reconhecível em nenhuma fonte para o intervalo — ausência de dado,
 *   nunca tratada como resultado zero (mesmo princípio já usado em `DreReport.receitaBruta`).
 */
export type FinancialPeriodSourceStatus = "fechado_oficial" | "calculado" | "fonte_historica" | "parcial";

export interface FinancialPeriodSourceInfo {
  status: FinancialPeriodSourceStatus;
  /** Rótulo pronto para exibição na UI (ex.: "Fechado oficialmente", "Histórico disponível (planilha)"). */
  label: string;
  /** true quando o intervalo consultado cruza `DATA_CORTE_JUMPPARK` — combina fonte histórica e fonte ao vivo no mesmo relatório, sem dupla contagem (cada candidato só é elegível numa das duas fontes, nunca nas duas). */
  crossesHistoricalCutoff: boolean;
  /** Versão do `DreSnapshot` oficial usado, só quando `status === "fechado_oficial"`. */
  officialSnapshotVersion: number | null;
  /**
   * Meses inteiros dentro do intervalo consultado que possuem fechamento oficial próprio, mesmo
   * quando o intervalo consultado é um recorte parcial (não seria elegível a "fechado_oficial"
   * sozinho). Informativo para a UI alertar "este recorte é cálculo ao vivo, não o fechamento
   * oficial de agosto" sem esconder que agosto tem uma versão oficial.
   */
  officialSnapshotMonthsInRange: string[];
}

export interface FinancialClassification {
  id: string;
  accountsPayableId: string | null;
  accountsReceivableId: string | null;
  cashMovementId: string | null;
  accountTransferId: string | null;
  dreLine: DreLine;
  nature: FinancialNature;
  includeInDre: boolean;
  origin: ClassificationOrigin;
  reviewNeeded: boolean;
  classifiedBy: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClassifyEntityInput {
  sourceKind: ManuallyClassifiableSourceKind;
  sourceId: string;
  dreLine: DreLine;
  nature: FinancialNature;
  includeInDre?: boolean;
  reviewNeeded?: boolean;
  classifiedBy?: string | null;
  notes?: string | null;
  /** Cria/atualiza também uma regra automática a partir desta classificação. */
  createRule?: {
    matchType: ClassificationMatchType;
    supplierId?: string | null;
    partnerId?: string | null;
    categoryId?: string | null;
    keyword?: string | null;
  };
  /** Reclassifica também lançamentos já existentes que combinem com a regra criada, quando confirmado explicitamente. */
  applyToExisting?: boolean;
}

export type ClassificationMatchType = "fornecedor" | "parceiro" | "categoria" | "palavra_chave";

export interface ClassificationRule {
  id: string;
  matchType: ClassificationMatchType;
  supplierId: string | null;
  supplierName: string | null;
  partnerId: string | null;
  partnerName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  keyword: string | null;
  dreLine: DreLine;
  nature: FinancialNature;
  suggestedCostCenterId: string | null;
  suggestedCostCenterName: string | null;
  includeInDre: boolean;
  reviewNeeded: boolean;
  enabled: boolean;
  notes: string | null;
}

export interface CreateClassificationRuleInput {
  matchType: ClassificationMatchType;
  supplierId?: string | null;
  partnerId?: string | null;
  categoryId?: string | null;
  keyword?: string | null;
  dreLine: DreLine;
  nature: FinancialNature;
  suggestedCostCenterId?: string | null;
  includeInDre?: boolean;
  reviewNeeded?: boolean;
  enabled?: boolean;
  notes?: string | null;
}

export interface AllocationRuleShareInput {
  costCenterId: string;
  percentage: number;
}

export interface AllocationRule {
  id: string;
  name: string;
  description: string | null;
  effectiveFrom: string;
  effectiveUntil: string | null;
  shares: { costCenterId: string; costCenterName: string; percentage: number }[];
  notes: string | null;
}

export interface CreateAllocationRuleInput {
  name: string;
  description?: string | null;
  effectiveFrom: string;
  effectiveUntil?: string | null;
  shares: AllocationRuleShareInput[];
  notes?: string | null;
}

export type AccountingPeriodStatus = "aberto" | "em_revisao" | "fechado" | "reaberto";

export interface AccountingPeriod {
  id: string;
  competenceMonth: string;
  status: AccountingPeriodStatus;
  closedBy: string | null;
  closedAt: string | null;
  reopenedBy: string | null;
  reopenedAt: string | null;
  reopenJustification: string | null;
  notes: string | null;
}

export interface CloseAccountingPeriodInput {
  competenceMonth: string;
  closedBy: string;
  notes?: string | null;
}

export interface ReopenAccountingPeriodInput {
  competenceMonth: string;
  reopenedBy: string;
  reopenJustification: string;
}

// --- DRE Gerencial ---

/**
 * Missão Financeiro V7 (Fase C7) — espelha `src/db/schema/accounting.ts` (dreSnapshots). Um
 * fechamento imutável do `DreReport`, preservado mesmo depois de reaberturas (ver `isOfficial`).
 */
export interface DreSnapshot {
  id: string;
  competenceMonth: string;
  version: number;
  isOfficial: boolean;
  regime: DreRegime;
  computedAt: string;
  computedBy: string;
  closedAt: string;
  closedBy: string;
  supersededAt: string | null;
  supersededByVersionId: string | null;
  methodologyVersion: string;
  reportPayload: DreReport;
  payloadHash: string;
  hashAlgorithm: string;
  pendingCount: number;
  lineItemCount: number;
  accountingPeriodId: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Persistência atômica de um fechamento: cria a nova versão do snapshot, desmarca a versão
 * oficial anterior (se existir) e fecha/atualiza o `accounting_period` — tudo em uma única
 * transação (ver `persistDreSnapshotAndClosePeriod`). O cálculo do `DreReport` e as validações
 * (naoClassificados, invariantes) acontecem ANTES, em `dreSnapshot.ts` — o repositório nunca
 * calcula a DRE sozinho (evitaria depender de `dre.ts`/`service.ts`, criando dependência circular
 * com a camada de repositório).
 */
export interface PersistDreSnapshotInput {
  competenceMonth: string;
  version: number;
  regime: DreRegime;
  computedAt: string;
  computedBy: string;
  closedBy: string;
  methodologyVersion: string;
  reportPayload: DreReport;
  payloadHash: string;
  hashAlgorithm: string;
  pendingCount: number;
  lineItemCount: number;
  notes?: string | null;
  /** id da versão oficial anterior desta competência, se existir — será marcada `isOfficial=false` na mesma transação. */
  previousOfficialSnapshotId?: string | null;
  closeAccountingPeriodInput: CloseAccountingPeriodInput;
}

/**
 * "gerencial" (Missão V3.0) é o regime híbrido: usa competência quando ela é conhecida (accounts_payable/
 * accounts_receivable, e cash_movements com `competenceDate` preenchido) e cai para a data do movimento de
 * caixa quando não há competência registrada — nunca inventa uma competência que não foi confirmada.
 */
export type DreRegime = "competencia" | "caixa" | "gerencial";

export type DreCostCenterGroup = "estetica_automotiva" | "estacionamento" | "administrativo_geral";

/** Um lançamento real que compõe uma linha da DRE — sempre com link de volta ao registro original. */
export interface DreLineItem {
  sourceKind: ClassificationSourceKind;
  sourceId: string;
  date: string;
  description: string;
  partyName: string | null;
  categoryName: string | null;
  costCenterName: string | null;
  amount: number;
  origin: ClassificationOrigin;
}

export interface DreGroupTotal {
  label: string;
  amount: number;
  items: DreLineItem[];
}

export interface DreReport {
  regime: DreRegime;
  competenceFrom: string;
  competenceTo: string;
  costCenterGroup: DreCostCenterGroup | "consolidado";

  receitaBrutaEstetica: DreGroupTotal;
  receitaBrutaEstacionamento: DreGroupTotal;
  /** Receita de parceiros com `partners.type` "parceria_pos_paga" ou "contrato_mensal" (ex.: Grupo IESA/Nissan) — segmentada por tipo de parceiro, não por centro de custo, porque nem toda parceria corporativa tem um centro de custo próprio cadastrado. */
  receitaBrutaParceriasCorporativas: DreGroupTotal;
  receitaBrutaOutras: DreGroupTotal;
  /** Null quando nenhuma receita foi registrada no período — ausência de lançamento nunca vira R$ 0 (ver `receitaBrutaIndisponivelMotivo`). */
  receitaBruta: number | null;
  receitaBrutaIndisponivelMotivo: string | null;

  deducoes: DreGroupTotal;
  receitaLiquida: number | null;

  custosDiretos: DreGroupTotal;
  /** Null quando receita OU custos diretos não têm nenhum lançamento real no período (ver `margemContribuicaoIndisponivelMotivo`). */
  margemContribuicao: number | null;
  margemContribuicaoIndisponivelMotivo: string | null;

  despesasOperacionais: DreGroupTotal;
  /** Null quando receita, custos diretos OU despesas operacionais não têm nenhum lançamento real no período (ver `resultadoOperacionalIndisponivelMotivo`). */
  resultadoOperacional: number | null;
  resultadoOperacionalIndisponivelMotivo: string | null;

  resultadoFinanceiro: DreGroupTotal;
  resultadoAntesTributos: number | null;

  tributos: DreGroupTotal;
  resultadoLiquido: number | null;

  /** Lançamentos encontrados mas sem classificação (nature=nao_classificavel ou pendente) — não entram nos totais acima. */
  naoClassificados: DreLineItem[];

  margemContribuicaoPercentual: number | null;
  margemOperacionalPercentual: number | null;
  margemLiquidaPercentual: number | null;
  participacaoEsteticaReceita: number | null;
  participacaoEstacionamentoReceita: number | null;
  participacaoParceriasReceita: number | null;
  ebitda: number | null;
  ebitdaIndisponivelMotivo: string | null;

  /**
   * Mão de obra = soma de itens de custosDiretos/despesasOperacionais nas categorias "Salários CLT" e
   * "Prestadores PJ" — as duas únicas categorias de mão de obra que existem hoje no plano de contas, nenhuma
   * nova foi inventada. `maoDeObraOperacional` é o subconjunto cujo centro de custo resolve para Estética
   * Automotiva ou Estacionamento (não Administrativo/Geral). Segue "ausência de dado ≠ zero": null só quando
   * NENHUM lançamento de custo/despesa existe no período; se existem mas nenhum é mão de obra, o valor real é 0.
   */
  maoDeObraTotal: number | null;
  maoDeObraOperacional: number | null;
  maoDeObraIndisponivelMotivo: string | null;
  maoDeObraPercentualReceitaLiquida: number | null;
  maoDeObraPercentualReceitaBruta: number | null;
}

export interface DreComparisonPoint {
  label: string;
  receitaBruta: number;
  receitaLiquida: number;
  margemContribuicao: number;
  resultadoOperacional: number;
  resultadoLiquido: number;
}

/** Fila de pendências do módulo de classificação (aba /financeiro/classificacao). */
export interface ClassificationQueueItem {
  sourceKind: ClassificationSourceKind;
  sourceId: string;
  date: string;
  description: string;
  partyName: string | null;
  categoryName: string | null;
  costCenterName: string | null;
  amount: number;
  reason: "sem_classificacao" | "revisao_necessaria" | "despesa_compartilhada_sem_rateio" | "acordo_sem_detalhamento" | "fornecedor_sem_regra" | "cliente_sem_regra";
}
