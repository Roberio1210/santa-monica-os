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

/**
 * Fase 4 (20/09/2026) — categorias que "Registrar pagamento" aceita: só as que já têm exemplo real
 * confirmado na auditoria E mapeamento de DRE conhecido para uma pessoa específica. Vive aqui (não
 * em `hr/repository.ts`, que tem `"server-only"`) porque tanto a server action quanto o formulário
 * (Client Component, precisa renderizar as opções do `<select>`) precisam da mesma lista — nunca
 * duas listas mantidas separadamente. Fora desta lista, de propósito:
 * - `adiantamento` — pertence a `employee_advances` (ação própria, nunca esta função);
 * - `encargo`/`desconto_compensacao`/`rescisao`/`ferias`/`decimo_terceiro` — nenhum exemplo real
 *   encontrado na auditoria vinculado a uma pessoa específica (o único exemplo de `encargo`, o
 *   FGTS, é sempre sem colaborador) — nunca inventamos o `category_id` de DRE correspondente.
 */
export const RECORDABLE_EMPLOYEE_PAYMENT_CATEGORIES = ["salario_fixo", "comissao", "bonus", "diaria_freelancer", "beneficio_auxilio", "reembolso", "outro"] as const;
export type RecordableEmployeePaymentCategory = (typeof RECORDABLE_EMPLOYEE_PAYMENT_CATEGORIES)[number];

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

/**
 * Rótulo de exibição de cada categoria — `Record<EmployeePaymentCategory, string>` (não
 * `Record<string, string>`) de propósito: se uma categoria nova entrar no enum e este objeto não
 * for atualizado, o typecheck quebra em vez de a tela mostrar a chave técnica. Fase 1 da ficha
 * individual (20/09/2026) — movido para cá para `/departamento-pessoal` e
 * `/departamento-pessoal/[id]` usarem o mesmo texto, nunca duplicado.
 */
export const CATEGORY_LABELS: Record<EmployeePaymentCategory, string> = {
  salario_fixo: "Salários/fixos",
  comissao: "Comissões",
  bonus: "Bônus",
  diaria_freelancer: "Diárias/freelas",
  adiantamento: "Adiantamentos",
  beneficio_auxilio: "Benefícios/auxílios",
  reembolso: "Reembolsos",
  desconto_compensacao: "Descontos/compensação",
  rescisao: "Rescisões",
  ferias: "Férias",
  decimo_terceiro: "13º salário",
  encargo: "Encargos/impostos",
  outro: "Outros",
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

/**
 * Ficha individual (Fase 1, 20/09/2026) — mesmo agrupamento "Outros pagamentos" já usado no card
 * de `/departamento-pessoal` (categorias residuais, nenhuma delas granular o bastante para ter
 * card própria ainda). Extraído para cá para a ficha do colaborador reutilizar em vez de repetir
 * a mesma soma dentro do componente React.
 */
export function outrosTotal(porCategoria: PersonnelCostByCategory): number {
  return Math.round((porCategoria.outro + porCategoria.reembolso + porCategoria.desconto_compensacao + porCategoria.rescisao + porCategoria.ferias + porCategoria.decimo_terceiro) * 100) / 100;
}

/** Histórico de UM colaborador, agrupado por categoria — nunca uma soma cega de tudo. */
export function groupPaymentsByCategory<T extends EmployeePaymentForSummary>(payments: T[]): Record<EmployeePaymentCategory, T[]> {
  const grouped = Object.fromEntries(Object.keys(ZERO_BY_CATEGORY).map((k) => [k, [] as T[]])) as Record<EmployeePaymentCategory, T[]>;
  for (const p of payments) grouped[p.category].push(p);
  return grouped;
}
