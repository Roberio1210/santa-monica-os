"use client";

import { useState, useTransition } from "react";
import { fieldClasses, labelClasses } from "@/components/attendance/mobile/wizard/field-styles";
import { addRecommendationAction } from "@/app/atendimento/actions";
import { RECOMMENDATION_CATEGORIES, recommendationCategoryLabel, type RecommendationCategory } from "@/lib/attendance/catalog";
import { deriveDiagnosticSuggestions, type DiagnosticSuggestion } from "@/lib/attendance/diagnosticRecommendations";
import type { TechnicalDiagnosticInput, TechnicalRecommendation } from "@/lib/attendance/types";

export function StepRecomendacoes({
  visitId,
  diagnostic,
  recommendations,
  onAdded,
}: {
  visitId: string;
  diagnostic: TechnicalDiagnosticInput;
  recommendations: TechnicalRecommendation[];
  onAdded: (recommendation: TechnicalRecommendation) => void;
}) {
  const [category, setCategory] = useState<RecommendationCategory>(RECOMMENDATION_CATEGORIES[0]);
  const [observations, setObservations] = useState("");
  const [isPending, startTransition] = useTransition();

  const addedCategories = new Set(recommendations.map((r) => r.category));
  const suggestions = deriveDiagnosticSuggestions(diagnostic).filter((s) => !addedCategories.has(s.id));

  function handleAdd(inputCategory: string, inputObservations: string | null) {
    startTransition(async () => {
      const result = await addRecommendationAction(visitId, inputCategory, inputObservations);
      if (!result.error) {
        onAdded({ id: `local-${Date.now()}`, serviceVisitId: visitId, category: inputCategory, observations: inputObservations, createdAt: new Date().toISOString() });
        setObservations("");
      }
    });
  }

  function handleAddSuggestion(suggestion: DiagnosticSuggestion) {
    handleAdd(suggestion.id, suggestion.reason);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-foreground-subtle">Este módulo não vende — apenas registra a orientação técnica dada ao cliente.</p>

      {suggestions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-foreground-subtle">Sugeridas com base no diagnóstico</p>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              disabled={isPending}
              onClick={() => handleAddSuggestion(suggestion)}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-accent/40 bg-background-panel p-3 text-left transition-transform active:scale-[0.98] disabled:opacity-50"
            >
              <div>
                <p className="text-sm font-medium text-foreground">{recommendationCategoryLabel(suggestion.id)}</p>
                <p className="text-xs text-foreground-subtle">{suggestion.reason}</p>
              </div>
              <span className="shrink-0 text-xs font-medium text-accent">Adicionar</span>
            </button>
          ))}
        </div>
      ) : null}

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
          onClick={() => handleAdd(category, observations.trim() || null)}
          disabled={isPending}
          className="flex h-12 w-full items-center justify-center rounded-xl border border-accent text-sm font-medium text-accent transition-transform active:scale-[0.98] disabled:opacity-50"
        >
          {isPending ? "Adicionando..." : "Adicionar recomendação"}
        </button>
      </div>
    </div>
  );
}
