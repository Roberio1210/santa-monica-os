/**
 * Log estruturado, escopado só à camada Weather Intelligence — o projeto não tem um logger
 * global (nenhum outro módulo usa `console.*` em runtime), então isto é intencionalmente local,
 * não uma convenção nova para o resto do sistema. Nunca recebe nem imprime a chave de API —
 * quem chama é responsável por só passar metadados seguros (localização, nome do provedor,
 * mensagem de erro já sem segredo).
 */

type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ scope: "weather-intelligence", level, message, ...meta, at: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const weatherLogger = {
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};
