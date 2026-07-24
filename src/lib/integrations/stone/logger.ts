/**
 * Log estruturado, escopado só à integração Stone — mesmo padrão de
 * `integrations/weather/logger.ts`. Nunca recebe nem imprime a chave de API — quem chama é
 * responsável por só passar metadados seguros (data de referência, status HTTP, mensagem de erro
 * já sem segredo).
 */

type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ scope: "stone-integration", level, message, ...meta, at: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const stoneLogger = {
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};
