/** Mascara uma placa, mantendo apenas as 2 primeiras e 2 últimas posições visíveis. */
export function maskPlate(plate?: string | null): string {
  if (!plate) return "Não informado";
  const clean = plate.trim();
  if (clean.length < 5) return "***";
  return `${clean.slice(0, 2)}***${clean.slice(-2)}`;
}

/** Mascara um telefone, expondo somente os 2 últimos dígitos. Nunca exibe o número completo. */
export function maskPhone(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 2) return "*******";
  return `*******${digits.slice(-2)}`;
}
