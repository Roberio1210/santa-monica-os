/**
 * Missão 86 (Departamento Pessoal) — agregação PURA de custo de pessoal por categoria, para a
 * Visão Geral do DP. Nunca soma tudo como "salário": cada categoria de `employee_payments` vira
 * um total separado — quem quiser o total geral soma os totais, nunca o contrário.
 */

export type EmployeePaymentCategory =
  | "salario_fixo"
  | "comissao"
  | "bonus"
  | "diaria_freelancer"
  | "adiantamento"
  | "beneficio_auxilio"
  | "reembolso"
  | "desconto_compensacao"
  | "rescisao"
  | "ferias"
  | "decimo_terceiro"
  | "encargo"
  | "outro";

export interface EmployeePaymentForSummary {
  category: EmployeePaymentCategory;
  amount: number;
}

export type PersonnelCostByCategory = Record<EmployeePaymentCategory, number>;

const ZERO_BY_CATEGORY: PersonnelCostByCategory = {
  salario_fixo: 0,
  comissao: 0,
  bonus: 0,
  diaria_freelancer: 0,
  adiantamento: 0,
  beneficio_auxilio: 0,
  reembolso: 0,
  desconto_compensacao: 0,
  rescisao: 0,
  ferias: 0,
  decimo_terceiro: 0,
  encargo: 0,
  outro: 0,
};

export interface PersonnelCostSummary {
  totalGeral: number;
  porCategoria: PersonnelCostByCategory;
}

/** Soma cada pagamento na sua própria categoria — nunca um único total "salário" para tudo. */
export function summarizePersonnelCost(payments: EmployeePaymentForSummary[]): PersonnelCostSummary {
  const porCategoria: PersonnelCostByCategory = { ...ZERO_BY_CATEGORY };
  for (const p of payments) {
    porCategoria[p.category] = Math.round((porCategoria[p.category] + p.amount) * 100) / 100;
  }
  const totalGeral = Math.round(Object.values(porCategoria).reduce((sum, v) => sum + v, 0) * 100) / 100;
  return { totalGeral, porCategoria };
}

/** Histórico de UM colaborador, agrupado por categoria — nunca uma soma cega de tudo. */
export function groupPaymentsByCategory<T extends EmployeePaymentForSummary>(payments: T[]): Record<EmployeePaymentCategory, T[]> {
  const grouped = Object.fromEntries(Object.keys(ZERO_BY_CATEGORY).map((k) => [k, [] as T[]])) as Record<EmployeePaymentCategory, T[]>;
  for (const p of payments) grouped[p.category].push(p);
  return grouped;
}
