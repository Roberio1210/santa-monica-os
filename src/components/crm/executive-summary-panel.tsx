import { Car, Calendar, Gauge, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { saoPauloDateISO } from "@/lib/utils/timezone";
import type { ExecutiveSummary } from "@/lib/crm-intelligente/types";

function StatBlock({ icon: Icon, label, value, hint }: { icon: typeof Car; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-background-panel p-3">
      <div className="flex items-center gap-1.5 text-xs text-foreground-subtle">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 text-base font-semibold text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-foreground-subtle">{hint}</p> : null}
    </div>
  );
}

/** "Resumo Executivo" (Missão 21) — painel superior, só com dados já calculados. */
export function ExecutiveSummaryPanel({ summary }: { summary: ExecutiveSummary }) {
  return (
    <section className="space-y-2.5">
      <h2 className="text-sm font-semibold text-foreground">Resumo executivo</h2>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatBlock icon={Calendar} label="Cliente desde" value={summary.customerSince ? formatDateBR(saoPauloDateISO(new Date(summary.customerSince))) : "—"} />
        <StatBlock
          icon={Calendar}
          label="Última visita"
          value={summary.lastVisitAt ? formatDateBR(saoPauloDateISO(new Date(summary.lastVisitAt))) : "—"}
          hint={summary.daysSinceLastVisit !== null ? `${summary.daysSinceLastVisit} dias sem retornar` : undefined}
        />
        <StatBlock icon={Wallet} label="Total gasto" value={formatCurrency(summary.totalSpent)} />
        <StatBlock icon={Gauge} label="Ticket médio" value={summary.averageTicket !== null ? formatCurrency(summary.averageTicket) : "—"} />
        <StatBlock icon={Car} label="Veículos" value={String(summary.vehicleCount)} />
        <StatBlock icon={Calendar} label="Visitas" value={String(summary.visitCount)} />
        <StatBlock icon={ShieldCheck} label="Proteções vigentes" value={String(summary.activeProtectionsCount)} />
        <StatBlock icon={Sparkles} label="Próxima recomendação" value={summary.nextRecommendation ? "Ver abaixo" : "Nenhuma"} hint={summary.nextRecommendation ?? undefined} />
      </div>
    </section>
  );
}
