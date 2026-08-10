import { AT_RISK_CUSTOMER_DAYS } from "@/lib/crm-intelligente/profile";

/**
 * Missão 29 (sistema gerencial completo) — segmentos de gestão de Clientes, calculados sobre a
 * mesma tabela `customers` (source='jumppark') e sobre `jumppark_service_orders` já usadas em
 * `customersQuery.ts`. Nenhum limiar novo inventado sem necessidade: reaproveita
 * `RECORRENTE_VISIT_THRESHOLD`/`VIP_VISIT_THRESHOLD`/`VIP_MAX_INACTIVITY_DAYS`/`AT_RISK_CUSTOMER_DAYS`
 * já definidos e testados em `crm-intelligente/profile.ts`. Só "reativado" é um conceito novo
 * (não existia antes) — parte pura, testável isoladamente, fica aqui.
 */

export type CustomerSegmentKey = "novos" | "recorrentes" | "reativados" | "vip" | "sem_retorno_30" | "sem_retorno_45" | "sem_retorno_60" | "sem_retorno_90" | "mais_veiculos";

export const CUSTOMER_SEGMENT_LABELS: Record<CustomerSegmentKey, string> = {
  novos: "Novos no período",
  recorrentes: "Recorrentes",
  reativados: "Reativados no período",
  vip: "VIP",
  sem_retorno_30: "Sem retorno há 30+ dias",
  sem_retorno_45: "Sem retorno há 45+ dias",
  sem_retorno_60: "Sem retorno há 60+ dias",
  sem_retorno_90: "Sem retorno há 90+ dias",
  mais_veiculos: "Com mais de 1 veículo",
};

export const CUSTOMER_SEGMENT_KEYS: CustomerSegmentKey[] = ["novos", "recorrentes", "reativados", "vip", "sem_retorno_30", "sem_retorno_45", "sem_retorno_60", "sem_retorno_90", "mais_veiculos"];

/**
 * "Reativado": cliente com pelo menos uma visita dentro do período informado, cuja visita
 * imediatamente anterior (se existir) ficou a mais de `gapDays` dias de distância — ou seja,
 * passou por um período de inatividade "em risco"/"perdido" e voltou. Cliente cuja PRIMEIRA
 * visita de todas cai dentro do período é "novo", não "reativado" (não tem visita anterior para
 * medir o intervalo). Pura — recebe as datas já ordenadas, nunca faz I/O.
 */
export function isReactivatedInPeriod(orderDatesSortedAsc: string[], period: { from: string; to: string }, gapDays: number = AT_RISK_CUSTOMER_DAYS): boolean {
  for (let i = 0; i < orderDatesSortedAsc.length; i++) {
    const date = orderDatesSortedAsc[i];
    if (date < period.from || date > period.to) continue;
    if (i === 0) continue; // primeira visita de todos os tempos cai no período -> é "novo", não "reativado".
    const previousDate = orderDatesSortedAsc[i - 1];
    const gap = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${previousDate}T00:00:00Z`)) / 86_400_000);
    if (gap > gapDays) return true;
  }
  return false;
}
