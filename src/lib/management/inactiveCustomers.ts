import "server-only";
import { listCustomerOverviews, type CustomerOverviewEntry } from "@/lib/crm-intelligente/overview";
import { generateCustomerMessage } from "@/lib/crm-intelligente/messages";
import { maskPhone, maskPlate } from "@/lib/utils/mask";

/**
 * Missão Z4, seção 16-19 — clientes que já usaram a estética e não retornam há mais de N dias.
 * Fonte: `listCustomerOverviews()` (CRM Inteligente, Missão 25 — mesma fonte já usada por
 * `/crm/sem-retorno`, nenhuma consulta nova). Diferente de `postSale.ts`: aqui os clientes vêm do
 * CRM interno (`attendance`), então `generateCustomerMessage` (mesmo domínio) é reaproveitada
 * diretamente, sem o problema de correlação entre fontes que existe no pós-venda do dia.
 *
 * Usa o tipo "retorno" (nunca "recuperacao"): "recuperacao" menciona "uma condição especial" —
 * uma promoção que não existe como dado real cadastrado em lugar nenhum do sistema (auditado
 * nesta missão, ver relatório). A missão pede explicitamente para nunca inventar promoção nem
 * usar uma promoção histórica — "retorno" pergunta se pode separar um horário, sem prometer nada.
 */

export const DEFAULT_INACTIVE_MIN_DAYS = 30;
/** Nunca devolve uma lista gigante sem critério (seção 17) — top N depois de priorizado. */
const MAX_CANDIDATES = 12;

export interface InactiveCustomerCandidate {
  customerId: string;
  customerName: string | null;
  vehicleModel: string | null;
  plateMasked: string | null;
  phoneMasked: string | null;
  /** Data ISO da última visita real conhecida — "ÚLTIMA VISITA" no formato pedido pela missão Z5. */
  lastVisitAt: string | null;
  daysSinceLastVisit: number;
  visitCount: number;
  totalSpent: number;
  isRecurring: boolean;
  /** Soma transparente dos critérios abaixo — nunca um score opaco (seção 17). */
  priorityScore: number;
  priorityReasons: string[];
  messageDraft: string;
}

/**
 * Pura. Critérios documentados (nunca escondidos do chamador):
 * +2 se recorrente (>= limiar de recorrência já usado no resto do sistema);
 * +2 se voltou a ficar sem contato há relativamente pouco tempo (<=60 dias — maior chance real de
 *    reengajamento que alguém sumido há 200 dias);
 * +1 se ainda "moderadamente recente" (<=90 dias);
 * +1 se ticket histórico relevante (>= R$500 acumulado).
 */
export function computeInactivePriority(entry: Pick<CustomerOverviewEntry, "profile">): { score: number; reasons: string[] } {
  const { isRecurring, totalSpent, daysSinceLastVisit } = entry.profile;
  let score = 0;
  const reasons: string[] = [];

  if (isRecurring) {
    score += 2;
    reasons.push("Cliente recorrente");
  }
  if (daysSinceLastVisit !== null) {
    if (daysSinceLastVisit <= 60) {
      score += 2;
      reasons.push("Sumiu há relativamente pouco tempo (até 60 dias) — maior chance de reengajamento");
    } else if (daysSinceLastVisit <= 90) {
      score += 1;
      reasons.push("Ainda dentro de uma janela moderada (até 90 dias)");
    }
  }
  if (totalSpent >= 500) {
    score += 1;
    reasons.push("Ticket histórico relevante (≥ R$500 acumulado)");
  }

  return { score, reasons };
}

export interface InactiveCustomersResult {
  minDays: number;
  totalCandidatesBeforeCap: number;
  candidates: InactiveCustomerCandidate[];
  /** Avisos honestos sobre o que este sistema NÃO consegue verificar hoje — nunca escondidos (seções 15/19 da missão). */
  caveats: string[];
}

const CAVEATS = [
  "Este sistema ainda não registra histórico de mensagens/pós-venda/reativação já enviadas — não é possível garantir que algum destes clientes não foi abordado recentemente por outro canal (WhatsApp pessoal, telefone etc.).",
  "Não há sinalização de reclamação, pendência sensível ou pedido de não-contato (opt-out/LGPD) cadastrada no sistema — revise manualmente antes de contatar qualquer cliente desta lista.",
];

export async function fetchInactiveCustomers(minDays: number = DEFAULT_INACTIVE_MIN_DAYS): Promise<InactiveCustomersResult> {
  const overviews = await listCustomerOverviews();
  const inactive = overviews.filter((o) => o.profile.daysSinceLastVisit !== null && o.profile.daysSinceLastVisit >= minDays);

  const ranked = inactive
    .map((entry) => {
      const { score, reasons } = computeInactivePriority(entry);
      return { entry, score, reasons };
    })
    .sort((a, b) => b.score - a.score || (b.entry.profile.totalSpent ?? 0) - (a.entry.profile.totalSpent ?? 0));

  const candidates: InactiveCustomerCandidate[] = ranked.slice(0, MAX_CANDIDATES).map(({ entry, score, reasons }) => {
    const message = generateCustomerMessage("retorno", {
      customer: entry.customer,
      profile: entry.profile,
      vehicle: entry.primaryVehicle,
      lastServiceNames: entry.lastServiceNames,
    });
    return {
      customerId: entry.customer.id,
      customerName: entry.customer.name,
      vehicleModel: entry.primaryVehicle?.model ?? null,
      plateMasked: maskPlate(entry.primaryVehicle?.plate ?? null),
      phoneMasked: maskPhone(entry.customer.phone ?? null),
      lastVisitAt: entry.profile.lastVisitAt,
      daysSinceLastVisit: entry.profile.daysSinceLastVisit ?? 0,
      visitCount: entry.profile.visitCount,
      totalSpent: entry.profile.totalSpent,
      isRecurring: entry.profile.isRecurring,
      priorityScore: score,
      priorityReasons: reasons,
      messageDraft: message.text,
    };
  });

  return { minDays, totalCandidatesBeforeCap: inactive.length, candidates, caveats: CAVEATS };
}
