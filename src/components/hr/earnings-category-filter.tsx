"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { EARNINGS_CATEGORIES, EARNINGS_CATEGORY_LABELS, type EarningsCategory } from "@/lib/hr/earningsCategories";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

/**
 * Fase 6, Parte B (20/09/2026) — filtro de categoria do Resumo de Ganhos, mesmo padrão de
 * `PeriodSelector`: reflete a escolha em `?category=` na URL (server-driven, recarregável/
 * compartilhável), nunca um filtro só em memória no cliente.
 */
export function EarningsCategoryFilter({ category }: { category: EarningsCategory | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setCategory(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("category", value);
    else params.delete("category");
    router.push(`?${params.toString()}`);
  }

  return (
    <select value={category ?? ""} onChange={(e) => setCategory(e.target.value)} className={cn(fieldClasses, "w-full sm:w-auto")} aria-label="Filtrar por categoria">
      <option value="">Todas as categorias</option>
      {EARNINGS_CATEGORIES.map((cat) => (
        <option key={cat} value={cat}>
          {EARNINGS_CATEGORY_LABELS[cat]}
        </option>
      ))}
    </select>
  );
}
