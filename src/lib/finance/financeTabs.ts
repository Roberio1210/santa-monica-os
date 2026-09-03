import { financePeriodToSearchParams } from "@/lib/finance/financePeriod";
import type { PeriodRange } from "@/lib/utils/timezone";

/**
 * Missão Financeiro 5B (Fase 1) — fonte única das áreas da Central Financeira. Extraído para
 * módulo puro (sem "server-only", sem I/O) para ser testável isoladamente, mesmo padrão já usado
 * em `src/components/navigation/app-modules.ts` (`resolveActiveModuleId`).
 *
 * Missão Financeiro 5D — "lavacao"/"estacionamento" viram abas de primeiro nível (decisão do
 * gestor: máxima visibilidade/facilidade de acesso, não subtabs de Visão Geral).
 */
export type FinanceTab = "visao-geral" | "lavacao" | "estacionamento" | "dre" | "fluxo" | "contas" | "despesas" | "stone" | "fechamento";

export interface FinanceTabItem {
  value: FinanceTab;
  label: string;
}

export const FINANCE_TABS: FinanceTabItem[] = [
  { value: "visao-geral", label: "Visão Geral" },
  { value: "lavacao", label: "Lavação" },
  { value: "estacionamento", label: "Estacionamento" },
  { value: "dre", label: "DRE" },
  { value: "fluxo", label: "Fluxo de Caixa" },
  { value: "contas", label: "Contas" },
  { value: "despesas", label: "Despesas" },
  { value: "stone", label: "Stone" },
  { value: "fechamento", label: "Fechamento" },
];

const VALID_FINANCE_TABS = new Set<string>(FINANCE_TABS.map((t) => t.value));

/** `undefined`/valor desconhecido sempre cai em "visao-geral" — nunca uma aba em branco. */
export function resolveFinanceTab(tabParam: string | undefined): FinanceTab {
  return tabParam && VALID_FINANCE_TABS.has(tabParam) ? (tabParam as FinanceTab) : "visao-geral";
}

/** "visao-geral" é sempre a URL base `/financeiro` (sem querystring) — as demais usam `?tab=`. */
export function hrefForFinanceTab(tab: FinanceTab | string): string {
  return tab === "visao-geral" ? "/financeiro" : `/financeiro?tab=${tab}`;
}

/**
 * Missão Financeiro 5D.5 — href real de cada aba, preservando o período global (`periodo`,
 * `inicio`/`fim`, `mes`/`ano`) já selecionado. Extraído de `FinanceiroPage` para ser testável de
 * forma pura (sem precisar renderizar JSX — este projeto não tem infraestrutura de teste de DOM).
 * "visao-geral" nunca carrega `tab=` na URL (é o valor padrão de `resolveFinanceTab`).
 */
export function financeTabHref(tab: FinanceTab | string, period: PeriodRange): string {
  const search = financePeriodToSearchParams(period);
  if (tab !== "visao-geral") search.set("tab", tab);
  return `/financeiro?${search.toString()}`;
}
