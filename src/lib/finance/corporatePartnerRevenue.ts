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
 * Compatibilidade histórica: ordens sem vínculo formal continuam reconhecidas pelo mecanismo
 * textual antigo, através da mesma palavra-chave única (`LEGACY_IESA_FALLBACK_KEYWORD`, nunca
 * ampliada com outra palavra) — mas a partir da Missão V7/Fase C3 (auditoria forense de
 * agosto/2026) esse fallback foi corrigido para não repetir, silenciosamente, o mesmo defeito que a
 * V4.2 já tinha corrigido no vínculo formal: agora ele também olha `client_name` (não só o texto de
 * um item) e, uma vez que a ordem bate, exclui a ordem INTEIRA (não só o item que bateu) — ver
 * `legacyKeywordMatches`. Como é a MESMA regra e a MESMA palavra-chave já usadas para estabelecer o
 * vínculo formal (`orderMatchesPartnerKeywords`), isto não é uma ampliação da regra de negócio, é a
 * correção de uma implementação que a aplicava parcialmente. Efeito colateral conhecido: qualquer
 * mês anterior a agosto/2026 que ainda dependa deste fallback (nunca recebeu `refreshJumpParkPartnerLinks`)
 * pode ter sua receita de Estética recalculada por esta correção — nenhum mês já fechado foi
 * reprocessado/persistido por esta missão; só o cálculo ao vivo da DRE muda.
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
  /** Missão Financeiro V7 (Fase C3) — necessário para o fallback textual legado também reconhecer o parceiro pelo nome do cliente, não só pelo texto de um item (ver `legacyKeywordMatches`). Opcional para não quebrar chamadores que nunca dependeram disso (ex.: `resolveOrderPartnerAmount`). */
  clientName?: string | null;
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
 * Missão Financeiro V7 (Fase C3, auditoria forense de agosto/2026) — causa raiz real do "bug de
 * exclusão IESA": a auditoria encontrou 8 ordens de agosto genuinamente da parceria IESA, mas o
 * fallback textual antigo só reconhecia 7. As duas falhas concretas:
 * 1) Uma ordem tinha DOIS itens ("Polimento Peça - Nissan" + "Lavação Parceria IESA - Nissan") — o
 *    texto antigo só via o item cujo nome batia "iesa", deixando o polimento como receita genérica
 *    (o MESMO defeito que a Missão V4.2 já tinha corrigido para ordens com `partner_id`, mas nunca
 *    propagado ao fallback usado quando a ordem ainda não tem vínculo formal).
 * 2) Uma ordem tinha `client_name = "grupo Iesa"` mas seu único item era "Polimento Peça - Nissan"
 *    (sem a palavra "iesa" em lugar nenhum do texto do item) — invisível a um filtro que só olha
 *    itens, mesmo havendo um sinal claro e determinístico no nome do cliente.
 * Esta função usa exatamente o mesmo sinal que `orderMatchesPartnerKeywords` já usa para ESTABELECER
 * o vínculo formal (`client_name` OU a descrição de QUALQUER item) — nunca uma palavra-chave nova,
 * nunca o valor da ordem, nunca um cliente específico hardcoded. Uma vez que o sinal aparece em
 * qualquer lugar da ordem, a ordem INTEIRA é tratada como do parceiro (mesma regra já aplicada a
 * `partnerId`), não apenas o item cujo texto bateu.
 */
function legacyKeywordMatches(order: CorporatePartnerOrderInput, items: CorporatePartnerOrderItemInput[], legacyFallbackKeyword: string): boolean {
  const keyword = legacyFallbackKeyword.toLowerCase();
  if (order.clientName?.toLowerCase().includes(keyword)) return true;
  return items.some((it) => it.description?.toLowerCase().includes(keyword));
}

/**
 * Quanto desta ordem deve ser EXCLUÍDO da receita genérica (Estética Automotiva/Estacionamento)
 * porque pertence a algum parceiro corporativo — usado por `jumpparkRevenue.ts` para nunca contar
 * duas vezes o que já é reconhecido via o fechamento consolidado (`accounts_receivable`) do
 * parceiro. Vale para QUALQUER parceiro vinculado, não só IESA.
 */
export function resolveOrderCorporateExclusionAmount(order: CorporatePartnerOrderInput, items: CorporatePartnerOrderItemInput[]): number {
  if (order.partnerId !== null) return netServicesAmount(order);
  if (legacyKeywordMatches(order, items, LEGACY_IESA_FALLBACK_KEYWORD)) return netServicesAmount(order);
  return 0;
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
