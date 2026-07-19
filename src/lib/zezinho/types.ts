import type { PeriodRange } from "@/lib/utils/timezone";

/**
 * Tipos compartilhados entre service.ts, comparison-engine.ts e response-builder.ts — isolados
 * aqui para evitar import circular entre esses três módulos.
 */

export interface ZezinhoLink {
  label: string;
  href: string;
}

export interface ZezinhoAnswer {
  text: string;
  links: ZezinhoLink[];
  /** Seção "Dados utilizados" (transparência) — nunca inclui SQL, token ou segredo. */
  sources?: string[];
}

export interface ZezinhoQuestion {
  id: string;
  label: string;
}

/**
 * Contexto conversacional curto (seção 8) — mantido pelo cliente entre mensagens da mesma
 * sessão (nunca persistido no servidor). Permite que perguntas de acompanhamento como
 * "E só a lavação?" reaproveitem os períodos da última comparação.
 */
export interface ZezinhoContext {
  lastPeriodA: PeriodRange | null;
  lastPeriodB: PeriodRange | null;
  lastKindFilter: "lavacao" | "estacionamento" | null;
  lastTopic: string | null;
}

export const EMPTY_ZEZINHO_CONTEXT: ZezinhoContext = { lastPeriodA: null, lastPeriodB: null, lastKindFilter: null, lastTopic: null };
