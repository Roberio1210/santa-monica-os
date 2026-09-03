import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { MIN_OPERATIONAL_DATE, periodDisplayLabel } from "@/lib/finance/financePeriod";
import { saoPauloDateISO, type PeriodKey, type PeriodRange } from "@/lib/utils/timezone";
import type { FinanceTab } from "@/lib/finance/financeTabs";

const QUICK_PRESETS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Hoje" },
  { key: "yesterday", label: "Ontem" },
  { key: "month", label: "Este mês" },
  { key: "previous_month", label: "Mês anterior" },
];

const MONTH_OPTIONS = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

/** Único ano com dado real hoje — nunca oferecemos um ano sem nenhuma fonte possível. */
const AVAILABLE_YEARS = ["2026"];

const fieldClasses =
  "h-8 rounded-lg border border-border bg-background-elevated px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

/**
 * Missão Financeiro 5C — filtro global de período, no topo da Central Financeira, antes das abas.
 * Sem `"use client"`: presets rápidos são `<Link>` (SSR normal); "Mês específico"/"Ano
 * específico"/"Personalizado" são `<form method="get">` nativos — o navegador serializa os campos
 * na querystring ao enviar, sem nenhum JavaScript de cliente. O período (e a aba atual, via campo
 * oculto) sempre viajam juntos na URL — nunca um estado escondido só no cliente.
 */
export function FinancePeriodSelector({ period, tab }: { period: PeriodRange; tab: FinanceTab }) {
  const today = saoPauloDateISO();

  function hrefFor(key: PeriodKey): string {
    const params = new URLSearchParams();
    if (tab !== "visao-geral") params.set("tab", tab);
    params.set("periodo", key);
    return `/financeiro?${params.toString()}`;
  }

  return (
    <div className="space-y-3 rounded-xl border border-border-subtle bg-background-elevated p-3">
      <div className="flex flex-wrap items-center gap-2">
        {QUICK_PRESETS.map((preset) => (
          <Link
            key={preset.key}
            href={hrefFor(preset.key)}
            className={cn(
              "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors",
              period.key === preset.key ? "border-accent/40 bg-accent/10 text-accent" : "border-border text-foreground-muted hover:border-accent/30 hover:text-foreground",
            )}
          >
            {preset.label}
          </Link>
        ))}

        <form method="get" action="/financeiro" className="flex items-center gap-1">
          {tab !== "visao-geral" ? <input type="hidden" name="tab" value={tab} /> : null}
          <input type="hidden" name="periodo" value="specific_month" />
          <select name="mes" defaultValue={period.key === "specific_month" ? String(Number(period.from.slice(5, 7))) : ""} className={fieldClasses} aria-label="Mês específico">
            <option value="" disabled>
              Mês
            </option>
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <select name="ano" defaultValue={period.key === "specific_month" ? period.from.slice(0, 4) : AVAILABLE_YEARS[0]} className={fieldClasses} aria-label="Ano do mês específico">
            {AVAILABLE_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button type="submit" className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground-muted transition-colors hover:border-accent/30 hover:text-foreground">
            Ver mês
          </button>
        </form>

        <form method="get" action="/financeiro" className="flex items-center gap-1">
          {tab !== "visao-geral" ? <input type="hidden" name="tab" value={tab} /> : null}
          <input type="hidden" name="periodo" value="specific_year" />
          <select name="ano" defaultValue={period.key === "specific_year" ? period.from.slice(0, 4) : AVAILABLE_YEARS[0]} className={fieldClasses} aria-label="Ano específico">
            {AVAILABLE_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button type="submit" className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground-muted transition-colors hover:border-accent/30 hover:text-foreground">
            Ver ano
          </button>
        </form>

        <form method="get" action="/financeiro" className="flex items-center gap-1">
          {tab !== "visao-geral" ? <input type="hidden" name="tab" value={tab} /> : null}
          <input type="hidden" name="periodo" value="custom" />
          <input
            type="date"
            name="inicio"
            min={MIN_OPERATIONAL_DATE}
            max={today}
            defaultValue={period.key === "custom" ? period.from : undefined}
            className={fieldClasses}
            aria-label="Data inicial"
          />
          <span className="text-xs text-foreground-subtle">até</span>
          <input
            type="date"
            name="fim"
            min={MIN_OPERATIONAL_DATE}
            max={today}
            defaultValue={period.key === "custom" ? period.to : undefined}
            className={fieldClasses}
            aria-label="Data final"
          />
          <button type="submit" className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium text-foreground-muted transition-colors hover:border-accent/30 hover:text-foreground">
            Aplicar
          </button>
        </form>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-foreground-subtle">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
        Período analisado: <strong className="text-foreground-muted">{periodDisplayLabel(period)}</strong>
      </p>
    </div>
  );
}
