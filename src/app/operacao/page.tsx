import { Car, CheckCircle2, ClipboardCheck, PackageCheck, Receipt, Timer, Wallet, Wrench } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/cards/stat-card";
import { RefreshButton } from "@/components/operations/refresh-button";
import { AutoRefresh } from "@/components/operations-center/auto-refresh";
import { OperationsOrderCard } from "@/components/operations-center/order-card";
import { AlertsList } from "@/components/operations-center/alerts-list";
import { QuickSearch } from "@/components/operations-center/quick-search";
import { DayTimeline } from "@/components/operations-center/day-timeline";
import { OwnerAttentionBlock } from "@/components/manager-assistant/owner-attention-block";
import { fetchOperationsCenter } from "@/lib/attendance/service";
import { fetchOwnerAttentionSnapshot } from "@/lib/manager-assistant/service";
import type { ManagerBoardOrder } from "@/lib/attendance/types";
import { formatCurrency, formatDateBR, formatDurationMinutes } from "@/lib/utils/format";
import { saoPauloDateISO, saoPauloTimeHM } from "@/lib/utils/timezone";

// Visão ao vivo — nunca serve HTML desatualizado; o auto-refresh de 30s depende de cada acesso buscar dados novos.
export const dynamic = "force-dynamic";

export default async function OperacaoPage() {
  const [center, ownerAttention] = await Promise.all([fetchOperationsCenter(), fetchOwnerAttentionSnapshot()]);
  const now = new Date(center.generatedAt);

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={30_000} />

      <PageHeader
        title="Central de Operações"
        description={`${formatDateBR(saoPauloDateISO(now))} · ${saoPauloTimeHM(now)}`}
        actions={<RefreshButton />}
      />

      <div className="flex items-center gap-2 text-sm font-medium">
        <span className={`h-2.5 w-2.5 rounded-full ${center.isOperating ? "bg-positive" : "bg-foreground-subtle"}`} />
        <span className={center.isOperating ? "text-positive" : "text-foreground-subtle"}>{center.isOperating ? "Funcionando" : "Sem atendimentos em andamento"}</span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Atendimentos hoje" icon={ClipboardCheck} value={String(center.atendimentosHoje)} />
        <StatCard label="Em execução" icon={Wrench} value={String(center.summary.countsToday.emExecucao)} />
        <StatCard label="Aguardando conferência" icon={ClipboardCheck} value={String(center.summary.countsToday.aguardandoConferencia)} />
        <StatCard label="Prontos" icon={PackageCheck} value={String(center.summary.countsToday.prontoEntrega)} />
        <StatCard label="Entregues" icon={CheckCircle2} value={String(center.summary.countsToday.entregue)} />
        <StatCard label="Faturamento do dia" icon={Wallet} value={formatCurrency(center.summary.dailyRevenue)} />
        <StatCard label="Ticket médio" icon={Receipt} value={center.summary.averageTicket !== null ? formatCurrency(center.summary.averageTicket) : "—"} />
        <StatCard label="Tempo médio" icon={Timer} value={center.summary.averageServiceDurationMinutes !== null ? formatDurationMinutes(center.summary.averageServiceDurationMinutes) : "—"} />
      </div>

      <OwnerAttentionBlock snapshot={ownerAttention} />

      <AlertsList alerts={center.alerts} />

      <QuickSearch />

      <OrdersSection title="Veículos em Execução" icon={Wrench} orders={center.emExecucao} stageLabel="Em execução há" />

      <OrdersSection title="Fila de Conferência" icon={ClipboardCheck} orders={center.aguardandoConferencia} stageLabel="Aguardando conferência há" />

      <OrdersSection title="Prontos para Entrega" icon={PackageCheck} orders={center.prontos} stageLabel="Aguardando retirada há" />

      <DayTimeline events={center.timeline} />
    </div>
  );
}

function OrdersSection({
  title,
  icon: Icon,
  orders,
  stageLabel,
}: {
  title: string;
  icon: typeof Car;
  orders: ManagerBoardOrder[];
  stageLabel: string;
}) {
  return (
    <section className="space-y-2.5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="h-4 w-4 text-foreground-subtle" />
        {title} · {orders.length}
      </h2>
      {orders.length === 0 ? (
        <p className="py-3 text-sm text-foreground-subtle">Nenhum veículo nesta fila agora.</p>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => (
            <OperationsOrderCard key={order.serviceOrderId} order={order} stageLabel={stageLabel} />
          ))}
        </div>
      )}
    </section>
  );
}
