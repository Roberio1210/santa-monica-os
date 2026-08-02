import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshButton } from "@/components/operations/refresh-button";
import { AutoRefresh } from "@/components/operations-center/auto-refresh";
import { AlertCard } from "@/components/manager-assistant/alert-card";
import { PriorityList } from "@/components/manager-assistant/priority-list";
import { ClientAttentionCard } from "@/components/manager-assistant/client-attention-card";
import { DiscountsSummary } from "@/components/manager-assistant/discounts-summary";
import { OwnerSummary } from "@/components/manager-assistant/owner-summary";
import { NotificationsList } from "@/components/manager-assistant/notifications-list";
import { SummaryPeriodToggle } from "@/components/manager-assistant/summary-period-toggle";
import { fetchManagerAssistant, fetchOwnerSummary } from "@/lib/manager-assistant/service";
import { saoPauloDateISO, addDaysIso } from "@/lib/utils/timezone";

// Visão ao vivo — sincroniza notificações a cada acesso; o auto-refresh de 30s depende disso.
export const dynamic = "force-dynamic";

export default async function AssistenteGerentePage({ searchParams }: { searchParams: Promise<{ view?: string; date?: string }> }) {
  const params = await searchParams;
  const today = saoPauloDateISO();
  const mode = params.view === "fechamento" ? "fechamento" : "agora";
  const selectedDate = mode === "fechamento" && params.date ? params.date : addDaysIso(today, -1);

  const [assistant, fechamentoSummary] = await Promise.all([fetchManagerAssistant(), mode === "fechamento" ? fetchOwnerSummary(selectedDate) : Promise.resolve(null)]);

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={30_000} />

      <PageHeader title="Assistente do Gerente" description="O que precisa de atenção agora, prioridades do dia e descontos concedidos." actions={<RefreshButton />} />

      <Card>
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <SummaryPeriodToggle mode={mode} date={selectedDate} />
          <OwnerSummary summary={mode === "agora" ? assistant.summaryNow : (fechamentoSummary ?? assistant.summaryNow)} mode={mode} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Atenção Agora · {assistant.alerts.length}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-0">
          {assistant.alerts.length === 0 ? (
            <p className="py-3 text-sm text-foreground-subtle">Nenhuma situação exigindo ação imediata agora.</p>
          ) : (
            assistant.alerts.map((alert) => <AlertCard key={alert.dedupeKey} alert={alert} />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prioridades de Hoje</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <PriorityList priorities={assistant.priorities} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clientes que Merecem Atenção · {assistant.clientsAttention.length}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-0">
          {assistant.clientsAttention.length === 0 ? (
            <p className="py-3 text-sm text-foreground-subtle">Nenhum cliente de hoje com sinal de atenção registrado.</p>
          ) : (
            assistant.clientsAttention.map((entry) => <ClientAttentionCard key={entry.customerId} entry={entry} />)
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Descontos de Hoje</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <DiscountsSummary data={assistant.discountsToday} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notificações</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <NotificationsList notifications={assistant.notifications} />
        </CardContent>
      </Card>
    </div>
  );
}
