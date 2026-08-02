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

/** Tempo decorrido desde um timestamp ISO, em texto curto (ex.: "35 min", "2h 15min", "1 dia"). `now` é parâmetro para manter a função pura e testável. */
export function formatElapsedTime(sinceIso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(sinceIso)) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days} dia${days > 1 ? "s" : ""}`;
}
