/**
 * Objetivo de negócio inferido por trás de uma pergunta (Etapa 2 do pipeline de raciocínio —
 * ver docs/zezinho-3.0-architecture.md, seção 5). Não é a intenção ("o que a pessoa quer"), é o
 * "para quê": "Devemos vender mais Silver?" tem intenção `evaluate_decision`, mas o objetivo real
 * é `improve_service_mix` — a resposta deve situar isso dentro do problema de ticket médio, não
 * só contar pacotes Silver.
 */
export type BusinessObjective =
  | "increase_ticket"
  | "improve_service_mix"
  | "increase_revenue"
  | "reduce_costs"
  | "improve_cash_flow"
  | "evaluate_pricing"
  | "staffing_capacity"
  | "client_retention"
  | "business_health";

export type ObjectiveDataAvailability = "real" | "proxy_only";

/**
 * Para cada objetivo, indica se hoje existe dado real e direto para fundamentá-lo ou se só é
 * possível estimativa por proxy — decisão do usuário (item 1 da resposta à arquitetura): proxies
 * são aceitáveis, desde que sempre rotulados como estimativa, nunca apresentados como fato.
 *
 * `staffing_capacity` é `proxy_only` porque não existe módulo de equipe/agenda real (ver
 * docs/zezinho-3.0-architecture.md, seção 2) — qualquer raciocínio sobre contratação nas próximas
 * etapas precisa vir marcado como inferência (ex.: usar volume de veículos e concentração de
 * horário de pico como indício indireto de capacidade), nunca como medição direta.
 *
 * `client_retention` é `real` porque `fetchCrmCustomers` (src/lib/crm/service.ts) já existe e é
 * dado real, mesmo sem nenhuma tela o consumindo ainda (decisão do usuário, item 3: integrar
 * imediatamente qualquer fonte real já existente).
 */
export const OBJECTIVE_DATA_AVAILABILITY: Record<BusinessObjective, ObjectiveDataAvailability> = {
  increase_ticket: "real",
  improve_service_mix: "real",
  increase_revenue: "real",
  reduce_costs: "real",
  improve_cash_flow: "real",
  evaluate_pricing: "real",
  staffing_capacity: "proxy_only",
  client_retention: "real",
  business_health: "real",
};

export interface ObjectiveResult {
  objective: BusinessObjective | null;
  /** `true` quando o objetivo foi reaproveitado da última análise da sessão, não reinferido. */
  reused: boolean;
  /** Explicação curta em português — não é necessariamente mostrada ao usuário, é para depuração/transparência interna. */
  rationale: string;
  dataAvailability: ObjectiveDataAvailability | null;
}
