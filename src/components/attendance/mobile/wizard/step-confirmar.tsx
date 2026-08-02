"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createServiceOrderAction } from "@/app/atendimento/actions";
import { formatCurrency } from "@/lib/utils/format";
import type { ServiceCatalogEntry } from "@/lib/attendance/repository";
import type { DiagnosticPhoto, TechnicalRecommendation } from "@/lib/attendance/types";

export function StepConfirmar({
  visitId,
  customerName,
  vehicleLabel,
  serviceCatalog,
  selectedServiceIds,
  photos,
  recommendations,
}: {
  visitId: string;
  customerName: string;
  vehicleLabel: string;
  serviceCatalog: ServiceCatalogEntry[];
  selectedServiceIds: Set<string>;
  photos: DiagnosticPhoto[];
  recommendations: TechnicalRecommendation[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selectedServices = serviceCatalog.filter((s) => selectedServiceIds.has(s.id));
  const total = selectedServices.reduce((sum, s) => sum + (s.defaultPrice ?? 0), 0);
  const hasUnknownPrice = selectedServices.some((s) => s.defaultPrice === null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await createServiceOrderAction(visitId, Array.from(selectedServiceIds));
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/atendimento");
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border-subtle bg-background-panel p-4">
        <p className="text-base font-semibold text-foreground">{customerName}</p>
        <p className="text-sm text-foreground-subtle">{vehicleLabel}</p>
      </div>

      <div className="rounded-2xl border border-border-subtle bg-background-panel p-4">
        <p className="text-xs text-foreground-subtle">Serviços aprovados</p>
        <ul className="mt-2 space-y-1">
          {selectedServices.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-sm text-foreground">
              <span>{s.name}</span>
              <span className="text-foreground-subtle">{s.defaultPrice !== null ? formatCurrency(s.defaultPrice) : "—"}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center justify-between border-t border-border-subtle pt-2">
          <span className="text-sm font-medium text-foreground">Total estimado</span>
          <span className="text-base font-semibold text-foreground">
            {formatCurrency(total)}
            {hasUnknownPrice ? "+" : ""}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border-subtle bg-background-panel p-4 text-center">
          <p className="text-2xl font-semibold text-foreground">{photos.length}</p>
          <p className="text-xs text-foreground-subtle">Fotos registradas</p>
        </div>
        <div className="rounded-2xl border border-border-subtle bg-background-panel p-4 text-center">
          <p className="text-2xl font-semibold text-foreground">{recommendations.length}</p>
          <p className="text-xs text-foreground-subtle">Recomendações</p>
        </div>
      </div>

      {error ? <p className="text-sm text-critical">{error}</p> : null}

      <button
        type="button"
        onClick={handleConfirm}
        disabled={isPending}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-accent text-base font-medium text-accent-foreground transition-transform active:scale-[0.98] disabled:opacity-60"
      >
        <CheckCircle2 className="h-5 w-5" />
        {isPending ? "Concluindo..." : "Concluir Atendimento"}
      </button>
    </div>
  );
}
