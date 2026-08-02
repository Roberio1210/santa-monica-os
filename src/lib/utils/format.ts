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

/** Duração em minutos → texto curto (ex.: "35 min", "2h 15min", "1 dia"). Base de `formatElapsedTime` e de qualquer outra duração já calculada em minutos (ex.: cronômetro, tempo médio de atendimento). */
export function formatDurationMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const hours = Math.floor(m / 60);
  const remainingMinutes = m % 60;
  if (hours < 24) return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}min` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days} dia${days > 1 ? "s" : ""}`;
}

/** Tempo decorrido desde um timestamp ISO, em texto curto. `now` é parâmetro para manter a função pura e testável. */
export function formatElapsedTime(sinceIso: string, now: Date = new Date()): string {
  return formatDurationMinutes((now.getTime() - Date.parse(sinceIso)) / 60_000);
}
