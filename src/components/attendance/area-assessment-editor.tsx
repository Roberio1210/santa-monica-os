"use client";

import { cn } from "@/lib/utils/cn";
import { AREA_PROBLEM_LABELS } from "@/lib/attendance/catalog";
import { CONDITIONS, CONDITION_LABELS, SEVERITIES, SEVERITY_LABELS, type AreaAssessment, type Condition, type Severity } from "@/lib/attendance/types";

/** Editor reutilizável para uma área do diagnóstico — condição + (quando houver catálogo) problemas com gravidade. */
export function AreaAssessmentEditor({
  label,
  value,
  onChange,
  problemCatalog,
}: {
  label: string;
  value: AreaAssessment;
  onChange: (next: AreaAssessment) => void;
  problemCatalog?: readonly string[];
}) {
  function setCondition(condition: Condition) {
    onChange({ ...value, condition });
  }

  function toggleProblem(type: string) {
    const exists = value.problems.find((p) => p.type === type);
    if (exists) {
      onChange({ ...value, problems: value.problems.filter((p) => p.type !== type) });
    } else {
      onChange({ ...value, problems: [...value.problems, { type, severity: "leve" }] });
    }
  }

  function setSeverity(type: string, severity: Severity) {
    onChange({ ...value, problems: value.problems.map((p) => (p.type === type ? { ...p, severity } : p)) });
  }

  return (
    <div className="rounded-lg border border-border-subtle p-3">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {CONDITIONS.map((condition) => (
          <button
            key={condition}
            type="button"
            onClick={() => setCondition(condition)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              value.condition === condition ? "border-accent bg-accent text-accent-foreground" : "border-border bg-background-elevated text-foreground-muted hover:bg-background-panel",
            )}
          >
            {CONDITION_LABELS[condition]}
          </button>
        ))}
      </div>

      {problemCatalog ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-foreground-subtle">Problemas identificados</p>
          <div className="flex flex-wrap gap-1.5">
            {problemCatalog.map((type) => {
              const selected = value.problems.find((p) => p.type === type);
              return (
                <div key={type} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => toggleProblem(type)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                      selected ? "border-warning bg-warning-bg text-warning" : "border-border bg-background-elevated text-foreground-muted hover:bg-background-panel",
                    )}
                  >
                    {AREA_PROBLEM_LABELS[type] ?? type}
                  </button>
                  {selected ? (
                    <select
                      value={selected.severity}
                      onChange={(e) => setSeverity(type, e.target.value as Severity)}
                      className="h-7 rounded-md border border-border bg-background-elevated px-1 text-xs text-foreground-muted"
                      aria-label={`Gravidade de ${AREA_PROBLEM_LABELS[type] ?? type}`}
                    >
                      {SEVERITIES.map((s) => (
                        <option key={s} value={s}>
                          {SEVERITY_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
