import { Car, CalendarDays, ListChecks, PackageCheck, PlusCircle, Search, Target, Wallet } from "lucide-react";
import { ActionButton } from "@/components/attendance/mobile/action-button";
import { StatTile } from "@/components/attendance/mobile/stat-tile";
import { fetchHomeSummary } from "@/lib/attendance/service";
import { formatCurrency } from "@/lib/utils/format";
import { SAO_PAULO_TZ } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO_TZ, hour: "2-digit", hour12: false }).format(new Date()));
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function AtendimentoHomePage() {
  const summary = await fetchHomeSummary();

  return (
    <div className="space-y-6 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{greeting()}, Vinicius.</h1>
        <p className="mt-0.5 text-sm text-foreground-subtle">Hoje</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={Car} label="Carros previstos" value={String(summary.countsToday.aguardandoExecucao)} />
        <StatTile icon={Car} label="Em execução" value={String(summary.countsToday.emExecucao)} />
        <StatTile icon={Car} label="Aguardando conferência" value={String(summary.countsToday.aguardandoConferencia)} />
        <StatTile icon={Car} label="Prontos para entrega" value={String(summary.countsToday.prontoEntrega)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={Wallet} label="Faturamento do dia" value={formatCurrency(summary.dailyRevenue)} emphasis />
        <StatTile
          icon={Target}
          label="Meta do dia"
          value={summary.goal ? formatCurrency(summary.goal.dailyTargetEstimate) : "—"}
          hint={summary.goal ? `Estimativa a partir de "${summary.goal.label}"` : "Nenhuma meta ativa configurada"}
        />
      </div>

      <div className="space-y-2.5 pb-4">
        <ActionButton href="/atendimento/novo" icon={PlusCircle} label="Novo Atendimento" variant="primary" />
        <ActionButton href="/agenda" icon={CalendarDays} label="Agenda" />
        <ActionButton href="/atendimento/buscar" icon={Search} label="Pesquisar Cliente" />
        <ActionButton href="/atendimento/execucao" icon={ListChecks} label="Carros em Execução" />
        <ActionButton href="/atendimento/entregas" icon={PackageCheck} label="Entregas" />
      </div>
    </div>
  );
}
