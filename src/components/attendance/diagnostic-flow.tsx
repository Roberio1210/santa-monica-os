"use client";

import { useState, useTransition } from "react";
import { Camera } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AreaAssessmentEditor } from "@/components/attendance/area-assessment-editor";
import { formatCurrency } from "@/lib/utils/format";
import { AREA_PROBLEM_CATALOG, RECOMMENDATION_CATEGORIES, recommendationCategoryLabel, type RecommendationCategory } from "@/lib/attendance/catalog";
import {
  EXTERIOR_AREAS,
  EXTERIOR_AREA_LABELS,
  INTERIOR_AREAS,
  INTERIOR_AREA_LABELS,
  PHOTO_STAGES,
  PHOTO_STAGE_LABELS,
  SERVICE_ORDER_STATUS_LABELS,
  emptyExteriorAssessment,
  emptyInteriorAssessment,
  type Diagnostic,
  type ExteriorArea,
  type ExteriorAssessment,
  type InteriorArea,
  type InteriorAssessment,
  type ServiceOrder,
  type TechnicalRecommendation,
} from "@/lib/attendance/types";
import type { ServiceCatalogEntry } from "@/lib/attendance/repository";
import { addRecommendationAction, createServiceOrderAction, saveDiagnosticAction } from "@/app/atendimento/actions";

const fieldClasses = "h-10 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

export function DiagnosticFlow({
  serviceVisitId,
  customerName,
  vehicleLabel,
  initialDiagnostic,
  initialRecommendations,
  initialOrder,
  serviceCatalog,
}: {
  serviceVisitId: string;
  customerName: string;
  vehicleLabel: string;
  initialDiagnostic: Diagnostic | null;
  initialRecommendations: TechnicalRecommendation[];
  initialOrder: ServiceOrder | null;
  serviceCatalog: ServiceCatalogEntry[];
}) {
  const [exterior, setExterior] = useState<ExteriorAssessment>(initialDiagnostic?.exterior ?? emptyExteriorAssessment());
  const [interior, setInterior] = useState<InteriorAssessment>(initialDiagnostic?.interior ?? emptyInteriorAssessment());
  const [observations, setObservations] = useState(initialDiagnostic?.observations ?? "");
  const [diagnosticSaved, setDiagnosticSaved] = useState(!!initialDiagnostic);
  const [savePending, startSaveTransition] = useTransition();
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  function updateExteriorArea(area: ExteriorArea, next: ExteriorAssessment[ExteriorArea]) {
    setExterior((prev) => ({ ...prev, [area]: next }));
  }
  function updateInteriorArea(area: InteriorArea, next: InteriorAssessment[InteriorArea]) {
    setInterior((prev) => ({ ...prev, [area]: next }));
  }

  function handleSaveDiagnostic() {
    startSaveTransition(async () => {
      const result = await saveDiagnosticAction(serviceVisitId, exterior, interior, observations.trim() || null);
      setSaveMessage(result.error ?? result.success);
      if (!result.error) setDiagnosticSaved(true);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {customerName} — {vehicleLabel}
          </CardTitle>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diagnóstico técnico — Exterior</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-2 lg:grid-cols-3">
          {EXTERIOR_AREAS.map((area) => (
            <AreaAssessmentEditor key={area} label={EXTERIOR_AREA_LABELS[area]} value={exterior[area]} onChange={(next) => updateExteriorArea(area, next)} problemCatalog={AREA_PROBLEM_CATALOG[area]} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diagnóstico técnico — Interior</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-2 lg:grid-cols-3">
          {INTERIOR_AREAS.map((area) => (
            <AreaAssessmentEditor key={area} label={INTERIOR_AREA_LABELS[area]} value={interior[area]} onChange={(next) => updateInteriorArea(area, next)} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fotos</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-3">
          {PHOTO_STAGES.map((stage) => (
            <div key={stage} className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-center">
              <Camera className="h-6 w-6 text-foreground-subtle" />
              <p className="text-sm font-medium text-foreground">{PHOTO_STAGE_LABELS[stage]}</p>
              <p className="text-xs text-foreground-subtle">Upload disponível em uma atualização futura</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Observações</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <textarea
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-background-elevated p-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50"
            placeholder="Observações livres sobre o atendimento..."
          />
          <div className="mt-3 flex items-center gap-3">
            <Button type="button" onClick={handleSaveDiagnostic} disabled={savePending}>
              {savePending ? "Salvando..." : "Salvar Diagnóstico"}
            </Button>
            {saveMessage ? <span className="text-sm text-foreground-muted">{saveMessage}</span> : null}
          </div>
        </CardContent>
      </Card>

      <RecommendationsSection serviceVisitId={serviceVisitId} initialRecommendations={initialRecommendations} />

      <ApprovedServicesSection serviceVisitId={serviceVisitId} serviceCatalog={serviceCatalog} initialOrder={initialOrder} diagnosticSaved={diagnosticSaved} />
    </div>
  );
}

function RecommendationsSection({ serviceVisitId, initialRecommendations }: { serviceVisitId: string; initialRecommendations: TechnicalRecommendation[] }) {
  const [recommendations, setRecommendations] = useState(initialRecommendations);
  const [category, setCategory] = useState<RecommendationCategory>(RECOMMENDATION_CATEGORIES[0]);
  const [observations, setObservations] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    startTransition(async () => {
      const result = await addRecommendationAction(serviceVisitId, category, observations.trim() || null);
      if (!result.error) {
        setRecommendations((prev) => [...prev, { id: `${Date.now()}`, serviceVisitId, category, observations: observations.trim() || null, createdAt: new Date().toISOString() }]);
        setObservations("");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recomendações técnicas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-xs text-foreground-subtle">Este módulo não vende — apenas registra a orientação técnica dada ao cliente.</p>

        {recommendations.length > 0 ? (
          <ul className="space-y-2">
            {recommendations.map((r) => (
              <li key={r.id} className="rounded-lg border border-border-subtle p-2 text-sm">
                <Badge variant="info">{recommendationCategoryLabel(r.category)}</Badge>
                {r.observations ? <span className="ml-2 text-foreground-muted">{r.observations}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground-muted">Categoria</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as (typeof RECOMMENDATION_CATEGORIES)[number])} className={fieldClasses}>
              {RECOMMENDATION_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {recommendationCategoryLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-medium text-foreground-muted">Observação (opcional)</label>
            <input value={observations} onChange={(e) => setObservations(e.target.value)} className={fieldClasses} placeholder="Ex.: riscos leves na lateral direita" />
          </div>
          <Button type="button" variant="outline" onClick={handleAdd} disabled={isPending}>
            {isPending ? "Adicionando..." : "Adicionar recomendação"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ApprovedServicesSection({
  serviceVisitId,
  serviceCatalog,
  initialOrder,
  diagnosticSaved,
}: {
  serviceVisitId: string;
  serviceCatalog: ServiceCatalogEntry[];
  initialOrder: ServiceOrder | null;
  diagnosticSaved: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState(initialOrder);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleCreateOrder() {
    setError(null);
    startTransition(async () => {
      const result = await createServiceOrderAction(serviceVisitId, Array.from(selected));
      if (result.error) {
        setError(result.error);
      } else {
        setOrder({
          id: "novo",
          serviceVisitId,
          status: "aguardando_execucao",
          items: serviceCatalog.filter((s) => selected.has(s.id)).map((s) => ({ id: s.id, serviceOrderId: "novo", serviceId: s.id, serviceName: s.name, notes: null })),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
    });
  }

  if (order) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Ordem de Serviço criada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <Badge variant="positive">{SERVICE_ORDER_STATUS_LABELS[order.status]}</Badge>
          <ul className="list-inside list-disc text-sm text-foreground-muted">
            {order.items.map((item) => (
              <li key={item.id}>{item.serviceName}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Serviços aprovados pelo cliente</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {!diagnosticSaved ? <p className="text-xs text-warning">Salve o diagnóstico antes de criar a Ordem de Serviço.</p> : null}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {serviceCatalog.map((service) => (
            <label key={service.id} className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle p-2 text-sm">
              <span className="flex items-center gap-2">
                <input type="checkbox" checked={selected.has(service.id)} onChange={() => toggle(service.id)} />
                {service.name}
              </span>
              <span className="text-foreground-subtle">{service.defaultPrice !== null ? formatCurrency(service.defaultPrice) : "—"}</span>
            </label>
          ))}
        </div>
        {error ? <p className="text-sm text-critical">{error}</p> : null}
        <Button type="button" onClick={handleCreateOrder} disabled={selected.size === 0 || isPending} className="h-12 w-full text-base sm:w-auto sm:px-8">
          {isPending ? "Criando..." : "Criar Ordem de Serviço"}
        </Button>
      </CardContent>
    </Card>
  );
}
