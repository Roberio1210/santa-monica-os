"use client";

import { AreaAssessmentEditor } from "@/components/attendance/area-assessment-editor";
import { fieldClasses, labelClasses } from "@/components/attendance/mobile/wizard/field-styles";
import { AREA_PROBLEM_CATALOG } from "@/lib/attendance/catalog";
import { EXTERIOR_AREAS, EXTERIOR_AREA_LABELS, INTERIOR_AREAS, INTERIOR_AREA_LABELS, type ExteriorArea, type ExteriorAssessment, type InteriorArea, type InteriorAssessment } from "@/lib/attendance/types";

export function StepDiagnostico({
  exterior,
  interior,
  observations,
  onExteriorChange,
  onInteriorChange,
  onObservationsChange,
}: {
  exterior: ExteriorAssessment;
  interior: InteriorAssessment;
  observations: string;
  onExteriorChange: (area: ExteriorArea, next: ExteriorAssessment[ExteriorArea]) => void;
  onInteriorChange: (area: InteriorArea, next: InteriorAssessment[InteriorArea]) => void;
  onObservationsChange: (value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Exterior</p>
        <div className="space-y-2.5">
          {EXTERIOR_AREAS.map((area) => (
            <AreaAssessmentEditor key={area} label={EXTERIOR_AREA_LABELS[area]} value={exterior[area]} onChange={(next) => onExteriorChange(area, next)} problemCatalog={AREA_PROBLEM_CATALOG[area]} />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Interior</p>
        <div className="space-y-2.5">
          {INTERIOR_AREAS.map((area) => (
            <AreaAssessmentEditor key={area} label={INTERIOR_AREA_LABELS[area]} value={interior[area]} onChange={(next) => onInteriorChange(area, next)} />
          ))}
        </div>
      </div>

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
          placeholder="Observações livres sobre o atendimento..."
        />
      </div>
    </div>
  );
}
