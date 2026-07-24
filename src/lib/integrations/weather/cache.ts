/**
 * Cache TTL em memória, só para este módulo — nunca guarda a chave de API, só o resultado já
 * normalizado. Escopo real: dentro do mesmo processo/instância quente (funções serverless podem
 * reiniciar a qualquer momento, então isso reduz chamadas repetidas num período curto, mas não é
 * um cache compartilhado entre instâncias — suficiente para o objetivo aqui, que é evitar
 * consultar o provedor a cada pergunta do Zézinho dentro de uma janela de poucos minutos).
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

/** Só para testes — limpa todas as entradas. */
export function clearWeatherCache(): void {
  store.clear();
}
