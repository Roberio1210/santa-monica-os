import "server-only";
import { listEmployeePayments, listEmployeeAdvances } from "@/lib/hr/repository";
import { CATEGORY_LABELS, type EmployeePaymentCategory } from "@/lib/hr/costSummary";
import { EARNINGS_CATEGORY_LABELS, paymentCategoryToEarningsCategory, type EarningsCategory } from "@/lib/hr/earningsCategories";
import { MONTH_NAMES_PT, startOfMonthIso, endOfMonthIso, addMonthsIso } from "@/lib/utils/timezone";

/**
 * Fase 6 do Departamento Pessoal, Parte B (20/09/2026) — "Resumo de Ganhos": transforma a ficha
 * individual num painel financeiro real. Toda a lógica de agregação vive aqui (funções puras,
 * testáveis com datas fixas), nunca calculada inline em React — a página só chama
 * `getCollaboratorEarningsSummary`/`getCollaboratorMonthlyEarnings` e renderiza o resultado.
 *
 * `computeCollaboratorEarnings`/`computeMonthlyEarnings` recebem só os campos que realmente usam
 * (`EarningsPaymentInput`/`EarningsAdvanceInput`, não `EmployeePaymentRow`/`EmployeeAdvanceRow`
 * inteiros) — qualquer linha real do repositório satisfaz essas formas por tipagem estrutural, e os
 * testes conseguem montar fixtures mínimas com datas fixas, sem depender do schema Drizzle inteiro.
 */

export interface EarningsPaymentInput {
  id: string;
  category: EmployeePaymentCategory;
  amount: string | number;
  date: string;
  competenceDate: string | null;
  description: string;
}

export interface EarningsAdvanceInput {
  id: string;
  amount: string | number;
  date: string;
  reason: string | null;
  status: string;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

function inPeriod(dateIso: string, period: { from: string; to: string }): boolean {
  return dateIso >= period.from && dateIso <= period.to;
}

export interface EarningsDetailRow {
  id: string;
  kind: "pagamento" | "adiantamento";
  date: string;
  category: EarningsCategory;
  categoryLabel: string;
  description: string;
  amount: number;
  /** Só existe para pagamentos — um adiantamento não tem competência econômica própria. */
  competenceDate: string | null;
  /** Só existe para adiantamentos (aberto/parcialmente_compensado/compensado) — null para pagamentos. */
  status: string | null;
}

export interface CollaboratorEarningsSummary {
  period: { from: string; to: string };
  /** Soma dos 5 baldes de pagamento abaixo — NUNCA inclui adiantamentos. */
  paymentsTotal: number;
  salaryTotal: number;
  commissionTotal: number;
  bonusOrGoalTotal: number;
  benefitsTotal: number;
  otherTotal: number;
  /** Sempre de `employee_advances` — nunca somado silenciosamente ao `paymentsTotal`. */
  advancesTotal: number;
  /** `paymentsTotal + advancesTotal` — métrica distinta, rotulada como "Total de saídas" na UI, nunca confundida com `paymentsTotal`. */
  outflowTotal: number;
  /** Tabela unificada (Data/Tipo/Categoria/Descrição/Valor/Competência/Status), já filtrada por `category` quando informado. */
  items: EarningsDetailRow[];
}

/**
 * Função PURA — recebe o histórico completo (payments/advances) já carregado do banco e filtra por
 * período aqui dentro (nunca no SQL para esta função: permite reuso idêntico no histórico mensal,
 * sem uma query por mês). `category`, quando informado, filtra só a tabela de detalhes — os 7
 * totais/cards sempre refletem o período inteiro, para dar a visão completa antes do drill-down.
 *
 * Um `employee_payment` legado com `category = "adiantamento"` (raríssimo — só existe de antes da
 * Fase 4, que passou a bloquear essa categoria) nunca entra nos 5 baldes de pagamento nem no
 * `advancesTotal`: ele aparece só na tabela de detalhes (`kind: "pagamento"`, categoria
 * "Adiantamentos"), nunca reclassificado. Registrado dessa forma para nunca contar a mesma saída de
 * caixa duas vezes quando também existir um `employee_advance` real apontando para o mesmo
 * `cash_movement` (caso confirmado no histórico real — Jorge, R$100).
 */
export function computeCollaboratorEarnings(
  payments: EarningsPaymentInput[],
  advances: EarningsAdvanceInput[],
  period: { from: string; to: string },
  category?: EarningsCategory,
): CollaboratorEarningsSummary {
  const paymentsInPeriod = payments.filter((p) => inPeriod(p.date, period));
  const advancesInPeriod = advances.filter((a) => inPeriod(a.date, period));

  let salaryTotal = 0;
  let commissionTotal = 0;
  let bonusOrGoalTotal = 0;
  let benefitsTotal = 0;
  let otherTotal = 0;

  const paymentItems: EarningsDetailRow[] = paymentsInPeriod.map((p) => {
    const bucket = paymentCategoryToEarningsCategory(p.category);
    const amount = Number(p.amount);
    if (bucket === "salario_fixo") salaryTotal += amount;
    else if (bucket === "comissao") commissionTotal += amount;
    else if (bucket === "meta_bonus") bonusOrGoalTotal += amount;
    else if (bucket === "beneficios") benefitsTotal += amount;
    else if (bucket === "outros") otherTotal += amount;
    // bucket === "adiantamento": nunca somado aqui — ver comentário da função acima.
    return {
      id: p.id,
      kind: "pagamento",
      date: p.date,
      category: bucket,
      categoryLabel: CATEGORY_LABELS[p.category],
      description: p.description,
      amount,
      competenceDate: p.competenceDate,
      status: null,
    };
  });

  salaryTotal = round2(salaryTotal);
  commissionTotal = round2(commissionTotal);
  bonusOrGoalTotal = round2(bonusOrGoalTotal);
  benefitsTotal = round2(benefitsTotal);
  otherTotal = round2(otherTotal);
  const paymentsTotal = round2(salaryTotal + commissionTotal + bonusOrGoalTotal + benefitsTotal + otherTotal);

  const advanceItems: EarningsDetailRow[] = advancesInPeriod.map((a) => ({
    id: a.id,
    kind: "adiantamento",
    date: a.date,
    category: "adiantamento",
    categoryLabel: EARNINGS_CATEGORY_LABELS.adiantamento,
    description: a.reason ?? "Adiantamento",
    amount: Number(a.amount),
    competenceDate: null,
    status: a.status,
  }));
  const advancesTotal = round2(advanceItems.reduce((sum, i) => sum + i.amount, 0));
  const outflowTotal = round2(paymentsTotal + advancesTotal);

  const allItems = [...paymentItems, ...advanceItems].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const items = category ? allItems.filter((i) => i.category === category) : allItems;

  return { period, paymentsTotal, salaryTotal, commissionTotal, bonusOrGoalTotal, benefitsTotal, otherTotal, advancesTotal, outflowTotal, items };
}

/** Busca o histórico completo do colaborador (nunca filtrado por data no SQL) e delega a agregação à função pura acima. */
export async function getCollaboratorEarningsSummary(input: { subjectId: string; from: string; to: string; category?: EarningsCategory }): Promise<CollaboratorEarningsSummary> {
  const [payments, advances] = await Promise.all([listEmployeePayments({ subjectId: input.subjectId }), listEmployeeAdvances(input.subjectId)]);
  return computeCollaboratorEarnings(payments, advances, { from: input.from, to: input.to }, input.category);
}

export interface MonthlyEarnings {
  monthKey: string;
  label: string;
  from: string;
  to: string;
  paymentsTotal: number;
  salaryTotal: number;
  commissionTotal: number;
  bonusOrGoalTotal: number;
  benefitsTotal: number;
  otherTotal: number;
  advancesTotal: number;
  outflowTotal: number;
}

interface MonthWindow {
  monthKey: string;
  label: string;
  from: string;
  to: string;
}

/**
 * Gera as janelas de mês (mais antigo -> mais recente) terminando no mês de `referenceDateIso` —
 * função pura, separada para ser testável com datas fixas (nunca `new Date()` direto no teste).
 */
export function buildMonthWindows(referenceDateIso: string, monthsBack: number): MonthWindow[] {
  const windows: MonthWindow[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const monthStart = addMonthsIso(referenceDateIso, -i);
    const [year, month] = monthStart.slice(0, 7).split("-").map(Number);
    windows.push({ monthKey: monthStart.slice(0, 7), label: `${MONTH_NAMES_PT[month - 1]}/${year}`, from: startOfMonthIso(monthStart), to: endOfMonthIso(monthStart) });
  }
  return windows;
}

/** Função PURA — mesmo dataset completo (payments/advances) reaproveitado para todos os meses, sem 1 query por mês. */
export function computeMonthlyEarnings(payments: EarningsPaymentInput[], advances: EarningsAdvanceInput[], months: MonthWindow[]): MonthlyEarnings[] {
  return months.map((m) => {
    const s = computeCollaboratorEarnings(payments, advances, { from: m.from, to: m.to });
    return {
      monthKey: m.monthKey,
      label: m.label,
      from: m.from,
      to: m.to,
      paymentsTotal: s.paymentsTotal,
      salaryTotal: s.salaryTotal,
      commissionTotal: s.commissionTotal,
      bonusOrGoalTotal: s.bonusOrGoalTotal,
      benefitsTotal: s.benefitsTotal,
      otherTotal: s.otherTotal,
      advancesTotal: s.advancesTotal,
      outflowTotal: s.outflowTotal,
    };
  });
}

/** `monthsBack` inclui o mês de `referenceDateIso` — default 6 (mês corrente + 5 anteriores). */
export async function getCollaboratorMonthlyEarnings(subjectId: string, referenceDateIso: string, monthsBack = 6): Promise<MonthlyEarnings[]> {
  const [payments, advances] = await Promise.all([listEmployeePayments({ subjectId }), listEmployeeAdvances(subjectId)]);
  return computeMonthlyEarnings(payments, advances, buildMonthWindows(referenceDateIso, monthsBack));
}
