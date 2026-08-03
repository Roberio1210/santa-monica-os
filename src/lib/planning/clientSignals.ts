import { CLIENT_SIGNAL_LABELS, type ClientSignal } from "@/lib/planning/types";

/** Mesmo limiar de "cliente recorrente" já usado em manager-assistant/clientAttention.ts — decisão consistente do projeto. */
export const RECORRENTE_VISIT_THRESHOLD = 3;

/** ~3 meses sem aparecer — decisão desta sprint, documentada (nenhuma regra de negócio formal define isso). */
export const RETURNING_AFTER_DAYS_THRESHOLD = 90;

export interface ClientSignalInput {
  /** Nº de visitas (service_visits) anteriores a este agendamento — 0 significa que este é o primeiro contato real. */
  visitCount: number;
  daysSinceLastVisit: number | null;
  /** Existe alguma Ordem de Serviço deste cliente ainda não entregue agora. */
  hasOpenOrder: boolean;
  /** Existe recomendação técnica cuja visita nunca resultou em Ordem de Serviço (mesmo critério de `pendingRecommendations`). */
  hasPendingRecommendation: boolean;
  /** Nomes de todos os serviços já comprados pelo cliente, em qualquer visita. */
  purchasedServiceNames: string[];
}

/**
 * Sinalizadores reais do cliente — nunca calcula "VIP": não existe regra de negócio formal para
 * defini-lo (mesma decisão já tomada no Assistente do Gerente, Missão 18). Cada sinal só aparece
 * quando há um dado real correspondente.
 */
export function deriveClientSignals(input: ClientSignalInput): ClientSignal[] {
  const signals: ClientSignal[] = [];

  if (input.visitCount === 0) signals.push({ id: "primeira_visita", label: CLIENT_SIGNAL_LABELS.primeira_visita });
  if (input.visitCount >= RECORRENTE_VISIT_THRESHOLD) signals.push({ id: "recorrente", label: CLIENT_SIGNAL_LABELS.recorrente });
  if (input.daysSinceLastVisit !== null && input.daysSinceLastVisit >= RETURNING_AFTER_DAYS_THRESHOLD) {
    signals.push({ id: "retornando", label: CLIENT_SIGNAL_LABELS.retornando });
  }
  if (input.hasOpenOrder) signals.push({ id: "servicos_pendentes", label: CLIENT_SIGNAL_LABELS.servicos_pendentes });
  if (input.hasPendingRecommendation) signals.push({ id: "recomendacao_pendente", label: CLIENT_SIGNAL_LABELS.recomendacao_pendente });
  if (input.purchasedServiceNames.includes("Premium Detail")) signals.push({ id: "premium_detail", label: CLIENT_SIGNAL_LABELS.premium_detail });
  if (input.purchasedServiceNames.includes("Vitrificação")) signals.push({ id: "vitrificacao_historico", label: CLIENT_SIGNAL_LABELS.vitrificacao_historico });

  return signals;
}
