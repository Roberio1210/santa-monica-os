import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertOctagon, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Banknote, Bell, DollarSign, Scale } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils/format";
import { sumOutstandingDueOn, type CentralOverview } from "@/lib/operations/central";

type CardTone = "critico" | "atencao" | "neutro";

const toneRing: Record<CardTone, string> = {
  critico: "border-l-4 border-l-critical",
  atencao: "border-l-4 border-l-warning",
  neutro: "",
};

interface AgoraCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  href: string | null;
  tone?: CardTone;
}

function AgoraCard({ icon: Icon, label, value, href, tone = "neutro" }: AgoraCardProps) {
  const content = (
    <Card className={`${toneRing[tone]} p-3 ${href ? "transition-colors hover:border-accent/50 hover:bg-background-elevated" : ""}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-foreground-subtle" aria-hidden="true" />
        <p className="text-xs font-medium text-foreground-muted">{label}</p>
      </div>
      <p className="mt-1.5 text-lg font-semibold tracking-tight text-foreground">{value}</p>
    </Card>
  );
  if (!href) return content;
  return (
    <Link href={href} aria-label={`${label}: ${value}. Ver detalhes.`} className="block rounded-xl">
      {content}
    </Link>
  );
}

/**
 * Missão UX/Navegação 4B — substitui `PriorityPanel`+`TodayPanel` (removidos). Mostra SÓ
 * indicadores com fonte real e confiável, nunca "Informação indisponível" como KPI principal —
 * quando uma fonte não responde, o card recebe `href={null}` e some do link, mas nunca inventa
 * valor. "Veículos aguardando entrega" e "Agenda de hoje" (Missão 4A) foram removidos daqui por
 * nunca terem tido fonte real conectada — o acesso a `/agenda` continua disponível pelo grupo
 * "Gestão" dos atalhos da Central, nunca removido da navegação.
 *
 * "Caixa agora" mostra só sinais operacionais do dia (entradas/saídas/saldo/resultado do caixa),
 * nunca análises do Financeiro (margem, comparativos, faturamento) — essas ficam exclusivamente
 * em `/financeiro`/`/painel-gerencial`, cada card daqui aponta para lá quando o gestor quiser
 * aprofundar.
 */
export function AgoraPanel({ overview, alertsCount }: { overview: CentralOverview; alertsCount: number }) {
  const today = overview.asOfDate;

  const overdueCount = overview.accountsPayable.data ? overview.accountsPayable.data.items.filter((i) => i.computedStatus === "vencida").length : null;
  const dueTodayAmount = overview.accountsPayable.data ? sumOutstandingDueOn(overview.accountsPayable.data.items, today) : null;
  const receivingTodayCount = overview.accountsReceivable.data ? overview.accountsReceivable.data.items.filter((i) => i.dueDate === today && i.outstandingAmount > 0).length : null;
  const receivingTodayAmount = overview.accountsReceivable.data ? sumOutstandingDueOn(overview.accountsReceivable.data.items, today) : 0;

  const negativeAccounts = overview.cashFlow.data ? overview.cashFlow.data.accounts.filter((a) => a.currentBalance < 0) : null;
  const negativeAccountsTotal = negativeAccounts ? Math.round(negativeAccounts.reduce((sum, a) => sum + a.currentBalance, 0) * 100) / 100 : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-3 text-sm font-medium text-foreground-muted">Agora — o que precisa da sua atenção</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <AgoraCard icon={Bell} label="Alertas ativos" value={String(alertsCount)} href="/alertas" tone={alertsCount > 0 ? "atencao" : "neutro"} />
          <AgoraCard
            icon={AlertOctagon}
            label="Contas vencidas"
            value={overdueCount !== null ? String(overdueCount) : "Informação indisponível"}
            href={overdueCount !== null ? "/financeiro/contas-a-pagar?quick=vencida" : null}
            tone={overdueCount !== null && overdueCount > 0 ? "critico" : "neutro"}
          />
          <AgoraCard
            icon={AlertTriangle}
            label="Contas vencendo hoje"
            value={dueTodayAmount !== null ? formatCurrency(dueTodayAmount) : "Informação indisponível"}
            href={dueTodayAmount !== null ? "/financeiro/contas-a-pagar?quick=vence_hoje" : null}
            tone={dueTodayAmount !== null && dueTodayAmount > 0 ? "atencao" : "neutro"}
          />
          <AgoraCard
            icon={Banknote}
            label="Recebimentos para hoje"
            value={receivingTodayCount !== null ? `${receivingTodayCount} · ${formatCurrency(receivingTodayAmount)}` : "Informação indisponível"}
            href={receivingTodayCount !== null ? `/financeiro/contas-a-receber?dueFrom=${today}&dueTo=${today}` : null}
          />
          <AgoraCard
            icon={AlertOctagon}
            label="Contas com saldo negativo"
            value={negativeAccounts !== null ? (negativeAccounts.length > 0 ? `${negativeAccounts.length} · ${formatCurrency(negativeAccountsTotal ?? 0)}` : "Nenhuma") : "Informação indisponível"}
            href={negativeAccounts !== null ? "/financeiro/fluxo-de-caixa" : null}
            tone={negativeAccounts !== null && negativeAccounts.length > 0 ? "critico" : "neutro"}
          />
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-foreground-muted">Caixa agora</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <AgoraCard
            icon={DollarSign}
            label="Caixa disponível"
            value={overview.cashFlow.data ? formatCurrency(overview.cashFlow.data.dashboard.saldoGeral) : "Informação indisponível"}
            href={overview.cashFlow.data ? "/financeiro/fluxo-de-caixa" : null}
          />
          <AgoraCard
            icon={ArrowUpCircle}
            label="Entradas de caixa hoje"
            value={overview.cashFlow.data ? formatCurrency(overview.cashFlow.data.dashboard.entradasHoje) : "Informação indisponível"}
            href={overview.cashFlow.data ? `/financeiro/fluxo-de-caixa?tipo=entrada&data=${today}` : null}
          />
          <AgoraCard
            icon={ArrowDownCircle}
            label="Saídas de caixa hoje"
            value={overview.cashFlow.data ? formatCurrency(overview.cashFlow.data.dashboard.saidasHoje) : "Informação indisponível"}
            href={overview.cashFlow.data ? `/financeiro/fluxo-de-caixa?tipo=saida&data=${today}` : null}
          />
          <AgoraCard
            icon={Scale}
            label="Resultado de caixa do dia"
            value={overview.cashFlow.data ? formatCurrency(overview.cashFlow.data.dashboard.resultadoDia) : "Informação indisponível"}
            href={overview.cashFlow.data ? `/financeiro/fluxo-de-caixa?data=${today}` : null}
          />
        </div>
      </div>
    </div>
  );
}
