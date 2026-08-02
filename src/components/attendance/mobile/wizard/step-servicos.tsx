"use client";

import { cn } from "@/lib/utils/cn";
import { formatCurrency } from "@/lib/utils/format";
import type { ServiceCatalogEntry } from "@/lib/attendance/repository";

export function StepServicos({
  serviceCatalog,
  selectedServiceIds,
  onToggle,
}: {
  serviceCatalog: ServiceCatalogEntry[];
  selectedServiceIds: Set<string>;
  onToggle: (serviceId: string) => void;
}) {
  return (
    <div className="space-y-2.5">
      <p className="text-sm text-foreground-subtle">Selecione os serviços aprovados pelo cliente.</p>
      {serviceCatalog.map((service) => {
        const selected = selectedServiceIds.has(service.id);
        return (
          <button
            key={service.id}
            type="button"
            onClick={() => onToggle(service.id)}
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-transform active:scale-[0.98]",
              selected ? "border-accent bg-background-panel" : "border-border-subtle bg-background-panel",
            )}
          >
            <div className="flex items-center gap-3">
              <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", selected ? "border-accent bg-accent" : "border-border")} />
              <span className="text-base text-foreground">{service.name}</span>
            </div>
            <span className="text-sm text-foreground-subtle">{service.defaultPrice !== null ? formatCurrency(service.defaultPrice) : "—"}</span>
          </button>
        );
      })}
    </div>
  );
}
