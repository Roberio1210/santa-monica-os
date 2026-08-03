import { Sparkles } from "lucide-react";
import type { SmartRecommendation } from "@/lib/crm-intelligente/types";

/** "O QUE FAZ SENTIDO OFERECER" (Missão 21) — sempre com o motivo real ao lado. */
export function RecommendationsCard({ recommendations }: { recommendations: SmartRecommendation[] }) {
  if (recommendations.length === 0) {
    return <p className="rounded-xl border border-dashed border-border-subtle p-3 text-xs text-foreground-subtle">Nenhuma recomendação com evidência real no momento.</p>;
  }

  return (
    <div className="space-y-1.5">
      {recommendations.map((r) => (
        <div key={r.id} className="flex gap-2 rounded-lg border border-accent/30 bg-accent/5 p-2.5 text-xs">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          <div>
            <p className="font-medium text-foreground">{r.label}</p>
            <p className="text-foreground-subtle">{r.reason}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
