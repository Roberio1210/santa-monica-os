import type { Customer, CustomerHistorySummary, Vehicle } from "@/lib/attendance/types";

/**
 * Seção 3 (Clientes que merecem atenção) — puro, sem I/O. Só sinaliza quando há evidência real
 * (nunca todo cliente aparece aqui). Escopo desta versão, por dado disponível:
 *  - observação no cadastro (`customer.notes`);
 *  - recomendação técnica pendente (`history.pendingRecommendations`, já definida em history.ts
 *    como "recomendação que nunca virou Ordem de Serviço");
 *  - observação de diagnóstico anterior (`history.observations`);
 *  - cliente recorrente (`visitCount >= RECORRENTE_VISIT_THRESHOLD`).
 * Fora do escopo (sem dado estruturado para comprovar, ver relatório final): "serviço recente
 * que não deve ser oferecido de novo" e preferências categorizadas (cheiro forte, horário
 * preferido) — essas seguem só como texto livre em `customer.notes`/observações, nunca
 * classificadas automaticamente.
 */

export const RECORRENTE_VISIT_THRESHOLD = 3;

export interface ClientAttentionEntry {
  customerId: string;
  customerName: string | null;
  vehicles: { id: string; label: string }[];
  lastVisitAt: string | null;
  lastServices: string[];
  observations: string[];
  pendingRecommendationsCount: number;
  reasons: string[];
}

export function deriveClientAttention(params: { customer: Customer; vehicles: Vehicle[]; history: CustomerHistorySummary; visitCount: number }): ClientAttentionEntry | null {
  const { customer, vehicles, history, visitCount } = params;
  const reasons: string[] = [];

  if (customer.notes && customer.notes.trim().length > 0) reasons.push("Observação registrada no cadastro");
  if (history.pendingRecommendations.length > 0) reasons.push(`${history.pendingRecommendations.length} recomendação(ões) técnica(s) pendente(s)`);
  if (history.observations.length > 0) reasons.push("Observação registrada em diagnóstico anterior");
  if (visitCount >= RECORRENTE_VISIT_THRESHOLD) reasons.push("Cliente recorrente");

  if (reasons.length === 0) return null;

  return {
    customerId: customer.id,
    customerName: customer.name,
    vehicles: vehicles.map((v) => ({ id: v.id, label: [v.brand, v.model].filter(Boolean).join(" ") || "Veículo" })),
    lastVisitAt: history.lastVisitAt,
    lastServices: history.lastServices,
    observations: history.observations,
    pendingRecommendationsCount: history.pendingRecommendations.length,
    reasons,
  };
}
