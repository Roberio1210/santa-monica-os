"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDaysIso } from "@/lib/utils/timezone";
import { formatDateBR } from "@/lib/utils/format";

const WEEKDAY_LABELS_FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

/** Dia da semana por extenso de uma data ISO (YYYY-MM-DD), tratada como calendário puro (mesmo padrão de `weekdayOf` em `timezone.ts`). */
export function weekdayLabelFull(dateIso: string): string {
  return WEEKDAY_LABELS_FULL[new Date(`${dateIso}T12:00:00Z`).getUTCDay()];
}

/** Missão 40 (item 1) — navegador `[<] [Hoje] [>]`, server-driven via query param `date`. */
export function DayNavigator({ dateIso, todayIso }: { dateIso: string; todayIso: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function go(nextDateIso: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("range");
    params.delete("q");
    if (nextDateIso === todayIso) params.delete("date");
    else params.set("date", nextDateIso);
    const qs = params.toString();
    router.push(`/planejamento${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border border-border-subtle bg-background-panel p-3">
      <button type="button" onClick={() => go(addDaysIso(dateIso, -1))} aria-label="Dia anterior" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground-muted">
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">{weekdayLabelFull(dateIso)}</p>
        <p className="text-xs text-foreground-subtle">{formatDateBR(dateIso)}</p>
      </div>

      <div className="flex items-center gap-1.5">
        {dateIso !== todayIso ? (
          <button type="button" onClick={() => go(todayIso)} className="h-9 rounded-lg border border-accent px-3 text-xs font-medium text-accent">
            Hoje
          </button>
        ) : null}
        <button type="button" onClick={() => go(addDaysIso(dateIso, 1))} aria-label="Próximo dia" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-foreground-muted">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
