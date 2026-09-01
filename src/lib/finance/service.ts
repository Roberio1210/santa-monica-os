import "server-only";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { toAccountsPayableView, toAccountsReceivableView } from "@/lib/finance/status";
import { computeDreReport, resolveClassification, resolveCashMovementClassification, resolveTransferClassification } from "@/lib/finance/dre";
import { fetchJumpParkRevenueCandidates } from "@/lib/finance/jumpparkRevenue";
import { fetchStoneFeeCandidatesForDre } from "@/lib/finance/stoneFeeCandidates";
import { fetchHistoricalRevenueCandidates } from "@/lib/finance/historicalRevenue";
import type { HistoricalRevenueCandidateInput, JumpParkRevenueCandidateInput, ResolvedClassification, StoneFeeCandidateInput } from "@/lib/finance/dre";
import type {
  AccountingPeriod,
  AccountsPayableView,
  AccountsReceivableView,
  AccountTransfer,
  AgingBucket,
  AgingBucketSummary,
  CashFlowAccountBalance,
  CashFlowAlert,
  CashFlowDashboard,
  CashFlowProjectionPoint,
  CashFlowProjectionWindow,
  CashLedgerEntry,
  CashMovement,
  ClassificationQueueItem,
  ClassificationRule,
  Contract,
  CostCenter,
  CreateContractInput,
  CreatePartnerInput,
  DreCostCenterGroup,
  DreRegime,
  DreReport,
  FinancePaymentMethod,
  FinancialAccountBalance,
  FinancialCategory,
  FinancialClassification,
  FinancialNature,
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

/** Missão Financeiro V2 (Prioridade 4) — cadastro de um novo parceiro/mensalista real. */
export async function createPartner(input: CreatePartnerInput): Promise<Partner> {
  return getFinanceRepository().createPartner(input);
}

/** Missão Financeiro V2 (Prioridade 4) — cadastro de um novo contrato real (mensalista/parceria). */
export async function createContract(input: CreateContractInput): Promise<Contract> {
  return getFinanceRepository().createContract(input);
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

export interface GenerateAccountsPayableFromTemplateOptions {
  amountOverride?: number;
  issueDate?: string | null;
  documentNumber?: string | null;
  notes?: string | null;
  /** Texto livre — sem sessão de usuário real ainda (mesmo padrão de inventory_movements.responsible). */
  responsibleName?: string | null;
}

/**
 * Gera (ou reaproveita, se já existir) a conta a pagar de uma competência específica a partir
 * de um modelo de recorrência. Idempotente: nunca cria uma segunda conta para o mesmo
 * (recurringBillTemplateId, competência) — checa antes de criar. Nunca é chamada
 * automaticamente por nenhuma tela; é uma ação explícita (ver /financeiro/contas-a-pagar/gerar-recorrentes).
 * Modelos de valor variável (água/energia) exigem o valor informado manualmente — não
 * inventamos um valor a partir do template.
 */
export async function generateAccountsPayableFromTemplate(
  templateId: string,
  competenceDate: string,
  options: GenerateAccountsPayableFromTemplateOptions = {},
) {
  const repo = getFinanceRepository();
  const templates = await repo.listRecurringBillTemplates();
  const template = templates.find((t) => t.id === templateId);
  if (!template) throw new Error(`Modelo de recorrência não encontrado: ${templateId}`);

  const amount = template.variableAmount ? options.amountOverride : template.amount;
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

  const generationNote = `Gerado da recorrência "${template.description}" para a competência ${competenceDate.slice(0, 7)}${options.responsibleName ? ` por ${options.responsibleName}` : ""}.`;
  const notes = [options.notes, generationNote].filter(Boolean).join(" ");

  const [created] = await repo.createAccountsPayable({
    description: template.description,
    supplierId: template.supplierId,
    categoryId: template.categoryId,
    costCenterId: template.costCenterId,
    financialAccountId: template.financialAccountId,
    competenceDate,
    issueDate: options.issueDate ?? null,
    dueDate,
    originalAmount: amount,
    documentNumber: options.documentNumber ?? null,
    pendingData: template.pendingData,
    recurringBillTemplateId: templateId,
    notes,
  });
  return created;
}

export interface RecurringGenerationStatusItem {
  template: RecurringBillTemplate;
  alreadyGenerated: boolean;
  existingAccountsPayableId: string | null;
  /** Vencimento calculado a partir do dia fixo do modelo — null quando o modelo não tem dia fixo (valor variável). */
  dueDate: string | null;
}

/**
 * Status de geração de cada modelo de recorrência para uma competência — nunca grava nada, só
 * lê. Usado pela tela /financeiro/contas-a-pagar/gerar-recorrentes para montar a prévia antes da
 * confirmação explícita do usuário.
 */
export async function fetchRecurringGenerationStatus(competenceMonth: string): Promise<RecurringGenerationStatusItem[]> {
  const repo = getFinanceRepository();
  const [templates, existingAp] = await Promise.all([repo.listRecurringBillTemplates(), repo.listAccountsPayable()]);

  return templates.map((template) => {
    const existing = existingAp.find((ap) => ap.recurringBillTemplateId === template.id && ap.competenceDate.slice(0, 7) === competenceMonth);
    const dueDate = template.dueDay ? `${competenceMonth}-${String(template.dueDay).padStart(2, "0")}` : null;
    return { template, alreadyGenerated: Boolean(existing), existingAccountsPayableId: existing?.id ?? null, dueDate };
  });
}

export async function fetchExpenseCategories(): Promise<FinancialCategory[]> {
  return getFinanceRepository().listFinancialCategories("despesa");
}

export async function fetchCostCenters(): Promise<CostCenter[]> {
  return getFinanceRepository().listCostCenters();
}

// --- Fluxo de Caixa / Livro Caixa ---

/** receita_operacional/despesa_operacional/custo_direto contam como operação real do negócio; as demais naturezas (transferência, aporte, retirada, empréstimo, resultado financeiro, dedução, investimento, ativo/passivo, reembolso, não classificável) são não-operacionais — Missão V4.1, Fase 5. Reaproveita a taxonomia já existente da DRE, nunca cria uma nova. */
const OPERATIONAL_NATURES = new Set<FinancialNature>(["receita_operacional", "despesa_operacional", "custo_direto"]);

function classificationStatusFrom(resolved: ResolvedClassification): "classificado" | "revisao_necessaria" | "pendente" {
  if (resolved.origin === "pendente") return "pendente";
  if (resolved.reviewNeeded) return "revisao_necessaria";
  return "classificado";
}

/**
 * Livro Caixa: junta cash_movements ("movimento") e account_transfers ("transferencia") numa
 * única lista ordenada cronologicamente — nenhuma tabela nova, só uma visão combinada. Toda
 * entrada e toda saída real passa por uma dessas duas tabelas, então nada fica de fora.
 *
 * Missão V4.1, Fase 5 — `classifications`/`rules` são opcionais: quando fornecidos, cada entrada
 * ganha nature/isOperational/classificationStatus reaproveitando exatamente os mesmos resolvers
 * da DRE (nunca uma segunda lógica de classificação); quando omitidos (chamadores antigos), esses
 * três campos ficam null e o resto do comportamento é idêntico ao de antes desta missão.
 */
export function computeCashLedger(
  movements: CashMovement[],
  transfers: AccountTransfer[],
  classifications?: FinancialClassification[],
  rules?: ClassificationRule[],
): CashLedgerEntry[] {
  const explicitByCashMovementId = new Map<string, FinancialClassification>();
  for (const c of classifications ?? []) {
    if (c.cashMovementId) explicitByCashMovementId.set(c.cashMovementId, c);
  }

  const fromMovements: CashLedgerEntry[] = movements.map((m) => {
    const resolved = rules ? resolveCashMovementClassification(m, explicitByCashMovementId.get(m.id), rules) : null;
    return {
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
      nature: resolved?.nature ?? null,
      isOperational: resolved ? OPERATIONAL_NATURES.has(resolved.nature) : null,
      classificationStatus: resolved ? classificationStatusFrom(resolved) : null,
      balanceBefore: m.balanceBefore,
      balanceAfter: m.balanceAfter,
      notes: m.notes,
    };
  });

  const fromTransfers: CashLedgerEntry[] = transfers.map((t) => {
    const resolved = rules ? resolveTransferClassification(t.type) : null;
    return {
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
      nature: resolved?.nature ?? null,
      isOperational: resolved ? OPERATIONAL_NATURES.has(resolved.nature) : null,
      classificationStatus: resolved ? classificationStatusFrom(resolved) : null,
      balanceBefore: null,
      balanceAfter: null,
      notes: t.notes,
    };
  });

  return [...fromMovements, ...fromTransfers].sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));
}

export async function fetchCashLedger(): Promise<CashLedgerEntry[]> {
  const repo = getFinanceRepository();
  const [movements, transfers, classifications, rules] = await Promise.all([
    repo.listCashMovements(),
    repo.listAccountTransfers(),
    repo.listFinancialClassifications(),
    repo.listClassificationRules(),
  ]);
  return computeCashLedger(movements, transfers, classifications, rules);
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
  periodFrom: string = asOfDate,
  periodTo: string = asOfDate,
): CashFlowDashboard {
  const saldoGeral = Math.round(accounts.reduce((sum, a) => sum + a.currentBalance, 0) * 100) / 100;
  const saldoPorConta: CashFlowAccountBalance[] = accounts.map((a) => ({
    financialAccountId: a.id,
    name: a.name,
    currentBalance: a.currentBalance,
    informedBalance: a.informedBalance,
    belowThreshold: a.belowThreshold,
    balanceSource: a.balanceSource,
    coverage: a.coverage,
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

  const periodMovements = movements.filter((m) => m.date >= periodFrom && m.date <= periodTo);
  const entradasPeriodo = Math.round(periodMovements.filter((m) => m.type === "entrada").reduce((sum, m) => sum + m.amount, 0) * 100) / 100;
  const saidasPeriodo = Math.round(periodMovements.filter((m) => m.type === "saida").reduce((sum, m) => sum + m.amount, 0) * 100) / 100;
  const variacaoLiquidaPeriodo = Math.round((entradasPeriodo - saidasPeriodo) * 100) / 100;

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
    periodFrom,
    periodTo,
    entradasPeriodo,
    saidasPeriodo,
    variacaoLiquidaPeriodo,
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

/**
 * Missão V4.1, Fase 6 — agrupa itens em aberto de Contas a Receber/Pagar em faixas de vencimento
 * sempre relativas a `asOfDate` ("hoje" real), independentes do período selecionado no painel
 * (Fase 2 só afeta indicadores/movimentações já realizados). "vencida" é estritamente dueDate <
 * asOfDate; as demais faixas são cumulativas por limite superior, cada item cai em exatamente uma.
 */
function bucketByDueDate(items: { dueDate: string; outstandingAmount: number }[], asOfDate: string): AgingBucketSummary[] {
  const thresholds: { bucket: AgingBucket; limit: string | null }[] = [
    { bucket: "hoje", limit: asOfDate },
    { bucket: "7_dias", limit: addDays(asOfDate, 7) },
    { bucket: "15_dias", limit: addDays(asOfDate, 15) },
    { bucket: "30_dias", limit: addDays(asOfDate, 30) },
    { bucket: "futuro", limit: null },
  ];

  const buckets = new Map<AgingBucket, { count: number; amount: number }>([
    ["vencida", { count: 0, amount: 0 }],
    ["hoje", { count: 0, amount: 0 }],
    ["7_dias", { count: 0, amount: 0 }],
    ["15_dias", { count: 0, amount: 0 }],
    ["30_dias", { count: 0, amount: 0 }],
    ["futuro", { count: 0, amount: 0 }],
  ]);

  for (const item of items) {
    const bucket: AgingBucket = item.dueDate < asOfDate ? "vencida" : (thresholds.find((t) => t.limit === null || item.dueDate <= t.limit)?.bucket ?? "futuro");
    const entry = buckets.get(bucket)!;
    entry.count += 1;
    entry.amount = Math.round((entry.amount + item.outstandingAmount) * 100) / 100;
  }

  return Array.from(buckets.entries()).map(([bucket, v]) => ({ bucket, ...v }));
}

export function computeReceivableAging(items: AccountsReceivableView[], asOfDate: string): AgingBucketSummary[] {
  const open = items.filter((i) => i.computedStatus !== "cancelled" && i.computedStatus !== "draft" && i.outstandingAmount > 0);
  return bucketByDueDate(open, asOfDate);
}

export function computePayableAging(items: AccountsPayableView[], asOfDate: string): AgingBucketSummary[] {
  const open = items.filter((i) => i.computedStatus !== "cancelada" && i.computedStatus !== "rascunho" && i.outstandingAmount > 0);
  return bucketByDueDate(open, asOfDate);
}

const ACCOUNT_INACTIVITY_ALERT_DAYS = 30;

export interface CashFlowAlertsExtra {
  arItems: AccountsReceivableView[];
  apItems: AccountsPayableView[];
  saldoGeral: number;
  periodFrom: string;
  periodTo: string;
}

const HIGH_OUTFLOW_MULTIPLIER = 3;
const HIGH_OUTFLOW_LOOKBACK_DAYS = 30;
const HIGH_OUTFLOW_MIN_SAMPLE_DAYS = 5;
const INFLOW_DROP_THRESHOLD_PERCENT = 30;

/**
 * Calculado sob demanda — nunca persiste nada, mesmo padrão de computePayableAlerts/
 * computeReceivableAlerts. "conta_zerando" só dispara para contas com fundo fixo definido (ex.:
 * Caixa físico) — nunca inventamos um limiar para Stone/Ailos, que não têm fundo fixo.
 *
 * `extra` (Missão V4.1) é opcional — quando omitido, o comportamento é idêntico ao de antes desta
 * missão (só os 5 alertas originais). Quando fornecido, habilita os 6 alertas novos da Fase 7.
 * Todo alerta novo expõe os números exatos usados no cálculo na própria mensagem — nunca um
 * julgamento vago ("caiu muito") sem o dado por trás, para não criar falso senso de precisão.
 */
export function computeCashFlowAlerts(
  accounts: FinancialAccountBalance[],
  movements: CashMovement[],
  transfers: AccountTransfer[],
  projection: CashFlowProjectionPoint[],
  asOfDate: string,
  extra?: CashFlowAlertsExtra,
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

    // Missão V4.1: contas com saldo via extrato bancário (ex.: Stone) rotineiramente não têm
    // cash_movements/transfers recentes por desenho (V4.0) — usar a data real do extrato
    // (coverage.importPeriodTo) como "última movimentação" evita um falso positivo permanente.
    const lastMovementDate =
      account.balanceSource === "extrato_bancario" && account.coverage
        ? account.coverage.importPeriodTo
        : movements
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
          ? `${account.name} não tem ${account.balanceSource === "extrato_bancario" ? "extrato importado" : "movimentação"} há mais de ${ACCOUNT_INACTIVITY_ALERT_DAYS} dias (último registro: ${lastMovementDate}).`
          : `${account.name} nunca teve nenhuma movimentação registrada.`,
        amount: null,
      });
    }

    if (extra && account.coverage && account.coverage.unclassifiedCount > 0) {
      alerts.push({
        level: "movimentacao_sem_classificacao",
        financialAccountId: account.id,
        financialAccountName: account.name,
        message: `${account.name} tem ${account.coverage.unclassifiedCount} de ${account.coverage.totalCount} lançamentos do extrato ainda não classificados (${account.coverage.classifiedPercent}% classificado), somando ${account.coverage.unclassifiedAmount} não classificados.`,
        amount: account.coverage.unclassifiedAmount,
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

  if (extra) {
    const { arItems, apItems, saldoGeral, periodFrom, periodTo } = extra;

    const overdueAr = computeReceivableAging(arItems, asOfDate).find((b) => b.bucket === "vencida");
    if (overdueAr && overdueAr.amount > 0) {
      alerts.push({
        level: "conta_a_receber_vencida",
        financialAccountId: null,
        financialAccountName: null,
        message: `${overdueAr.count} conta(s) a receber vencida(s), somando ${overdueAr.amount}.`,
        amount: overdueAr.amount,
      });
    }

    const overdueAp = computePayableAging(apItems, asOfDate).find((b) => b.bucket === "vencida");
    if (overdueAp && overdueAp.amount > 0) {
      alerts.push({
        level: "conta_a_pagar_vencida",
        financialAccountId: null,
        financialAccountName: null,
        message: `${overdueAp.count} conta(s) a pagar vencida(s), somando ${overdueAp.amount}.`,
        amount: overdueAp.amount,
      });
    }

    const next7DaysApBuckets = computePayableAging(apItems, asOfDate).filter((b) => b.bucket === "vencida" || b.bucket === "hoje" || b.bucket === "7_dias");
    const next7DaysApTotal = Math.round(next7DaysApBuckets.reduce((sum, b) => sum + b.amount, 0) * 100) / 100;
    if (next7DaysApTotal > saldoGeral) {
      alerts.push({
        level: "concentracao_pagamentos",
        financialAccountId: null,
        financialAccountName: null,
        message: `Contas a pagar nos próximos 7 dias (${next7DaysApTotal}) superam o saldo geral atual (${saldoGeral}).`,
        amount: Math.round((next7DaysApTotal - saldoGeral) * 100) / 100,
      });
    }

    const todaySaida = Math.round(movements.filter((m) => m.date === asOfDate && m.type === "saida").reduce((sum, m) => sum + m.amount, 0) * 100) / 100;
    const lookbackFrom = addDays(asOfDate, -HIGH_OUTFLOW_LOOKBACK_DAYS);
    const historicalOutflowDays = new Set(movements.filter((m) => m.type === "saida" && m.date >= lookbackFrom && m.date < asOfDate).map((m) => m.date));
    if (todaySaida > 0 && historicalOutflowDays.size >= HIGH_OUTFLOW_MIN_SAMPLE_DAYS) {
      const historicalTotal = movements
        .filter((m) => m.type === "saida" && m.date >= lookbackFrom && m.date < asOfDate)
        .reduce((sum, m) => sum + m.amount, 0);
      const avgDailyOutflow = Math.round((historicalTotal / historicalOutflowDays.size) * 100) / 100;
      if (avgDailyOutflow > 0 && todaySaida > avgDailyOutflow * HIGH_OUTFLOW_MULTIPLIER) {
        alerts.push({
          level: "saida_excepcional",
          financialAccountId: null,
          financialAccountName: null,
          message: `Saída de hoje (${todaySaida}) é mais de ${HIGH_OUTFLOW_MULTIPLIER}x a média diária dos últimos ${historicalOutflowDays.size} dias com movimento (${avgDailyOutflow}).`,
          amount: todaySaida,
        });
      }
    }

    if (periodFrom !== periodTo) {
      const periodDays = diffInDays(periodTo, periodFrom) + 1;
      const previousTo = addDays(periodFrom, -1);
      const previousFrom = addDays(periodFrom, -periodDays);
      const currentEntradas = movements.filter((m) => m.type === "entrada" && m.date >= periodFrom && m.date <= periodTo).reduce((sum, m) => sum + m.amount, 0);
      const previousEntradas = movements.filter((m) => m.type === "entrada" && m.date >= previousFrom && m.date <= previousTo).reduce((sum, m) => sum + m.amount, 0);
      if (previousEntradas > 0) {
        const dropPercent = Math.round(((previousEntradas - currentEntradas) / previousEntradas) * 1000) / 10;
        if (dropPercent >= INFLOW_DROP_THRESHOLD_PERCENT) {
          alerts.push({
            level: "queda_entradas",
            financialAccountId: null,
            financialAccountName: null,
            message: `Entradas do período (${Math.round(currentEntradas * 100) / 100}) caíram ${dropPercent}% em relação ao período equivalente anterior (${Math.round(previousEntradas * 100) / 100}, ${previousFrom} a ${previousTo}).`,
            amount: Math.round((currentEntradas - previousEntradas) * 100) / 100,
          });
        }
      }
    }
  }

  return alerts;
}

/**
 * Missão V4.1 — `periodFrom`/`periodTo` (Fase 2) são opcionais e, quando omitidos, caem em
 * `asOfDate` (equivalente ao preset "Hoje"), preservando exatamente o comportamento anterior para
 * quem já chama esta função sem eles (Central de Operações, `today-panel`, etc.).
 */
export async function fetchCashFlowOverview(
  asOfDate: string = new Date().toISOString().slice(0, 10),
  periodFrom: string = asOfDate,
  periodTo: string = asOfDate,
): Promise<{
  dashboard: CashFlowDashboard;
  projection: CashFlowProjectionPoint[];
  alerts: CashFlowAlert[];
  ledger: CashLedgerEntry[];
  accounts: FinancialAccountBalance[];
  receivablesAging: AgingBucketSummary[];
  payablesAging: AgingBucketSummary[];
}> {
  const repo = getFinanceRepository();
  const [accounts, movements, transfers, arOverview, apOverview, classifications, rules] = await Promise.all([
    repo.listFinancialAccounts(),
    repo.listCashMovements(),
    repo.listAccountTransfers(),
    fetchAccountsReceivableOverview(asOfDate),
    fetchAccountsPayableOverview(asOfDate),
    repo.listFinancialClassifications(),
    repo.listClassificationRules(),
  ]);

  const dashboard = computeCashFlowDashboard(accounts, movements, arOverview.items, apOverview.items, asOfDate, periodFrom, periodTo);
  const projection = computeCashFlowProjection(dashboard.saldoGeral, arOverview.items, apOverview.items, asOfDate);
  const alerts = computeCashFlowAlerts(accounts, movements, transfers, projection, asOfDate, {
    arItems: arOverview.items,
    apItems: apOverview.items,
    saldoGeral: dashboard.saldoGeral,
    periodFrom,
    periodTo,
  });
  const ledger = computeCashLedger(movements, transfers, classifications, rules);
  const receivablesAging = computeReceivableAging(arOverview.items, asOfDate);
  const payablesAging = computePayableAging(apOverview.items, asOfDate);

  return { dashboard, projection, alerts, ledger, accounts, receivablesAging, payablesAging };
}

// --- Contabilidade Gerencial / DRE ---
// DRE gerencial para apoio à administração. Não substitui escrituração contábil, demonstrações
// oficiais ou obrigações preparadas pela contabilidade.

export interface DreSourceData {
  accountsPayable: Awaited<ReturnType<ReturnType<typeof getFinanceRepository>["listAccountsPayable"]>>;
  accountsReceivable: Awaited<ReturnType<ReturnType<typeof getFinanceRepository>["listAccountsReceivable"]>>;
  cashMovements: CashMovement[];
  classifications: FinancialClassification[];
  rules: ClassificationRule[];
  partners: Partner[];
  jumpParkOrders: JumpParkRevenueCandidateInput[];
  stoneFeeDays: StoneFeeCandidateInput[];
  historicalRevenueRecords: HistoricalRevenueCandidateInput[];
}

/**
 * Busca todos os dados-fonte da DRE em UMA única rodada de queries. Missão V3.0: chamadores que
 * precisam de múltiplos relatórios (comparação + por centro de custo + série mensal) DEVEM chamar
 * isto uma vez e passar o resultado via `preFetchedData` para cada função — chamar 3x em paralelo
 * serializa 3 rodadas completas de queries no pool de conexão único do Neon (`max: 1`) e derrubou o
 * tempo de carregamento de `/financeiro/dre` para minutos (medido em preview local).
 *
 * Missão V3.1: inclui `jumpParkOrders`, a receita operacional real do JumpPark — ver
 * `fetchJumpParkRevenueCandidates` para a regra de exclusão de itens IESA/desconto/situação.
 *
 * Missão UX/Navegação 2: inclui `historicalRevenueRecords`, a receita real da planilha histórica
 * pré-JumpPark (`fetchHistoricalRevenueCandidates`) — sem esta fonte, competências anteriores a
 * `DATA_CORTE_JUMPPARK` (01/01–30/04/2026) nunca tinham receita reconhecida pela DRE, mesmo
 * havendo receita real registrada.
 */
export async function fetchDreSourceData(): Promise<DreSourceData> {
  const repo = getFinanceRepository();
  const [accountsPayable, accountsReceivable, cashMovements, classifications, rules, partners, jumpParkOrders, stoneFeeDays, historicalRevenueRecords] = await Promise.all([
    repo.listAccountsPayable(),
    repo.listAccountsReceivable(),
    repo.listCashMovements(),
    repo.listFinancialClassifications(),
    repo.listClassificationRules(),
    repo.listPartners(),
    fetchJumpParkRevenueCandidates(),
    fetchStoneFeeCandidatesForDre(),
    fetchHistoricalRevenueCandidates(),
  ]);
  return { accountsPayable, accountsReceivable, cashMovements, classifications, rules, partners, jumpParkOrders, stoneFeeDays, historicalRevenueRecords };
}

export async function fetchDreReport(
  regime: DreRegime,
  competenceFrom: string,
  competenceTo: string,
  costCenterGroup: DreCostCenterGroup | "consolidado" = "consolidado",
): Promise<DreReport> {
  const data = await fetchDreSourceData();
  return computeDreReport({ regime, competenceFrom, competenceTo, costCenterGroup, ...data });
}

/** Chama a DRE 3 vezes (uma por centro de custo) — reaproveita computeDreReport, nenhuma lógica nova. */
export async function fetchDreByCostCenterGroups(
  regime: DreRegime,
  competenceFrom: string,
  competenceTo: string,
  preFetchedData?: DreSourceData,
): Promise<Record<DreCostCenterGroup, DreReport>> {
  const data = preFetchedData ?? (await fetchDreSourceData());
  const groups: DreCostCenterGroup[] = ["estetica_automotiva", "estacionamento", "administrativo_geral"];
  const entries = groups.map((group) => [group, computeDreReport({ regime, competenceFrom, competenceTo, costCenterGroup: group, ...data })] as const);
  return Object.fromEntries(entries) as Record<DreCostCenterGroup, DreReport>;
}

export interface DreComparison {
  current: DreReport;
  previous: DreReport;
}

export async function fetchDreComparison(
  regime: DreRegime,
  currentFrom: string,
  currentTo: string,
  previousFrom: string,
  previousTo: string,
  costCenterGroup: DreCostCenterGroup | "consolidado" = "consolidado",
  preFetchedData?: DreSourceData,
): Promise<DreComparison> {
  const data = preFetchedData ?? (await fetchDreSourceData());
  return {
    current: computeDreReport({ regime, competenceFrom: currentFrom, competenceTo: currentTo, costCenterGroup, ...data }),
    previous: computeDreReport({ regime, competenceFrom: previousFrom, competenceTo: previousTo, costCenterGroup, ...data }),
  };
}

/** "YYYY-MM" → último dia real do mês ("YYYY-MM-DD") — exportado para reuso em `dreSnapshot.ts` (Fase C7), nunca duplicado. */
export function lastDayOfMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(year, monthNumber, 0).toISOString().slice(0, 10);
}

export interface DreMonthlyPoint {
  month: string;
  report: DreReport;
}

/**
 * Missão Financeiro V3.0 — série mensal da DRE (ex.: Jan-Ago/2026, agosto parcial). Busca os dados
 * uma única vez e reaproveita `computeDreReport` por mês, mesmo padrão de `fetchDreByCostCenterGroups`.
 * Cada mês é sempre 1º ao último dia real do calendário — quando o mês ainda não terminou (ex.: mês
 * corrente), o chamador deve passar `to` explícito via `monthOverrides`, nunca inventamos um corte.
 */
export async function fetchDreMonthlySeries(
  regime: DreRegime,
  months: string[],
  costCenterGroup: DreCostCenterGroup | "consolidado" = "consolidado",
  monthOverrides: Record<string, { to: string }> = {},
  preFetchedData?: DreSourceData,
): Promise<DreMonthlyPoint[]> {
  const data = preFetchedData ?? (await fetchDreSourceData());
  return months.map((month) => {
    const from = `${month}-01`;
    const to = monthOverrides[month]?.to ?? lastDayOfMonth(month);
    return { month, report: computeDreReport({ regime, competenceFrom: from, competenceTo: to, costCenterGroup, ...data }) };
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface DreCoverage {
  countTotal: number;
  countClassified: number;
  countPercent: number | null;
  valueTotal: number;
  valueClassified: number;
  valuePercent: number | null;
}

/**
 * Cobertura de classificação da DRE, por contagem E por valor (Missão V3.0) — valor é mais
 * relevante gerencialmente do que contagem (uma linha de R$0,50 pendente pesa igual a uma de
 * R$10.000 na contagem, mas não no valor). Nunca soma `naoClassificados` nos totais da DRE — só
 * mede a proporção classificada/pendente sobre o total de lançamentos reais do período.
 */
export function computeDreCoverage(report: DreReport): DreCoverage {
  const groups = [
    report.receitaBrutaEstetica,
    report.receitaBrutaEstacionamento,
    report.receitaBrutaParceriasCorporativas,
    report.receitaBrutaOutras,
    report.deducoes,
    report.custosDiretos,
    report.despesasOperacionais,
    report.resultadoFinanceiro,
    report.tributos,
  ];
  const countClassified = groups.reduce((sum, g) => sum + g.items.length, 0);
  const valueClassified = round2(groups.reduce((sum, g) => sum + g.items.reduce((s, i) => s + i.amount, 0), 0));
  const countPending = report.naoClassificados.length;
  const valuePending = round2(report.naoClassificados.reduce((sum, i) => sum + i.amount, 0));

  const countTotal = countClassified + countPending;
  const valueTotal = round2(valueClassified + valuePending);

  return {
    countTotal,
    countClassified,
    countPercent: countTotal > 0 ? round2((countClassified / countTotal) * 100) : null,
    valueTotal,
    valueClassified,
    valuePercent: valueTotal > 0 ? round2((valueClassified / valueTotal) * 100) : null,
  };
}

export interface DrePendencyOverview {
  /** Lançamentos já em accounts_payable/receivable/cash_movements, mas sem classificação de DRE (fonte: `report.naoClassificados`). */
  dreNaoClassificados: { count: number; value: number };
  /** Linhas do extrato bancário ainda não classificadas (status "a_classificar") — nem chegaram a virar cash_movement. Pool anterior e distinto do de `dreNaoClassificados`, nunca somado a ele. */
  extratoAClassificar: { count: number; value: number };
}

/**
 * Transparência de pendências (Missão V3.0, Fase 40) — dois pools distintos e NUNCA somados entre
 * si nem à DRE: (1) lançamentos que já entraram no sistema financeiro mas ficaram sem classificação
 * de DRE, e (2) linhas de extrato bancário que ainda nem viraram lançamento algum. Não existe hoje
 * no banco uma distinção formal "pendência técnica" x "baixa materialidade" (nenhum campo/tag
 * assim foi criado nas Missões V2.4–V2.8) — inventar essa separação aqui seria fabricar uma
 * categoria que não existe nos dados reais.
 */
export async function fetchDrePendencyOverview(report: DreReport): Promise<DrePendencyOverview> {
  const { getBankStatementRepository } = await import("@/lib/finance/bankStatement/repository-factory");
  const pendingLines = await getBankStatementRepository().listLines({ status: "a_classificar" });
  return {
    dreNaoClassificados: {
      count: report.naoClassificados.length,
      value: round2(report.naoClassificados.reduce((sum, i) => sum + i.amount, 0)),
    },
    extratoAClassificar: {
      count: pendingLines.length,
      value: round2(pendingLines.reduce((sum, l) => sum + Math.abs(l.amount), 0)),
    },
  };
}

/**
 * Fila de pendências do módulo de classificação — lançamentos sem classificação, com revisão
 * necessária, despesas compartilhadas (Administrativo/Geral) sem rateio configurado, fornecedor/
 * cliente sem regra. Calculada sob demanda a partir dos lançamentos reais, nunca persistida.
 */
export async function fetchClassificationQueue(): Promise<ClassificationQueueItem[]> {
  const [data, allocationRules] = await Promise.all([fetchDreSourceData(), getFinanceRepository().listAllocationRules()]);
  const hasAllocation = allocationRules.length > 0;

  const explicitByKey = new Map<string, FinancialClassification>();
  for (const c of data.classifications) {
    if (c.accountsPayableId) explicitByKey.set(`accounts_payable:${c.accountsPayableId}`, c);
    if (c.accountsReceivableId) explicitByKey.set(`accounts_receivable:${c.accountsReceivableId}`, c);
    if (c.cashMovementId) explicitByKey.set(`cash_movement:${c.cashMovementId}`, c);
  }

  const items: ClassificationQueueItem[] = [];

  for (const ap of data.accountsPayable) {
    if (ap.status === "cancelada") continue;
    const explicit = explicitByKey.get(`accounts_payable:${ap.id}`);
    const resolved = resolveClassification({ categoryName: ap.categoryName, supplierId: ap.supplierId, partnerId: null, description: ap.description }, explicit, data.rules);
    const base = { sourceKind: "accounts_payable" as const, sourceId: ap.id, date: ap.competenceDate, description: ap.description, partyName: ap.supplierName, categoryName: ap.categoryName, costCenterName: ap.costCenterName, amount: ap.originalAmount };
    if (resolved.origin === "pendente") items.push({ ...base, reason: ap.supplierId ? "sem_classificacao" : "fornecedor_sem_regra" });
    else if (resolved.reviewNeeded) items.push({ ...base, reason: "revisao_necessaria" });
    else if (ap.costCenterName === "Administrativo" && !hasAllocation) items.push({ ...base, reason: "despesa_compartilhada_sem_rateio" });
  }

  for (const ar of data.accountsReceivable) {
    if (ar.status === "cancelled") continue;
    const explicit = explicitByKey.get(`accounts_receivable:${ar.id}`);
    const resolved = resolveClassification({ categoryName: ar.categoryName, supplierId: null, partnerId: ar.partnerId, description: ar.description }, explicit, data.rules);
    const base = { sourceKind: "accounts_receivable" as const, sourceId: ar.id, date: ar.competenceDate, description: ar.description, partyName: ar.partyName, categoryName: ar.categoryName, costCenterName: ar.costCenterName, amount: ar.expectedAmount };
    if (resolved.origin === "pendente") items.push({ ...base, reason: ar.partnerId ? "sem_classificacao" : "cliente_sem_regra" });
    else if (resolved.reviewNeeded) items.push({ ...base, reason: "revisao_necessaria" });
  }

  for (const cm of data.cashMovements) {
    if (cm.accountsPayableId || cm.accountsReceivableId) continue; // já cobertos via a conta a pagar/receber de origem
    const explicit = explicitByKey.get(`cash_movement:${cm.id}`);
    const resolved = resolveCashMovementClassification(cm, explicit, data.rules);
    const base = { sourceKind: "cash_movement" as const, sourceId: cm.id, date: cm.date, description: cm.description, partyName: cm.partyName, categoryName: cm.categoryName, costCenterName: cm.costCenterName, amount: cm.amount };
    if (resolved.origin === "pendente") items.push({ ...base, reason: "sem_classificacao" });
    else if (resolved.reviewNeeded) items.push({ ...base, reason: "revisao_necessaria" });
  }

  return items.sort((a, b) => b.date.localeCompare(a.date));
}

export async function fetchClassificationRules(): Promise<ClassificationRule[]> {
  return getFinanceRepository().listClassificationRules();
}

export async function fetchAccountingPeriods(): Promise<AccountingPeriod[]> {
  return getFinanceRepository().listAccountingPeriods();
}

export interface AccountingPeriodOverview {
  period: AccountingPeriod | null;
  competenceMonth: string;
  pendingClassifications: number;
  overdueAccountsPayable: number;
  openAccountsReceivable: number;
  unbilledAllocations: boolean;
}

/** Painel de fechamento — nunca fecha nada sozinho, só reúne os números para a decisão humana. */
export async function fetchAccountingPeriodOverview(competenceMonth: string, asOfDate: string = new Date().toISOString().slice(0, 10)): Promise<AccountingPeriodOverview> {
  const [period, queue, apOverview, arOverview, allocationRules] = await Promise.all([
    getFinanceRepository().getAccountingPeriod(competenceMonth),
    fetchClassificationQueue(),
    fetchAccountsPayableOverview(asOfDate),
    fetchAccountsReceivableOverview(asOfDate),
    getFinanceRepository().listAllocationRules(),
  ]);

  const inMonth = (dateIso: string) => dateIso.slice(0, 7) === competenceMonth;

  return {
    period,
    competenceMonth,
    pendingClassifications: queue.filter((i) => inMonth(i.date)).length,
    overdueAccountsPayable: apOverview.items.filter((i) => inMonth(i.competenceDate) && i.computedStatus === "vencida").length,
    openAccountsReceivable: arOverview.items.filter((i) => inMonth(i.competenceDate) && (i.computedStatus === "open" || i.computedStatus === "partially_paid" || i.computedStatus === "overdue")).length,
    unbilledAllocations: allocationRules.length === 0,
  };
}

export type AccountingAlertLevel =
  | "margem_negativa"
  | "resultado_operacional_negativo"
  | "centro_custo_negativo"
  | "despesa_compartilhada_sem_rateio"
  | "competencia_proxima_fechamento"
  | "aumento_despesa_relevante"
  | "periodo_parcial"
  | "cobertura_baixa";

export interface AccountingAlert {
  level: AccountingAlertLevel;
  message: string;
  amount: number | null;
}

const DESPESA_INCREASE_THRESHOLD_PERCENT = 30;
/** Heurística, não um limite contábil oficial — configurável, só sinaliza quando a cobertura por valor cai abaixo disso. */
const LOW_COVERAGE_VALUE_THRESHOLD_PERCENT = 80;

/**
 * Calculado sob demanda a partir da própria DRE — nunca persiste nada. `coverage` e
 * `isPartialPeriod` são opcionais (Missão V3.0) — quando omitidos, os alertas correspondentes
 * simplesmente não disparam, mantendo retrocompatibilidade com qualquer chamador existente.
 */
export function computeAccountingAlerts(
  current: DreReport,
  previous: DreReport | null,
  byCostCenter: Record<DreCostCenterGroup, DreReport> | null,
  coverage?: DreCoverage,
  isPartialPeriod?: boolean,
): AccountingAlert[] {
  const alerts: AccountingAlert[] = [];

  if (isPartialPeriod) {
    alerts.push({
      level: "periodo_parcial",
      message: "O período selecionado ainda não terminou — os valores mostrados são parciais, não representam o mês fechado.",
      amount: null,
    });
  }
  if (coverage && coverage.valuePercent !== null && coverage.valuePercent < LOW_COVERAGE_VALUE_THRESHOLD_PERCENT) {
    alerts.push({
      level: "cobertura_baixa",
      message: `Cobertura de classificação por valor abaixo de ${LOW_COVERAGE_VALUE_THRESHOLD_PERCENT}% (heurística, limite configurável) — ${coverage.valuePercent}% do valor do período está classificado na DRE.`,
      amount: coverage.valueClassified,
    });
  }

  if (current.margemContribuicaoPercentual !== null && current.margemContribuicaoPercentual < 0) {
    alerts.push({ level: "margem_negativa", message: "Margem de contribuição negativa no período.", amount: current.margemContribuicao });
  }
  if (current.resultadoOperacional !== null && current.resultadoOperacional < 0) {
    alerts.push({ level: "resultado_operacional_negativo", message: "Resultado operacional negativo no período.", amount: current.resultadoOperacional });
  }
  if (current.naoClassificados.some((i) => i.costCenterName === "Administrativo")) {
    alerts.push({ level: "despesa_compartilhada_sem_rateio", message: "Há despesas em Administrativo/Geral sem rateio configurado.", amount: null });
  }
  if (byCostCenter) {
    for (const [group, report] of Object.entries(byCostCenter) as [DreCostCenterGroup, DreReport][]) {
      if (report.resultadoOperacional !== null && report.resultadoOperacional < 0) {
        alerts.push({ level: "centro_custo_negativo", message: `Centro de custo "${group}" com resultado operacional negativo.`, amount: report.resultadoOperacional });
      }
    }
  }
  if (previous && previous.despesasOperacionais.amount > 0) {
    const variation = ((current.despesasOperacionais.amount - previous.despesasOperacionais.amount) / previous.despesasOperacionais.amount) * 100;
    if (variation >= DESPESA_INCREASE_THRESHOLD_PERCENT) {
      alerts.push({ level: "aumento_despesa_relevante", message: `Despesas operacionais subiram ${Math.round(variation)}% em relação ao período anterior.`, amount: current.despesasOperacionais.amount });
    }
  }

  return alerts;
}
