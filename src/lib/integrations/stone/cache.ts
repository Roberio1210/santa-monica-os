/**
 * Cache TTL em memória, escopado só à integração Stone — mesmo padrão de
 * `integrations/weather/cache.ts`. Nunca guarda a chave de API, só o resultado já normalizado.
 *
 * Diferente do clima (dado muda a cada minuto), um arquivo de conciliação de uma data JÁ FECHADA
 * (ontem ou antes) é imutável — uma vez obtido, nunca precisa ser buscado de novo (ver
 * docs/stone-integration-architecture.md, seção 4.2). Por isso `setCached` aceita qualquer TTL: o
 * chamador decide (sem expiração para dias fechados, TTL curto para o dia corrente).
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
}

const store = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

/** `ttlMs: null` — sem expiração (só para dados imutáveis, ex.: arquivo de um dia já fechado). */
export function setCached<T>(key: string, value: T, ttlMs: number | null): void {
  store.set(key, { value, expiresAt: ttlMs === null ? null : Date.now() + ttlMs });
}

/** Só para testes — limpa todas as entradas. */
export function clearStoneCache(): void {
  store.clear();
}
