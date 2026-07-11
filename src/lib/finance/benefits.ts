import type { ContractBenefit } from "@/lib/finance/types";

/**
 * Quanto ainda resta de um benefício dentro do período atual (ex.: lavações da funerária).
 * Como nenhum benefício modelado até agora é cumulativo, `usedInPeriod` deve sempre ser
 * contado a partir de zero a cada novo período (mês) — nunca somado com o resto do mês
 * anterior. Isso é o que "renovação mensal, não cumulativa" significa na prática: o contador de
 * uso reinicia, não o de saldo acumulado.
 *
 * quantityPerPeriod === null significa que nenhum limite foi informado — não inventamos um
 * limite, retornamos null (sem teto).
 */
export function remainingBenefitUsage(benefit: Pick<ContractBenefit, "quantityPerPeriod">, usedInPeriod: number): number | null {
  if (benefit.quantityPerPeriod === null) return null;
  const remaining = benefit.quantityPerPeriod - usedInPeriod;
  return remaining > 0 ? remaining : 0;
}
