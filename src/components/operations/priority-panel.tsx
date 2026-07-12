import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertOctagon, Banknote, CalendarClock, Car, DollarSign } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils/format";
import { sumOutstandingDueOn, type CentralOverview } from "@/lib/operations/central";

type PrioritySeverity = "critico" | "atencao" | "informativo" | "positivo";

const severityBadge: Record<PrioritySeverity, "critical" | "warning" | "info" | "positive"> = {
  critico: "critical",
  atencao: "warning",
  informativo: "info",
  positivo: "positive",
};

const severityRing: Record<PrioritySeverity, string> = {
  critico: "border-l-4 border-l-critical",
  atencao: "border-l-4 border-l-warning",
  informativo: "border-l-4 border-l-info",
  positivo: "border-l-4 border-l-positive",
};

interface PriorityCardProps {
  severity: PrioritySeverity;
  icon: LucideIcon;
  label: string;
  value: string;
  href: string | null;
  ctaLabel?: string;
}

function PriorityCard({ severity, icon: Icon, label, value, href, ctaLabel = "Ver" }: PriorityCardProps) {
  return (
    <Card className={`${severityRing[severity]} p-4 transition-shadow hover:shadow-md`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-foreground-subtle" aria-hidden="true" />
          <p className="text-xs font-medium text-foreground-muted">{label}</p>
        </div>
        <Badge variant={severityBadge[severity]}>{severity === "critico" ? "Crítico" : severity === "atencao" ? "Atenção" : severity === "positivo" ? "OK" : "Info"}</Badge>
      </div>
      <p className="mt-2 text-xl font-semibold tracking-tight text-foreground">{value}</p>
      <div className="mt-3">
        {href ? (
          <Button asChild variant="outline" className="h-7 px-2 text-xs">
            <Link href={href} aria-label={`${label}: ${value}. ${ctaLabel}.`}>
              {ctaLabel}
            </Link>
          </Button>
        ) : (
          <p className="text-xs italic text-foreground-subtle">Sem fonte confiável</p>
        )}
      </div>
    </Card>
  );
}

/** "O que precisa da sua atenção" — cards de prioridade, cada um com severidade, ícone e ação direta. */
export function PriorityPanel({ overview }: { overview: CentralOverview }) {
  const today = overview.asOfDate;

  const overdueCount = overview.accountsPayable.data ? overview.accountsPayable.data.items.filter((i) => i.computedStatus === "vencida").length : null;
  const receivingTodayCount = overview.accountsReceivable.data ? overview.accountsReceivable.data.items.filter((i) => i.dueDate === today && i.outstandingAmount > 0).length : null;
  const receivingTodayAmount = overview.accountsReceivable.data ? sumOutstandingDueOn(overview.accountsReceivable.data.items, today) : 0;

  return (
    <div>
      <h2 className="mb-3 text-sm font-medium text-foreground-muted">O que precisa da sua atenção</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <PriorityCard
          severity="critico"
          icon={AlertOctagon}
          label="Contas vencidas"
          value={overdueCount !== null ? String(overdueCount) : "Informação indisponível"}
          href={overdueCount !== null ? "/financeiro/contas-a-pagar?quick=vencida" : null}
        />
        <PriorityCard
          severity="atencao"
          icon={Banknote}
          label="Recebimentos para hoje"
          value={receivingTodayCount !== null ? `${receivingTodayCount} · ${formatCurrency(receivingTodayAmount)}` : "Informação indisponível"}
          href={receivingTodayCount !== null ? `/financeiro/contas-a-receber?dueFrom=${today}&dueTo=${today}` : null}
        />
        <PriorityCard severity="informativo" icon={Car} label="Veículos aguardando entrega" value="Informação indisponível" href={null} />
        <PriorityCard severity="informativo" icon={CalendarClock} label="Agenda de hoje" value="Não integrada" href="/agenda" ctaLabel="Abrir agenda" />
        <PriorityCard
          severity="positivo"
          icon={DollarSign}
          label="Caixa disponível"
          value={overview.cashFlow.data ? formatCurrency(overview.cashFlow.data.dashboard.saldoGeral) : "Informação indisponível"}
          href={overview.cashFlow.data ? "/financeiro/fluxo-de-caixa" : null}
        />
      </div>
    </div>
  );
}
