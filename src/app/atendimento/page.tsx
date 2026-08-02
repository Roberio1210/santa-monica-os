import { Car, History, PackageCheck, PlusCircle, Receipt, Search, Sparkles, Target, Timer, Wallet } from "lucide-react";
import { ActionButton } from "@/components/attendance/mobile/action-button";
import { StatTile } from "@/components/attendance/mobile/stat-tile";
import { CheckIn } from "@/components/attendance/mobile/check-in";
import { NextCustomerCard } from "@/components/attendance/mobile/next-customer-card";
import { EntryCard } from "@/components/attendance/mobile/entry-card";
import { ExecutionMiniCard } from "@/components/attendance/mobile/execution-mini-card";
import { ReadyCard } from "@/components/attendance/mobile/ready-card";
import { DayPeriodFilter } from "@/components/attendance/mobile/day-period-filter";
import { fetchDayManagement } from "@/lib/attendance/service";
import { parseDayPeriodParam } from "@/lib/attendance/period";
import { formatCurrency, formatDateBR, formatDurationMinutes } from "@/lib/utils/format";
import { SAO_PAULO_TZ, saoPauloDateISO } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

function greeting(): string {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO_TZ, hour: "2-digit", hour12: false }).format(new Date()));
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

export default async function GestaoDoDiaPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { period: periodParam } = await searchParams;
  const periodKey = parseDayPeriodParam(periodParam);
  const { summary, emExecucao, prontos, entradas, period } = await fetchDayManagement(periodKey);

  return (
    <div className="space-y-6 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-4">
      <div>
        <p className="text-sm text-foreground-subtle">{formatDateBR(saoPauloDateISO())}</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{greeting()}, Vinicius.</h1>
        <p className="mt-0.5 text-sm text-foreground-subtle">Gestão do Dia</p>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <StatTile icon={Car} label="Previstos" value={String(summary.countsToday.previstos)} />
        <StatTile icon={Car} label="Em atendimento" value={String(summary.countsToday.aguardandoAtendimento)} />
        <StatTile icon={Car} label="Em execução" value={String(summary.countsToday.emExecucao)} />
        <StatTile icon={Car} label="Conferência" value={String(summary.countsToday.aguardandoConferencia)} />
        <StatTile icon={Car} label="Prontos" value={String(summary.countsToday.prontoEntrega)} />
        <StatTile icon={Car} label="Entregues" value={String(summary.countsToday.entregue)} />
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <StatTile icon={Wallet} label="Faturamento" value={formatCurrency(summary.dailyRevenue)} emphasis />
        <StatTile icon={Receipt} label="Ticket médio" value={summary.averageTicket !== null ? formatCurrency(summary.averageTicket) : "—"} />
        <StatTile icon={Timer} label="Tempo médio" value={summary.averageServiceDurationMinutes !== null ? formatDurationMinutes(summary.averageServiceDurationMinutes) : "—"} />
      </div>

      <StatTile
        icon={Target}
        label="Meta do dia"
        value={summary.goal ? formatCurrency(summary.goal.dailyTargetEstimate) : "—"}
        hint={summary.goal ? `Estimativa a partir de "${summary.goal.label}"` : "Nenhuma meta ativa configurada"}
      />

      <CheckIn />

      <section className="space-y-2.5">
        <p className="text-xs font-medium text-foreground-subtle">Próximo Cliente</p>
        <NextCustomerCard />
      </section>

      {emExecucao.length > 0 ? (
        <section className="space-y-2.5">
          <p className="text-xs font-medium text-foreground-subtle">Em Execução · {emExecucao.length}</p>
          {emExecucao.map((order) => (
            <ExecutionMiniCard key={order.serviceOrderId} order={order} />
          ))}
        </section>
      ) : null}

      {prontos.length > 0 ? (
        <section className="space-y-2.5">
          <p className="text-xs font-medium text-foreground-subtle">Prontos para Entrega · {prontos.length}</p>
          {prontos.map((order) => (
            <ReadyCard key={order.serviceOrderId} order={order} />
          ))}
        </section>
      ) : null}

      <section className="space-y-2.5">
        <p className="text-xs font-medium text-foreground-subtle">Entradas · {entradas.length}</p>
        <DayPeriodFilter current={period.key} />
        {entradas.length === 0 ? (
          <p className="py-6 text-center text-sm text-foreground-subtle">Nenhuma entrada em &quot;{period.label}&quot;.</p>
        ) : (
          entradas.map((order) => <EntryCard key={order.serviceOrderId} order={order} />)
        )}
      </section>

      <div className="space-y-2.5 pb-4">
        <ActionButton href="/atendimento/novo" icon={PlusCircle} label="Novo Atendimento" variant="primary" />
        <ActionButton href="/assistente-gerente" icon={Sparkles} label="Assistente do Gerente" />
        <ActionButton href="/atendimento/buscar" icon={Search} label="Pesquisar Cliente" />
        <ActionButton href="/atendimento/entregas" icon={PackageCheck} label="Entregas" />
        <ActionButton href="/atendimento/veiculos" icon={Car} label="Veículos" />
        <ActionButton href="/atendimento/timeline" icon={History} label="Timeline" />
      </div>
    </div>
  );
}
