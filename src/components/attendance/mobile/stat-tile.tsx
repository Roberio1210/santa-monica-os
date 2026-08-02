import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Bloco de número — usado tanto para contagem de carros quanto para valores em reais na Home. */
export function StatTile({ icon: Icon, label, value, hint, emphasis = false }: { icon: LucideIcon; label: string; value: string; hint?: string; emphasis?: boolean }) {
  return (
    <div className={cn("rounded-2xl border border-border-subtle bg-background-panel p-4", emphasis && "border-accent/40")}>
      <div className="flex items-center gap-2 text-foreground-subtle">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-foreground-subtle">{hint}</p> : null}
    </div>
  );
}
