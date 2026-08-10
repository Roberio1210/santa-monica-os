/**
 * Missão 30 (módulo gerencial de Veículos) — segmentos disponíveis na lista `/ordens/veiculos`.
 * Mesma filosofia de `customerSegments.ts`: cada chave mapeia para uma condição objetiva e
 * documentada, nunca um "score de risco" inventado.
 */

export type VehicleSegmentKey =
  | "atendido_hoje"
  | "ultimos_7_dias"
  | "ultimos_30_dias"
  | "ultimos_60_dias"
  | "ultimos_90_dias"
  | "sem_retorno_30"
  | "sem_retorno_45"
  | "sem_retorno_60"
  | "sem_retorno_90"
  | "recorrentes"
  | "unica_visita"
  | "multi_cliente"
  | "multi_servico"
  | "identidade_ambigua"
  | "parou_de_vir";

export const VEHICLE_SEGMENT_LABELS: Record<VehicleSegmentKey, string> = {
  atendido_hoje: "Atendidos hoje",
  ultimos_7_dias: "Últimos 7 dias",
  ultimos_30_dias: "Últimos 30 dias",
  ultimos_60_dias: "Últimos 60 dias",
  ultimos_90_dias: "Últimos 90 dias",
  sem_retorno_30: "Sem retorno há 30+ dias",
  sem_retorno_45: "Sem retorno há 45+ dias",
  sem_retorno_60: "Sem retorno há 60+ dias",
  sem_retorno_90: "Sem retorno há 90+ dias",
  recorrentes: "Recorrentes (3+ visitas)",
  unica_visita: "Apenas uma visita",
  multi_cliente: "Ligados a mais de um cliente",
  multi_servico: "Mais de um serviço por visita",
  identidade_ambigua: "Identidade ambígua",
  parou_de_vir: "Costumava vir e parou",
};

export const VEHICLE_SEGMENT_KEYS: VehicleSegmentKey[] = [
  "atendido_hoje",
  "ultimos_7_dias",
  "ultimos_30_dias",
  "ultimos_60_dias",
  "ultimos_90_dias",
  "sem_retorno_30",
  "sem_retorno_45",
  "sem_retorno_60",
  "sem_retorno_90",
  "recorrentes",
  "unica_visita",
  "multi_cliente",
  "multi_servico",
  "identidade_ambigua",
  "parou_de_vir",
];
