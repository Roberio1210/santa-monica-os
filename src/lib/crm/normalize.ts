/**
 * Normalização pura (sem I/O) usada para agrupar atendimentos do JumpPark no mesmo cliente.
 * Prioridade de identificação: telefone normalizado > nome normalizado — nunca funde clientes
 * por placa ou por nomes parecidos (nenhuma fusão automática além dessas duas chaves exatas).
 */

/** Remove tudo que não for dígito. Retorna null quando não sobra um telefone plausível. */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

export function normalizeName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

/** Placa maiúscula, sem espaços — só para exibição/mascaramento, nunca para fundir clientes. */
export function normalizePlate(plate: string | null | undefined): string | null {
  if (!plate) return null;
  const clean = plate.trim().toUpperCase().replace(/\s+/g, "");
  return clean.length > 0 ? clean : null;
}

/**
 * Chave de identidade de um atendimento: telefone normalizado tem prioridade; sem telefone,
 * cai para o nome normalizado. Sem nenhum dos dois, o atendimento não pode ser atribuído a
 * nenhum cliente (nunca inventamos uma identidade).
 */
export function identityKey(clientPhone: string | null | undefined, clientName: string | null | undefined): string | null {
  const phone = normalizePhone(clientPhone);
  if (phone) return `phone:${phone}`;
  const name = normalizeName(clientName);
  if (name) return `name:${name.toLowerCase()}`;
  return null;
}

/** Converte a chave de identidade num id de rota estável e reversível (base64url). */
export function slugifyCustomerId(key: string): string {
  return Buffer.from(key, "utf-8").toString("base64url");
}

export function unslugifyCustomerId(id: string): string | null {
  try {
    return Buffer.from(id, "base64url").toString("utf-8");
  } catch {
    return null;
  }
}

/**
 * Número no formato exigido pelo wa.me (55 + DDD + número), sem duplicar o 55 quando o
 * telefone já veio com o código do país.
 */
export function buildWhatsAppNumber(normalizedPhone: string): string {
  if (normalizedPhone.startsWith("55") && normalizedPhone.length >= 12) return normalizedPhone;
  return `55${normalizedPhone}`;
}
