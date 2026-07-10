export function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatPercent(value: number, fractionDigits = 0): string {
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(value);
}
