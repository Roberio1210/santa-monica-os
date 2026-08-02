import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Phone, Camera } from "lucide-react";
import { MobileTopBar } from "@/components/attendance/mobile/top-bar";
import { StatusAdvanceButton } from "@/components/attendance/mobile/status-advance-button";
import { OrderTimers } from "@/components/attendance/mobile/order-timers";
import { AREA_PROBLEM_LABELS, recommendationCategoryLabel } from "@/lib/attendance/catalog";
import { fetchOrderDetail } from "@/lib/attendance/service";
import {
  CONDITION_LABELS,
  EXTERIOR_AREAS,
  EXTERIOR_AREA_LABELS,
  INTERIOR_AREAS,
  INTERIOR_AREA_LABELS,
  PHOTO_STAGES,
  PHOTO_STAGE_LABELS,
  SEVERITY_LABELS,
} from "@/lib/attendance/types";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const detail = await fetchOrderDetail(orderId);
  if (!detail) notFound();

  const { order, visit, customer, vehicle, diagnostic, recommendations } = detail;
  const vehicleLabel = [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Veículo";

  const assessedExterior = EXTERIOR_AREAS.filter((area) => diagnostic?.exterior[area]?.condition);
  const assessedInterior = INTERIOR_AREAS.filter((area) => diagnostic?.interior[area]?.condition);

  return (
    <div>
      <MobileTopBar title={vehicleLabel} showBack />

      <div className="space-y-4 px-4 pb-8 pt-4">
        <StatusAdvanceButton serviceOrderId={order.id} currentStatus={order.status} />

        <OrderTimers status={order.status} visitCreatedAt={visit.createdAt} updatedAt={order.updatedAt} />

        <div className="rounded-2xl border border-border-subtle bg-background-panel p-4">
          <p className="text-base font-semibold text-foreground">{customer.name ?? "Cliente sem nome cadastrado"}</p>
          {customer.phone ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground-subtle">
              <Phone className="h-3.5 w-3.5" />
              {customer.phone}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-foreground-subtle">
            {vehicleLabel} · {vehicle.plate ?? "Placa não informada"}
          </p>
          <Link href={`/atendimento/veiculos/${vehicle.id}`} className="mt-2 flex h-9 items-center gap-1 text-sm font-medium text-accent active:opacity-70">
            Ver histórico do veículo
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {order.items.length > 0 ? (
          <div className="rounded-2xl border border-border-subtle bg-background-panel p-4">
            <p className="text-xs text-foreground-subtle">Serviços aprovados</p>
            <ul className="mt-2 space-y-1">
              {order.items.map((item) => (
                <li key={item.id} className="text-sm text-foreground">
                  {item.serviceName}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {assessedExterior.length > 0 || assessedInterior.length > 0 ? (
          <div className="rounded-2xl border border-border-subtle bg-background-panel p-4">
            <p className="text-xs text-foreground-subtle">Diagnóstico</p>
            <div className="mt-2 space-y-1.5">
              {assessedExterior.map((area) => (
                <DiagnosticLine key={area} label={EXTERIOR_AREA_LABELS[area]} assessment={diagnostic!.exterior[area]} />
              ))}
              {assessedInterior.map((area) => (
                <DiagnosticLine key={area} label={INTERIOR_AREA_LABELS[area]} assessment={diagnostic!.interior[area]} />
              ))}
            </div>
          </div>
        ) : null}

        {diagnostic?.observations ? (
          <div className="rounded-2xl border border-border-subtle bg-background-panel p-4">
            <p className="text-xs text-foreground-subtle">Observações</p>
            <p className="mt-1 text-sm text-foreground">{diagnostic.observations}</p>
          </div>
        ) : null}

        {recommendations.length > 0 ? (
          <div className="rounded-2xl border border-border-subtle bg-background-panel p-4">
            <p className="text-xs text-foreground-subtle">Recomendações técnicas</p>
            <ul className="mt-2 space-y-1">
              {recommendations.map((r) => (
                <li key={r.id} className="text-sm text-foreground">
                  {recommendationCategoryLabel(r.category)}
                  {r.observations ? <span className="text-foreground-subtle"> — {r.observations}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {diagnostic && diagnostic.photos.length > 0 ? (
          <div className="rounded-2xl border border-border-subtle bg-background-panel p-4">
            <p className="text-xs text-foreground-subtle">Fotos</p>
            <div className="mt-2 space-y-1.5">
              {PHOTO_STAGES.filter((stage) => diagnostic.photos.some((p) => p.stage === stage)).map((stage) => (
                <div key={stage} className="flex items-center gap-2 text-sm text-foreground">
                  <Camera className="h-4 w-4 text-foreground-subtle" />
                  {PHOTO_STAGE_LABELS[stage]} · {diagnostic.photos.filter((p) => p.stage === stage).length} foto(s)
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DiagnosticLine({ label, assessment }: { label: string; assessment: { condition: string | null; problems: { type: string; severity: string }[] } }) {
  if (!assessment.condition) return null;
  const problemsText =
    assessment.problems.length > 0
      ? ` — ${assessment.problems.map((p) => `${AREA_PROBLEM_LABELS[p.type] ?? p.type} (${SEVERITY_LABELS[p.severity as keyof typeof SEVERITY_LABELS] ?? p.severity})`).join(", ")}`
      : "";
  return (
    <p className="text-sm text-foreground">
      <span className="text-foreground-subtle">{label}:</span> {CONDITION_LABELS[assessment.condition as keyof typeof CONDITION_LABELS] ?? assessment.condition}
      {problemsText}
    </p>
  );
}
