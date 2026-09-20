import type { EmployeePaymentCategory } from "@/lib/hr/costSummary";

/**
 * Fase 6 do Departamento Pessoal, Parte B (20/09/2026) — "Resumo de Ganhos": 5 baldes de pagamento
 * (Salário/fixo, Comissão, Meta/bônus, Benefícios/auxílios, Outros) + Adiantamentos, agrupamento
 * PRÓPRIO deste painel — deliberadamente separado de `outrosTotal`/`CATEGORY_LABELS`
 * (`costSummary.ts`, usado pelos cards da Fase 1 e pelo formulário de pagamento): o mesmo dado
 * bruto (`employee_payments.category`) nunca é alterado, só agrupado de duas formas diferentes
 * para dois painéis diferentes — misturar as duas definições de "outros" acoplaria módulos que
 * hoje podem evoluir de forma independente. Vive fora de `hr/repository.ts` (`server-only`) porque
 * o filtro de categoria é um Client Component e precisa dos rótulos para o `<select>`.
 */
export type EarningsCategory = "salario_fixo" | "comissao" | "meta_bonus" | "beneficios" | "outros" | "adiantamento";

export const EARNINGS_CATEGORIES: readonly EarningsCategory[] = ["salario_fixo", "comissao", "meta_bonus", "beneficios", "outros", "adiantamento"];

export const EARNINGS_CATEGORY_LABELS: Record<EarningsCategory, string> = {
  salario_fixo: "Salário/fixo",
  comissao: "Comissão",
  meta_bonus: "Meta/bônus",
  beneficios: "Benefícios/auxílios",
  outros: "Outros",
  adiantamento: "Adiantamentos",
};

/**
 * Mapeia a categoria granular de `employee_payments` para o balde do Resumo de Ganhos — nunca
 * reclassifica o dado bruto (a coluna `category` em si nunca é escrita por esta função, só lida),
 * só agrupa para exibição. `adiantamento` aqui é o caso raro/legado de um `employee_payment`
 * antigo com essa categoria (a partir da Fase 4, "Registrar pagamento" bloqueia essa categoria —
 * todo adiantamento novo vai para `employee_advances`); nunca somado nos 5 baldes de pagamento
 * (ver `computeCollaboratorEarnings`, `hr/earnings.ts`) para não contar a mesma saída de caixa
 * duas vezes quando também existir um `employee_advance` real para o mesmo evento.
 */
export function paymentCategoryToEarningsCategory(category: EmployeePaymentCategory): EarningsCategory {
  switch (category) {
    case "salario_fixo":
      return "salario_fixo";
    case "comissao":
      return "comissao";
    case "bonus":
      return "meta_bonus";
    case "beneficio_auxilio":
      return "beneficios";
    case "adiantamento":
      return "adiantamento";
    default:
      // diaria_freelancer, reembolso, desconto_compensacao, rescisao, ferias, decimo_terceiro, encargo, outro
      return "outros";
  }
}
