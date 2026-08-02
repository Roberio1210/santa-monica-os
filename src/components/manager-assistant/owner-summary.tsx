import { StatCard } from "@/components/cards/stat-card";
import { ClipboardCheck, PackageCheck, Wrench, Wallet, Receipt, Timer, Percent, AlertTriangle, Wand2, CheckCircle2 } from "lucide-react";
import { formatCurrency, formatDurationMinutes } from "@/lib/utils/format";
import type { OwnerSummary as OwnerSummaryData } from "@/lib/manager-assistant/service";

/**
 * Seção 5 — mesmo componente para "Agora" e "Fechamento do dia": só a contagem de veículos ainda
 * abertos é ao vivo (não faz sentido para um dia passado), por isso só aparece no modo `agora`.
 */
export function OwnerSummary({ summary, mode }: { summary: OwnerSummaryData; mode: "agora" | "fechamento" }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <StatCard label="Atendimentos criados" icon={ClipboardCheck} value={String(summary.atendimentosCriados)} />
      <StatCard label="Veículos entregues" icon={CheckCircle2} value={String(summary.veiculosEntregues)} />
      {mode === "agora" ? <StatCard label="Veículos ainda abertos (agora)" icon={Wrench} value={String(summary.veiculosAbertosAgora)} /> : null}
      <StatCard label="Faturamento registrado" icon={Wallet} value={formatCurrency(summary.faturamentoRegistrado)} />
      <StatCard label="Ticket médio" icon={Receipt} value={summary.ticketMedio !== null ? formatCurrency(summary.ticketMedio) : "—"} />
      <StatCard label="Tempo médio registrado" icon={Timer} value={summary.tempoMedioMinutos !== null ? formatDurationMinutes(summary.tempoMedioMinutos) : "—"} />
      <StatCard label="Descontos concedidos" icon={Percent} value={formatCurrency(summary.descontos.totalAmount)} hint={`${summary.descontos.count} desconto(s)`} />
      <StatCard label="Ordens sem valor" icon={AlertTriangle} value={String(summary.ordensSemValor)} />
      <StatCard label="Alertas críticos" icon={AlertTriangle} value={String(summary.alertasCriticos)} />
      <StatCard label="Recomendações técnicas" icon={Wand2} value={String(summary.recomendacoesTecnicas)} />
      <StatCard label="Serviços aprovados" icon={PackageCheck} value={String(summary.servicosAprovados)} />
    </div>
  );
}
