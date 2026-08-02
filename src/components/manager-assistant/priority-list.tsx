import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { OperationalPriority } from "@/lib/manager-assistant/priorities";

const LEVEL_BADGE: Record<OperationalPriority["level"], BadgeProps["variant"]> = { critico: "critical", atencao: "warning", informativo: "info" };

/** Seção 2 — no máximo 7 itens, só os reais (`derivePriorities` já filtra zerados). */
export function PriorityList({ priorities }: { priorities: OperationalPriority[] }) {
  if (priorities.length === 0) {
    return <p className="py-3 text-sm text-foreground-subtle">Nenhuma prioridade pendente agora.</p>;
  }

  return (
    <div className="space-y-2">
      {priorities.map((priority) => (
        <Link
          key={priority.id}
          href={priority.href}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background-panel p-3 transition-colors hover:border-accent/50"
        >
          <div className="flex items-center gap-2">
            <Badge variant={LEVEL_BADGE[priority.level]}>{priority.count}</Badge>
            <span className="text-sm text-foreground">{priority.label}</span>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-foreground-subtle" />
        </Link>
      ))}
    </div>
  );
}
