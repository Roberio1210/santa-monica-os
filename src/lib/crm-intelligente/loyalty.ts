import type { CustomerOverviewEntry } from "@/lib/crm-intelligente/overview";
import { RECORRENTE_VISIT_THRESHOLD, VIP_VISIT_THRESHOLD } from "@/lib/crm-intelligente/profile";

/**
 * "Clientes que merecem atenção" (Missão 25, seção 8) — nunca concede nada automaticamente, só
 * sugere com motivo e histórico reais. Critérios pedidos pelo usuário sem fonte de dado real no
 * projeto hoje (indicação de novos clientes, ausência de reclamações, retorno após ação de
 * recuperação) são declarados explicitamente como não rastreados — nunca inventados.
 */

export type LoyaltySuggestionKind = "lavagem_cortesia" | "desconto" | "mensagem_agradecimento" | "contato_pessoal";

export const LOYALTY_SUGGESTION_LABEL: Record<LoyaltySuggestionKind, string> = {
  lavagem_cortesia: "Lavagem de cortesia",
  desconto: "Desconto na próxima visita",
  mensagem_agradecimento: "Mensagem de agradecimento",
  contato_pessoal: "Contato pessoal do proprietário",
};

export interface LoyaltySuggestion {
  kind: LoyaltySuggestionKind;
  reason: string;
  estimatedCost: string;
}

export interface LoyaltyCandidate {
  entry: CustomerOverviewEntry;
  reasonEligible: string;
  suggestions: LoyaltySuggestion[];
  untrackedCriteria: string[];
}

const UNTRACKED_CRITERIA = ["Indicação de novos clientes (não rastreado hoje)", "Ausência de reclamações (não rastreado hoje)", "Retorno após ação de recuperação anterior (não rastreado hoje)"];

/** Elegível quando é VIP ou recorrente pelas mesmas réguas já usadas no resto do CRM Inteligente. */
export function isLoyaltyCandidate(entry: CustomerOverviewEntry): boolean {
  return entry.profile.isVip || entry.profile.isRecurring;
}

function buildSuggestions(entry: CustomerOverviewEntry): LoyaltySuggestion[] {
  const suggestions: LoyaltySuggestion[] = [];

  if (entry.profile.isVip && !entry.lastCourtesy) {
    suggestions.push({
      kind: "lavagem_cortesia",
      reason: `Cliente VIP (${entry.profile.visitCount} visitas, última há ${entry.profile.daysSinceLastVisit} dia(s)) sem nenhuma cortesia registrada até hoje.`,
      estimatedCost: "Não estimável nesta versão — depende do preço do serviço escolhido no catálogo.",
    });
  }

  if (entry.lastCourtesy) {
    suggestions.push({
      kind: "mensagem_agradecimento",
      reason: `Última cortesia concedida: ${entry.lastCourtesy.description} em ${entry.lastCourtesy.grantedAt.slice(0, 10)}. Evitar nova cortesia repetida — sugerido apenas um agradecimento.`,
      estimatedCost: "R$ 0,00 (mensagem)",
    });
  } else if (entry.profile.totalSpent >= 1000 && !entry.profile.isVip) {
    suggestions.push({
      kind: "desconto",
      reason: `Total gasto de ${entry.profile.totalSpent.toFixed(2)} sem nenhuma cortesia ou desconto de fidelização registrado.`,
      estimatedCost: "A definir pelo responsável, com base no valor médio do cliente.",
    });
  }

  if (entry.profile.daysSinceLastVisit !== null && entry.profile.daysSinceLastVisit > 60 && entry.profile.isRecurring) {
    suggestions.push({
      kind: "contato_pessoal",
      reason: `Cliente recorrente (${entry.profile.visitCount} visitas) sem retorno há ${entry.profile.daysSinceLastVisit} dias — risco de perda de um cliente historicamente fiel.`,
      estimatedCost: "R$ 0,00 (contato)",
    });
  }

  return suggestions;
}

export function buildLoyaltyCandidates(entries: CustomerOverviewEntry[]): LoyaltyCandidate[] {
  return entries
    .filter(isLoyaltyCandidate)
    .map((entry) => ({
      entry,
      reasonEligible: entry.profile.isVip
        ? `VIP: ${entry.profile.visitCount} visitas (mínimo ${VIP_VISIT_THRESHOLD}), ativo nos últimos 90 dias.`
        : `Recorrente: ${entry.profile.visitCount} visitas (mínimo ${RECORRENTE_VISIT_THRESHOLD}).`,
      suggestions: buildSuggestions(entry),
      untrackedCriteria: UNTRACKED_CRITERIA,
    }))
    .sort((a, b) => b.entry.profile.totalSpent - a.entry.profile.totalSpent);
}
