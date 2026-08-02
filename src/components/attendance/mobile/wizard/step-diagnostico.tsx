"use client";

import { SegmentedPicker } from "@/components/attendance/mobile/wizard/segmented-picker";
import { ChecklistPicker } from "@/components/attendance/mobile/wizard/checklist-picker";
import { fieldClasses, labelClasses } from "@/components/attendance/mobile/wizard/field-styles";
import {
  CONDITIONS,
  CONDITION_LABELS,
  ENGINE_CONDITIONS,
  ENGINE_CONDITION_LABELS,
  ISSUE_LEVELS,
  type EngineAssessment,
  type GlassAssessment,
  type IssueLevel,
  type PaintAssessment,
  type TechnicalDiagnosticInput,
  type TiresAssessment,
  type WheelsAssessment,
} from "@/lib/attendance/types";

const ISSUE_LEVEL_LABELS_FEMININE: Record<IssueLevel, string> = { nenhuma: "Nenhuma", leve: "Leve", media: "Média", alta: "Alta" };
const ISSUE_LEVEL_LABELS_MASCULINE: Record<IssueLevel, string> = { nenhuma: "Nenhum", leve: "Leve", media: "Médio", alta: "Alto" };

/**
 * Diagnóstico Técnico Inteligente (Missão 19) — sempre de fora para dentro: Pintura, Rodas,
 * Pneus, Vidros, Motor, Interior (ordem obrigatória do negócio, nunca reordenada).
 */
export function StepDiagnostico({
  diagnostic,
  observations,
  onChange,
  onObservationsChange,
}: {
  diagnostic: TechnicalDiagnosticInput;
  observations: string;
  onChange: (next: TechnicalDiagnosticInput) => void;
  onObservationsChange: (value: string) => void;
}) {
  function setPintura(next: Partial<PaintAssessment>) {
    onChange({ ...diagnostic, pintura: { ...diagnostic.pintura, ...next } });
  }
  function toggleRodas(key: keyof WheelsAssessment) {
    onChange({ ...diagnostic, rodas: { ...diagnostic.rodas, [key]: !diagnostic.rodas[key] } });
  }
  function setPneus(next: Partial<TiresAssessment>) {
    onChange({ ...diagnostic, pneus: { ...diagnostic.pneus, ...next } });
  }
  function toggleVidros(key: keyof GlassAssessment) {
    onChange({ ...diagnostic, vidros: { ...diagnostic.vidros, [key]: !diagnostic.vidros[key] } });
  }
  function setMotor(next: Partial<EngineAssessment>) {
    onChange({ ...diagnostic, motor: { ...diagnostic.motor, ...next } });
  }
  function toggleInterior(key: keyof TechnicalDiagnosticInput["interior"]) {
    onChange({ ...diagnostic, interior: { ...diagnostic.interior, [key]: !diagnostic.interior[key] } });
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-lg border border-border-subtle p-3">
        <p className="text-sm font-medium text-foreground">1. Pintura</p>
        <SegmentedPicker label="Chuva ácida" options={ISSUE_LEVELS} labels={ISSUE_LEVEL_LABELS_FEMININE} value={diagnostic.pintura.chuvaAcida} onChange={(v) => setPintura({ chuvaAcida: v })} />
        <SegmentedPicker label="Riscos" options={ISSUE_LEVELS} labels={ISSUE_LEVEL_LABELS_MASCULINE} value={diagnostic.pintura.riscos} onChange={(v) => setPintura({ riscos: v })} />
        <SegmentedPicker label="Hologramas" options={ISSUE_LEVELS} labels={ISSUE_LEVEL_LABELS_MASCULINE} value={diagnostic.pintura.hologramas} onChange={(v) => setPintura({ hologramas: v })} />
        <SegmentedPicker label="Manchas" options={ISSUE_LEVELS} labels={ISSUE_LEVEL_LABELS_FEMININE} value={diagnostic.pintura.manchas} onChange={(v) => setPintura({ manchas: v })} />
      </section>

      <section className="space-y-2 rounded-lg border border-border-subtle p-3">
        <p className="text-sm font-medium text-foreground">2. Rodas</p>
        <ChecklistPicker
          items={[
            { key: "sujeiraPesada", label: "Sujeira pesada" },
            { key: "contaminacao", label: "Contaminação" },
            { key: "oxidacao", label: "Oxidação" },
            { key: "freioImpregnado", label: "Freio impregnado" },
          ]}
          value={diagnostic.rodas}
          onToggle={toggleRodas}
        />
      </section>

      <section className="space-y-2 rounded-lg border border-border-subtle p-3">
        <p className="text-sm font-medium text-foreground">3. Pneus</p>
        <div className="flex flex-wrap gap-1.5">
          {CONDITIONS.map((condition) => (
            <button
              key={condition}
              type="button"
              onClick={() => setPneus({ condition })}
              className={
                diagnostic.pneus.condition === condition
                  ? "rounded-full border border-accent bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
                  : "rounded-full border border-border bg-background-elevated px-3 py-1 text-xs font-medium text-foreground-muted hover:bg-background-panel"
              }
            >
              {CONDITION_LABELS[condition]}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-border-subtle p-3">
        <p className="text-sm font-medium text-foreground">4. Vidros</p>
        <ChecklistPicker
          items={[
            { key: "contaminacao", label: "Contaminação" },
            { key: "marcasDagua", label: "Marcas d'água" },
            { key: "cristalizacaoExistente", label: "Cristalização existente" },
          ]}
          value={diagnostic.vidros}
          onToggle={toggleVidros}
        />
      </section>

      <section className="space-y-2 rounded-lg border border-border-subtle p-3">
        <p className="text-sm font-medium text-foreground">5. Motor</p>
        <div className="flex flex-wrap gap-1.5">
          {ENGINE_CONDITIONS.map((condition) => (
            <button
              key={condition}
              type="button"
              onClick={() => setMotor({ condition })}
              className={
                diagnostic.motor.condition === condition
                  ? "rounded-full border border-accent bg-accent px-3 py-1 text-xs font-medium text-accent-foreground"
                  : "rounded-full border border-border bg-background-elevated px-3 py-1 text-xs font-medium text-foreground-muted hover:bg-background-panel"
              }
            >
              {ENGINE_CONDITION_LABELS[condition]}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-border-subtle p-3">
        <p className="text-sm font-medium text-foreground">6. Interior</p>
        <ChecklistPicker
          items={[
            { key: "plasticos", label: "Plásticos" },
            { key: "couro", label: "Couro" },
            { key: "tecidos", label: "Tecidos" },
            { key: "tapetes", label: "Tapetes" },
            { key: "teto", label: "Teto" },
            { key: "portaMalas", label: "Porta-malas" },
            { key: "vidrosInternos", label: "Vidros internos" },
            { key: "odor", label: "Odor" },
            { key: "pelosAnimais", label: "Pelos de animais" },
            { key: "areia", label: "Areia" },
          ]}
          value={diagnostic.interior}
          onToggle={toggleInterior}
        />
      </section>

      <div>
        <label className={labelClasses} htmlFor="wizard-diagnostico-observacoes">
          Observações
        </label>
        <textarea
          id="wizard-diagnostico-observacoes"
          value={observations}
          onChange={(e) => onObservationsChange(e.target.value)}
          rows={3}
          className={`${fieldClasses} h-auto py-2`}
          placeholder="Observações livres sobre o atendimento (ex.: motor)..."
        />
      </div>
    </div>
  );
}
