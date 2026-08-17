import "server-only";
import {
  fetchCorporatePartnerMonthlyClosings,
  generateCorporatePartnerClosingReceivable,
  type CorporatePartnerMonthlyClosing,
  type GenerateCorporatePartnerClosingResult,
} from "@/lib/finance/corporatePartnerClosing";
import { LEGACY_IESA_FALLBACK_KEYWORD } from "@/lib/finance/corporatePartnerRevenue";
import { getFinanceRepository } from "@/lib/finance/repository-factory";

/**
 * Missão Financeiro V2 (Prioridade 3), generalizada na V4.2 — fechamento mensal da parceria
 * pós-paga IESA/Nissan. Fina camada específica de IESA sobre `corporatePartnerClosing.ts`
 * (genérico, reaproveitável por qualquer parceiro corporativo futuro) — mantém a API pública
 * exatamente igual para os dois pontos que já a consomem (`/financeiro` e `generateIesaClosingAction`).
 *
 * Missão V4.2 — antes desta missão, a identificação era só textual (`description ILIKE '%iesa%'`),
 * o que perdia serviços reais como "Polimento Peça - Nissan" (achado da auditoria de julho/2026:
 * o fechamento de julho estava R$500 abaixo do valor real da planilha oficial da IESA). Agora usa
 * o vínculo formal `jumppark_service_orders.partner_id` quando disponível (toda a ordem conta,
 * independente do nome do serviço), com o texto antigo como fallback só para ordens ainda sem
 * vínculo — nunca alterando meses já fechados sem confirmação explícita.
 */
export type IesaMonthlyClosing = CorporatePartnerMonthlyClosing;
export type GenerateIesaClosingResult = GenerateCorporatePartnerClosingResult;

const IESA_PARTY_NAME_FRAGMENT = "iesa";

async function resolveIesaPartnerId(): Promise<string | null> {
  const partners = await getFinanceRepository().listPartners();
  return partners.find((p) => p.name.toLowerCase().includes(IESA_PARTY_NAME_FRAGMENT))?.id ?? null;
}

export async function fetchIesaMonthlyClosings(): Promise<IesaMonthlyClosing[]> {
  const partnerId = await resolveIesaPartnerId();
  if (!partnerId) return [];
  return fetchCorporatePartnerMonthlyClosings(partnerId, IESA_PARTY_NAME_FRAGMENT, LEGACY_IESA_FALLBACK_KEYWORD);
}

/**
 * `allowAmountCorrection` — Missão V4.2: quando `true` e já existir uma cobrança gerada para o mês
 * com valor diferente do recalculado, CORRIGE o `expectedAmount` (com nota de auditoria) em vez de
 * só confirmar "already_exists". Usado pela correção pontual e autorizada do fechamento de
 * julho/2026 (R$1.120 → R$1.620) — nunca automático, sempre uma decisão explícita do chamador.
 */
export async function generateIesaClosingReceivable(
  competenceMonth: string,
  totalAmount: number,
  dueDay: number,
  responsibleName: string,
  allowAmountCorrection = false,
): Promise<GenerateIesaClosingResult> {
  return generateCorporatePartnerClosingReceivable("iesa", IESA_PARTY_NAME_FRAGMENT, competenceMonth, totalAmount, dueDay, responsibleName, allowAmountCorrection);
}
