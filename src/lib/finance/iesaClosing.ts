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
 *
 * Auditoria histórica (agosto/2026) — março/2026 foi o mês de implantação do JumpPark (não usado
 * desde o dia 1 da competência, confirmado pelo gestor). O valor reconstruído aqui para março
 * (R$2.290: 17 lavações + 3 polimentos, todos com `situation = "Pago"`, nenhum cancelado/excluído)
 * é só a parcela real que o JumpPark chegou a registrar naquele mês — NUNCA a competência completa.
 * A diferença para o valor oficial da planilha (R$2.680) não é um bug de reconhecimento nem precisa
 * de correção: para competências anteriores à adoção plena do JumpPark, a planilha oficial da
 * IESA/Nissan validada pelo gestor é a fonte de verdade, e não deve ser sobrescrita por uma
 * reconstrução parcial. Abril/2026 em diante já bate exato com a planilha oficial (auditado).
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
