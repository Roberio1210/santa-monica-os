import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
}

const trendStyles = {
  up: { icon: ArrowUpRight, className: "text-positive" },
  down: { icon: ArrowDownRight, className: "text-critical" },
  flat: { icon: Minus, className: "text-foreground-subtle" },
};

export function StatCard({ label, value, icon: Icon, trend, hint, onClick, active }: StatCardProps) {
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
        <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
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
