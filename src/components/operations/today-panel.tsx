import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Bell, CalendarClock, Car, DollarSign, Receipt, Scale } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { sumOutstandingDueOn, type CentralOverview } from "@/lib/operations/central";

interface TodayCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  href: string | null;
  hint?: string;
}

function TodayCard({ label, value, icon: Icon, href, hint }: TodayCardProps) {
  const content = (
    <Card
      className={
        href
          ? "cursor-pointer p-4 transition-colors hover:border-accent/50 hover:bg-background-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          : "p-4"
      }
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-foreground-muted">{label}</p>
        <Icon className="h-4 w-4 text-foreground-subtle" />
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-foreground-subtle">{href ? (hint ?? "Ver detalhes") : (hint ?? "Sem tela de detalhe confiável")}</p>
    </Card>
  );

  if (!href) return content;

  return (
    <Link href={href} aria-label={`${label}: ${value}. ${hint ?? "Ver detalhes"}.`} className="block rounded-xl">
      {content}
    </Link>
  );
}

export function TodayPanel({ overview, alertsCount }: { overview: CentralOverview; alertsCount: number }) {
  const today = overview.asOfDate;

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-foreground-muted">Hoje</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <TodayCard
          label="Faturamento operacional hoje"
          value={overview.jumppark.data ? formatCurrency(overview.jumppark.data.dailyRevenue) : "Informação indisponível"}
          icon={DollarSign}
          href={overview.jumppark.data ? "/movimentacoes?period=today" : null}
        />
        <TodayCard
          label="Entradas de caixa hoje"
          value={overview.cashFlow.data ? formatCurrency(overview.cashFlow.data.dashboard.entradasHoje) : "Informação indisponível"}
          icon={ArrowUpCircle}
          href={overview.cashFlow.data ? `/financeiro/fluxo-de-caixa?tipo=entrada&data=${today}` : null}
        />
        <TodayCard
          label="Saídas de caixa hoje"
          value={overview.cashFlow.data ? formatCurrency(overview.cashFlow.data.dashboard.saidasHoje) : "Informação indisponível"}
          icon={ArrowDownCircle}
          href={overview.cashFlow.data ? `/financeiro/fluxo-de-caixa?tipo=saida&data=${today}` : null}
        />
        <TodayCard
          label="Resultado de caixa do dia"
          value={overview.cashFlow.data ? formatCurrency(overview.cashFlow.data.dashboard.resultadoDia) : "Informação indisponível"}
          icon={Scale}
          href={overview.cashFlow.data ? `/financeiro/fluxo-de-caixa?data=${today}` : null}
        />
        <TodayCard
          label="Veículos atendidos hoje"
          value={overview.jumppark.data ? String(overview.jumppark.data.vehicles) : "Informação indisponível"}
          icon={Car}
          href={overview.jumppark.data ? "/movimentacoes?period=today" : null}
        />
        <TodayCard label="Agenda do dia" value="Não integrada" icon={CalendarClock} href="/agenda" hint="Agenda real ainda não integrada" />
        <TodayCard
          label="Contas vencendo hoje"
          value={overview.accountsPayable.data ? formatCurrency(sumOutstandingDueOn(overview.accountsPayable.data.items, today)) : "Informação indisponível"}
          icon={AlertTriangle}
          href={overview.accountsPayable.data ? "/financeiro/contas-a-pagar?quick=vence_hoje" : null}
        />
        <TodayCard
          label="Contas a receber hoje"
          value={overview.accountsReceivable.data ? formatCurrency(sumOutstandingDueOn(overview.accountsReceivable.data.items, today)) : "Informação indisponível"}
          icon={Receipt}
          href={overview.accountsReceivable.data ? `/financeiro/contas-a-receber?dueFrom=${today}&dueTo=${today}` : null}
        />
        <TodayCard label="Alertas ativos" value={String(alertsCount)} icon={Bell} href="/alertas" />
      </div>
    </div>
  );
}
