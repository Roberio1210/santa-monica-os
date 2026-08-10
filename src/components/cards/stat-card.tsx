import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DrillDownDialog } from "@/components/shared/drill-down-dialog";
import { cn } from "@/lib/utils/cn";
import type { Trend } from "@/types/common";

interface StatCardProps {
  label: string;
  value: string;
  icon?: LucideIcon;
  trend?: Trend;
  hint?: string;
  /** Quando informado, o card vira clicável (ex.: aplicar um filtro rápido correspondente). */
  onClick?: () => void;
  /** Realça o card quando o filtro que ele representa está ativo. */
  active?: boolean;
  /**
   * Missão 29 — quando informado, o valor abre em modal ("Ver detalhes") mostrando os registros
   * reais por trás do número (e, tipicamente, um `CalculationNote` explicando "como foi
   * calculado"). Incompatível com `onClick` (o valor já fica clicável para o drill-down) — se
   * ambos forem passados, o drill-down tem prioridade sobre o valor, e o card mantém o onClick.
   */
  detail?: ReactNode;
}

const trendStyles = {
  up: { icon: ArrowUpRight, className: "text-positive" },
  down: { icon: ArrowDownRight, className: "text-critical" },
  flat: { icon: Minus, className: "text-foreground-subtle" },
};

export function StatCard({ label, value, icon: Icon, trend, hint, onClick, active, detail }: StatCardProps) {
  const TrendIcon = trend ? trendStyles[trend.direction].icon : null;

  return (
    <Card
      onClick={onClick}
      className={cn(
        onClick && "cursor-pointer transition-colors hover:border-accent/50 hover:bg-background-elevated",
        active && "border-accent ring-1 ring-accent/40",
      )}
    >
      <CardContent className="pt-4">
        <div className="flex items-start justify-between">
          <p className="text-xs font-medium text-foreground-muted">{label}</p>
          {Icon ? <Icon className="h-4 w-4 text-foreground-subtle" /> : null}
        </div>
        {detail ? (
          <DrillDownDialog
            trigger={value}
            title={label}
            triggerClassName="mt-2 block w-full text-2xl font-semibold tracking-tight text-foreground no-underline hover:text-accent hover:underline"
          >
            {detail}
          </DrillDownDialog>
        ) : (
          <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        )}
        <div className="mt-1 flex items-center gap-1 text-xs">
          {trend && TrendIcon ? (
            <span className={cn("flex items-center gap-0.5 font-medium", trendStyles[trend.direction].className)}>
              <TrendIcon className="h-3 w-3" />
              {trend.value}%
            </span>
          ) : null}
          {hint ? <span className="text-foreground-subtle">{hint}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
