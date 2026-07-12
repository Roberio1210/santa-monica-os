export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(value);
}

/** Converte uma data ISO (YYYY-MM-DD) para o formato brasileiro (DD/MM/AAAA). */
export function formatDateBR(dateIso: string | null): string {
  if (!dateIso) return "Não informado";
  const [year, month, day] = dateIso.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}
