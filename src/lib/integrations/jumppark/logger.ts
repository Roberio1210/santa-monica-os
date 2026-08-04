/**
 * Log estruturado, escopado só à integração JumpPark — mesmo padrão de
 * `integrations/stone/logger.ts` e `integrations/weather/logger.ts`. Nunca recebe nem imprime
 * token, userId ou establishmentId — quem chama só passa metadados seguros (nomes de variáveis
 * ausentes, endpoint consultado, status HTTP, mensagem de erro já sem segredo).
 */

type LogLevel = "info" | "warn" | "error";

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ scope: "jumppark-integration", level, message, ...meta, at: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

export const jumpParkLogger = {
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};
