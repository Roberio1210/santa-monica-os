/**
 * Missão Financeiro V4.2 — receita de parceiros corporativos (ex.: Grupo IESA/Nissan) a partir de
 * ordens do JumpPark, com vínculo FORMAL por `jumppark_service_orders.partner_id` em vez de
 * depender só do texto de um item de serviço (achado da auditoria de julho/2026: um pedido com
 * "Lavação Parceria IESA" e "Polimento Peça - Nissan" tinha o polimento invisível ao mecanismo
 * anterior, que só buscava `description ILIKE '%iesa%'`).
 *
 * Regra: uma vez que uma ordem está vinculada a um parceiro (`partner_id` preenchido), TODOS os
 * seus itens pertencem à receita daquele parceiro, independente do nome de cada serviço — o texto
 * do item nunca decide a classificação sozinho depois que o vínculo existe.
 *
 * Compatibilidade histórica: ordens sem vínculo formal (a imensa maioria de antes de julho/2026,
 * quando `client_name` quase nunca vinha preenchido) continuam reconhecidas pelo mecanismo textual
 * antigo — `LEGACY_IESA_FALLBACK_KEYWORD` reproduz EXATAMENTE o comportamento anterior a esta
 * missão (nunca ampliado para não alterar meses já fechados/auditados como março-junho/2026).
 */

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Reproduz o filtro histórico único (`IESA_ITEM_DESCRIPTION_LIKE`/`IESA_SERVICE_DESCRIPTION_LIKE` de antes desta missão) — nunca estendido, só existe para não regredir meses já auditados sem vínculo formal. */
export const LEGACY_IESA_FALLBACK_KEYWORD = "iesa";

export interface CorporatePartnerOrderInput {
  servicesAmount: number;
  discountAmount: number | null;
  partnerId: string | null;
}

export interface CorporatePartnerOrderItemInput {
  description: string | null;
  amount: number;
}

function netServicesAmount(order: CorporatePartnerOrderInput): number {
  return Math.max(0, round2(order.servicesAmount - (order.discountAmount ?? 0)));
}

function legacyKeywordAmount(items: CorporatePartnerOrderItemInput[], legacyFallbackKeyword: string): number {
  const keyword = legacyFallbackKeyword.toLowerCase();
  return round2(items.filter((it) => it.description?.toLowerCase().includes(keyword)).reduce((sum, it) => sum + it.amount, 0));
}

/**
 * Quanto desta ordem deve ser EXCLUÍDO da receita genérica (Estética Automotiva/Estacionamento)
 * porque pertence a algum parceiro corporativo — usado por `jumpparkRevenue.ts` para nunca contar
 * duas vezes o que já é reconhecido via o fechamento consolidado (`accounts_receivable`) do
 * parceiro. Vale para QUALQUER parceiro vinculado, não só IESA.
 */
export function resolveOrderCorporateExclusionAmount(order: CorporatePartnerOrderInput, items: CorporatePartnerOrderItemInput[]): number {
  if (order.partnerId !== null) return netServicesAmount(order);
  return legacyKeywordAmount(items, LEGACY_IESA_FALLBACK_KEYWORD);
}

/**
 * Quanto desta ordem pertence especificamente a `targetPartnerId` — usado pelo fechamento mensal
 * consolidado (`fetchCorporatePartnerMonthlyClosings`). `legacyFallbackKeyword` só deve ser passado
 * para o parceiro histórico (IESA) e só se aplica a ordens SEM vínculo formal ainda.
 */
export function resolveOrderPartnerAmount(
  order: CorporatePartnerOrderInput,
  items: CorporatePartnerOrderItemInput[],
  targetPartnerId: string,
  legacyFallbackKeyword: string | null,
): number {
  if (order.partnerId !== null) return order.partnerId === targetPartnerId ? netServicesAmount(order) : 0;
  if (!legacyFallbackKeyword) return 0;
  return legacyKeywordAmount(items, legacyFallbackKeyword);
}

/**
 * Decide se uma ordem deve ser vinculada a um parceiro corporativo: `clientName` OU a descrição de
 * QUALQUER item bate com alguma das `keywords` cadastradas para o parceiro (`partners.jumppark_match_keywords`).
 * Usado só para ESTABELECER o vínculo (`partner_id`) — nunca para decidir, item a item, o que conta
 * como receita depois que o vínculo já existe (aí a regra é "toda a ordem", ver funções acima).
 */
export function orderMatchesPartnerKeywords(order: { clientName: string | null }, items: { description: string | null }[], keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const normalizedKeywords = keywords.map((k) => k.toLowerCase().trim()).filter(Boolean);
  if (normalizedKeywords.length === 0) return false;

  const clientName = order.clientName?.toLowerCase() ?? "";
  if (normalizedKeywords.some((k) => clientName.includes(k))) return true;

  return items.some((it) => {
    const description = it.description?.toLowerCase() ?? "";
    return normalizedKeywords.some((k) => description.includes(k));
  });
}
