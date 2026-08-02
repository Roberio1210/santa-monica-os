"use client";

import { useState, useTransition } from "react";
import { fieldClasses, labelClasses } from "@/components/attendance/mobile/wizard/field-styles";
import { addRecommendationAction } from "@/app/atendimento/actions";
import { RECOMMENDATION_CATEGORIES, recommendationCategoryLabel, type RecommendationCategory } from "@/lib/attendance/catalog";
import type { TechnicalRecommendation } from "@/lib/attendance/types";

export function StepRecomendacoes({
  visitId,
  recommendations,
  onAdded,
}: {
  visitId: string;
  recommendations: TechnicalRecommendation[];
  onAdded: (recommendation: TechnicalRecommendation) => void;
}) {
  const [category, setCategory] = useState<RecommendationCategory>(RECOMMENDATION_CATEGORIES[0]);
  const [observations, setObservations] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    startTransition(async () => {
      const result = await addRecommendationAction(visitId, category, observations.trim() || null);
      if (!result.error) {
        onAdded({ id: `local-${Date.now()}`, serviceVisitId: visitId, category, observations: observations.trim() || null, createdAt: new Date().toISOString() });
        setObservations("");
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground-subtle">Este módulo não vende — apenas registra a orientação técnica dada ao cliente.</p>

      {recommendations.length > 0 ? (
        <div className="space-y-2">
          {recommendations.map((r) => (
            <div key={r.id} className="rounded-xl border border-border-subtle bg-background-panel p-3">
              <p className="text-sm font-medium text-foreground">{recommendationCategoryLabel(r.category)}</p>
              {r.observations ? <p className="mt-0.5 text-sm text-foreground-subtle">{r.observations}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="space-y-3 rounded-2xl border border-border-subtle bg-background-panel p-4">
        <div>
          <label className={labelClasses} htmlFor="wizard-recomendacao-categoria">
            Categoria
          </label>
          <select
            id="wizard-recomendacao-categoria"
            value={category}
            onChange={(e) => setCategory(e.target.value as RecommendationCategory)}
            className={fieldClasses}
          >
            {RECOMMENDATION_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {recommendationCategoryLabel(c)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClasses} htmlFor="wizard-recomendacao-observacao">
            Observação (opcional)
          </label>
          <input
            id="wizard-recomendacao-observacao"
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            className={fieldClasses}
            placeholder="Ex.: riscos leves na lateral direita"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={isPending}
          className="flex h-12 w-full items-center justify-center rounded-xl border border-accent text-sm font-medium text-accent transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {isPending ? "Adicionando..." : "Adicionar recomendação"}
        </button>
      </div>
    </div>
  );
}
