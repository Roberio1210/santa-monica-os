import { DollarSign, Wallet, Receipt, CalendarClock, Gauge, CreditCard, AlertTriangle, ParkingSquare, TrendingDown } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Unavailable } from "@/components/shared/unavailable";
import { PeriodSelector } from "@/components/operations/period-selector";
import { StatCard } from "@/components/cards/stat-card";
import { getOperationalOverview } from "@/lib/overview/service";
import { parsePeriodParams, SAO_PAULO_TZ } from "@/lib/utils/timezone";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { APPOINTMENT_STATUS_LABELS } from "@/lib/planning/types";

// Missão 82 (VG1) — consulta dados reais a cada acesso, mesmo padrão de /painel-gerencial e /dashboard.
export const dynamic = "force-dynamic";

function formatUpdatedAt(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO_TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

const alertBadgeVariant = { info: "info", warning: "warning", critical: "critical" } as const;

export default async function VisaoGeralPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parsePeriodParams(params);
  const overview = await getOperationalOverview(period);
  const periodCaption = period.from === period.to ? formatDateBR(period.from) : `${formatDateBR(period.from)} a ${formatDateBR(period.to)}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Visão Geral" description="Operação, agenda e financeiro em um só lugar." actions={<Badge variant="outline">Atualizado às {formatUpdatedAt(overview.metadata.generatedAt)}</Badge>} />

      <div className="flex flex-col gap-2">
        <PeriodSelector period={period} />
        <p className="text-sm text-foreground-muted">{period.label} — {periodCaption}</p>
      </div>

      {/* Cards principais */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Faturamento realizado"
          icon={DollarSign}
          value={overview.revenue.realizado !== null ? formatCurrency(overview.revenue.realizado) : "Indisponível"}
          hint={overview.revenue.realizado === null ? (overview.revenue.realizadoIndisponivelMotivo ?? undefined) : "Estética + estacionamento (competência)"}
        />
        <StatCard label="Faturamento previsto" icon={Wallet} value={formatCurrency(overview.revenue.previsto)} hint="Contas a receber em aberto, vencendo no período" />
        <StatCard
          label="Recebido no período"
          icon={Receipt}
          value={overview.revenue.recebido !== null ? formatCurrency(overview.revenue.recebido) : "Indisponível"}
          hint={overview.revenue.recebido === null ? (overview.revenue.recebidoIndisponivelMotivo ?? undefined) : "Regime de caixa"}
        />
        <StatCard label="Agendamentos" icon={CalendarClock} value={String(overview.appointments.totalCount)} hint={Object.entries(overview.appointments.countByStatus).map(([s, n]) => `${n} ${APPOINTMENT_STATUS_LABELS[s as keyof typeof APPOINTMENT_STATUS_LABELS] ?? s}`).join(" · ") || "Nenhum no período"} />
        <StatCard
          label="Ocupação dos boxes"
          icon={Gauge}
          value={overview.capacity.status === "ok" ? `${overview.capacity.percentOccupied.toFixed(0)}%` : "—"}
          hint={overview.capacity.status === "ok" ? `Disponível: ${(overview.capacity.availableMinutes / 60).toFixed(1)}h de ${(overview.capacity.dailyCapacityMinutes / 60).toFixed(1)}h` : overview.capacity.reason}
        />
        <StatCard label="Contas a receber no período" icon={Receipt} value={formatCurrency(overview.finance.receivable.totalAmount)} hint={`${overview.finance.receivable.items.length} conta(s) em aberto`} />
        <StatCard label="Contas a pagar no período" icon={TrendingDown} value={formatCurrency(overview.finance.payable.totalAmount)} hint={`${overview.finance.payable.items.length} conta(s) em aberto`} />
        <StatCard label="Vendas Stone no período" icon={CreditCard} value={formatCurrency(overview.stone.vendasNoPeriodo.netAmount)} hint={`${overview.stone.vendasNoPeriodo.count} venda(s) identificada(s)`} />
      </div>

      {/* Stone */}
      <Card>
        <CardHeader>
          <CardTitle>Stone</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 pb-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium text-foreground-muted">Saldo disponível</p>
            <p className="mt-1 text-lg font-semibold text-foreground"><Unavailable label="Indisponível" /></p>
            <p className="mt-1 text-xs text-foreground-subtle">{overview.stone.saldoIndisponivelMotivo}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-foreground-muted">Liquidações identificadas</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{formatCurrency(overview.stone.liquidacoesNoPeriodo.settledAmount)}</p>
            <p className="mt-1 text-xs text-foreground-subtle">
              {overview.stone.liquidacoesNoPeriodo.count} parcela(s) já identificada(s) no período
              {overview.stone.status === "partial" ? " — liquidação de hoje costuma chegar D+1 ou mais, número ainda pode crescer" : ""}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-foreground-muted">Última sincronização</p>
            <p className="mt-1 text-lg font-semibold text-foreground">{overview.stone.ultimaSincronizacao ? formatUpdatedAt(overview.stone.ultimaSincronizacao) : <Unavailable />}</p>
          </div>
        </CardContent>
      </Card>

      {/* No pátio agora */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ParkingSquare className="h-4 w-4" /> No pátio agora</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <p className="text-sm text-foreground-muted">{overview.yard.message}</p>
          <p className="mt-1 text-xs text-foreground-subtle">{overview.yard.detail}</p>
        </CardContent>
      </Card>

      {/* Agenda do período */}
      <Card>
        <CardHeader>
          <CardTitle>Agenda do período</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pb-4">
          {overview.appointments.byDay.length === 0 ? (
            <p className="text-sm text-foreground-muted">Nenhum agendamento no período selecionado.</p>
          ) : (
            overview.appointments.byDay.map((day) => (
              <div key={day.dateIso}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-foreground-subtle">{formatDateBR(day.dateIso)}</p>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-background-elevated text-xs text-foreground-muted">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Horário</th>
                        <th className="px-3 py-2 text-left font-medium">Cliente</th>
                        <th className="px-3 py-2 text-left font-medium">Veículo</th>
                        <th className="px-3 py-2 text-left font-medium">Placa</th>
                        <th className="px-3 py-2 text-left font-medium">Serviço</th>
                        <th className="px-3 py-2 text-left font-medium">Duração</th>
                        <th className="px-3 py-2 text-left font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {day.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2">{new Intl.DateTimeFormat("pt-BR", { timeZone: SAO_PAULO_TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(item.scheduledAt))}</td>
                          <td className="px-3 py-2">{item.customerName ?? <Unavailable label="Sem cliente" />}</td>
                          <td className="px-3 py-2">{item.vehicleLabel}</td>
                          <td className="px-3 py-2">{item.plate ?? <span className="italic text-foreground-subtle">Placa não informada</span>}</td>
                          <td className="px-3 py-2">{item.serviceName}</td>
                          <td className="px-3 py-2">{item.expectedDurationMinutes !== null ? `${item.expectedDurationMinutes} min` : <span className="italic text-foreground-subtle">Valor não definido</span>}</td>
                          <td className="px-3 py-2"><Badge variant="outline">{APPOINTMENT_STATUS_LABELS[item.status as keyof typeof APPOINTMENT_STATUS_LABELS] ?? item.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Serviços do período */}
      <Card>
        <CardHeader>
          <CardTitle>Serviços do período</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {overview.services.byService.length === 0 ? (
            <p className="text-sm text-foreground-muted">Nenhum serviço agendado/realizado no período.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-background-elevated text-xs text-foreground-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Serviço</th>
                    <th className="px-3 py-2 text-left font-medium">Realizado</th>
                    <th className="px-3 py-2 text-left font-medium">Previsto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {overview.services.byService.map((s) => (
                    <tr key={s.serviceName}>
                      <td className="px-3 py-2">{s.serviceName}</td>
                      <td className="px-3 py-2">{s.realizadoCount}</td>
                      <td className="px-3 py-2">{s.previstoCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alertas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Alertas</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {overview.alerts.length === 0 ? (
            <p className="text-sm text-foreground-muted">Nenhum alerta no momento.</p>
          ) : (
            <ul className="space-y-2">
              {overview.alerts.map((alert) => (
                <li key={alert.id} className="flex items-center gap-2 text-sm">
                  <Badge variant={alertBadgeVariant[alert.severity]}>{alert.severity === "critical" ? "Crítico" : alert.severity === "warning" ? "Atenção" : "Info"}</Badge>
                  <span className="text-foreground-muted">{alert.message}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
