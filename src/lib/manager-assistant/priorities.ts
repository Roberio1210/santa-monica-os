/**
 * Seção 2 (Prioridades de Hoje) — contagens reais, cada uma levando direto ao registro de
 * origem. Nunca frases genéricas: só aparece quando a contagem é maior que zero. Limitado a 7,
 * mas as 6 categorias reais já respeitam o teto sem truncar nada.
 */

export type PriorityLevel = "critico" | "atencao" | "informativo";

export interface OperationalPriority {
  id: string;
  label: string;
  count: number;
  level: PriorityLevel;
  href: string;
}

const MAX_PRIORITIES = 7;

export function derivePriorities(counts: {
  aguardandoExecucao: number;
  execucaoAtrasada: number;
  aguardandoConferencia: number;
  prontos: number;
  diagnosticoPendente: number;
  ordensSemValor: number;
}): OperationalPriority[] {
  const candidates: OperationalPriority[] = [
    { id: "aguardando_execucao", label: `${counts.aguardandoExecucao} veículo(s) aguardando início da execução`, count: counts.aguardandoExecucao, level: "informativo", href: "/atendimento/execucao" },
    { id: "execucao_atrasada", label: `${counts.execucaoAtrasada} veículo(s) em execução há mais de 3 horas`, count: counts.execucaoAtrasada, level: "critico", href: "/atendimento/execucao" },
    { id: "aguardando_conferencia", label: `${counts.aguardandoConferencia} veículo(s) aguardando conferência`, count: counts.aguardandoConferencia, level: "atencao", href: "/atendimento/execucao" },
    { id: "prontos", label: `${counts.prontos} veículo(s) pronto(s) aguardando retirada`, count: counts.prontos, level: "atencao", href: "/atendimento/entregas" },
    { id: "diagnostico_pendente", label: `${counts.diagnosticoPendente} diagnóstico(s) pendente(s)`, count: counts.diagnosticoPendente, level: "atencao", href: "/assistente-gerente" },
    { id: "ordens_sem_valor", label: `${counts.ordensSemValor} ordem(ns) entregue(s) sem valor registrado`, count: counts.ordensSemValor, level: "critico", href: "/assistente-gerente" },
  ];

  return candidates.filter((p) => p.count > 0).slice(0, MAX_PRIORITIES);
}
