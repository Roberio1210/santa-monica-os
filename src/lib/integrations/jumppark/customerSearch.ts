/**
 * Missão CRM V2 Fase 1 — núcleo puro (sem I/O) da "busca inteligente": um único campo de texto
 * que precisa ser interpretado como possível nome, telefone (completo ou parcial) e placa
 * (completa ou parcial) simultaneamente, sem o usuário escolher qual. Nunca decide identidade —
 * só decide QUAIS condições de busca aplicar. `fetchCustomers` (customersQuery.ts) usa isto para
 * montar um OR entre nome/telefone/placa/modelo.
 */

export interface CustomerSearchTerms {
  /** Texto original, aparado — sempre usado para o ILIKE de nome/modelo. */
  raw: string;
  /**
   * Dígitos extraídos da busca, para comparação com telefone normalizado — `null` quando há menos
   * de 3 dígitos (evita "matching absurdo": 1-2 dígitos bateriam em quase qualquer telefone).
   */
  phoneDigits: string | null;
  /**
   * Busca normalizada (maiúsculas, sem espaços/separadores) para comparação com placa — `null`
   * quando sobrar menos de 2 caracteres úteis.
   */
  platePattern: string | null;
}

const MIN_PHONE_SEARCH_DIGITS = 3;
const MIN_PLATE_SEARCH_LENGTH = 2;

export function buildCustomerSearchTerms(query: string): CustomerSearchTerms {
  const raw = query.trim();
  const digits = raw.replace(/\D/g, "");
  const plate = raw.toUpperCase().replace(/[\s-]/g, "");

  return {
    raw,
    phoneDigits: digits.length >= MIN_PHONE_SEARCH_DIGITS ? digits : null,
    platePattern: plate.length >= MIN_PLATE_SEARCH_LENGTH ? plate : null,
  };
}
