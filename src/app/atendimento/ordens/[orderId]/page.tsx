import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Phone, Camera } from "lucide-react";
import { MobileTopBar } from "@/components/attendance/mobile/top-bar";
import { StatusAdvanceButton } from "@/components/attendance/mobile/status-advance-button";
import { OrderTimers } from "@/components/attendance/mobile/order-timers";
import { DiscountForm } from "@/components/attendance/mobile/discount-form";
import { recommendationCategoryLabel } from "@/lib/attendance/catalog";
import { fetchOrderDetail } from "@/lib/attendance/service";
import { CONDITION_LABELS, DIAGNOSTIC_AREAS, DIAGNOSTIC_AREA_LABELS, ENGINE_CONDITION_LABELS, type Diagnostic } from "@/lib/attendance/types";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const detail = await fetchOrderDetail(orderId);
  if (!detail) notFound();

  const { order, visit, customer, vehicle, diagnostic, recommendations, totalValue } = detail;
  const vehicleLabel = [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Veículo";

  const diagnosticLines = diagnostic ? DIAGNOSTIC_AREAS.map((area) => ({ area, text: describeDiagnosticArea(diagnostic, area) })).filter((l) => l.text !== null) : [];

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

        {totalValue > 0 ? <DiscountForm serviceOrderId={order.id} originalValue={totalValue} /> : null}

        {diagnosticLines.length > 0 ? (
          <div className="rounded-2xl border border-border-subtle bg-background-panel p-4">
            <p className="text-xs text-foreground-subtle">Diagnóstico</p>
            <div className="mt-2 space-y-1.5">
              {diagnosticLines.map((line) => (
                <p key={line.area} className="text-sm text-foreground">
                  <span className="text-foreground-subtle">{DIAGNOSTIC_AREA_LABELS[line.area]}:</span> {line.text}
                </p>
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
              {DIAGNOSTIC_AREAS.filter((area) => diagnostic.photos.some((p) => p.area === area)).map((area) => (
                <div key={area} className="flex items-center gap-2 text-sm text-foreground">
                  <Camera className="h-4 w-4 text-foreground-subtle" />
                  {DIAGNOSTIC_AREA_LABELS[area]} · {diagnostic.photos.filter((p) => p.area === area).length} foto(s)
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const ISSUE_LEVEL_TEXT: Record<string, string> = { leve: "leve", media: "média", alta: "alta" };

/** `null` quando a área não tem nada a mostrar (nunca renderiza uma linha vazia). */
function describeDiagnosticArea(diagnostic: Diagnostic, area: (typeof DIAGNOSTIC_AREAS)[number]): string | null {
  switch (area) {
    case "pintura": {
      const { chuvaAcida, riscos, hologramas, manchas } = diagnostic.pintura;
      const parts: string[] = [];
      if (chuvaAcida !== "nenhuma") parts.push(`Chuva ácida (${ISSUE_LEVEL_TEXT[chuvaAcida]})`);
      if (riscos !== "nenhuma") parts.push(`Riscos (${ISSUE_LEVEL_TEXT[riscos]})`);
      if (hologramas !== "nenhuma") parts.push(`Hologramas (${ISSUE_LEVEL_TEXT[hologramas]})`);
      if (manchas !== "nenhuma") parts.push(`Manchas (${ISSUE_LEVEL_TEXT[manchas]})`);
      return parts.length > 0 ? parts.join(", ") : null;
    }
    case "rodas": {
      const { sujeiraPesada, contaminacao, oxidacao, freioImpregnado } = diagnostic.rodas;
      const parts: string[] = [];
      if (sujeiraPesada) parts.push("Sujeira pesada");
      if (contaminacao) parts.push("Contaminação");
      if (oxidacao) parts.push("Oxidação");
      if (freioImpregnado) parts.push("Freio impregnado");
      return parts.length > 0 ? parts.join(", ") : null;
    }
    case "pneus":
      return diagnostic.pneus.condition ? CONDITION_LABELS[diagnostic.pneus.condition] : null;
    case "vidros": {
      const { contaminacao, marcasDagua, cristalizacaoExistente } = diagnostic.vidros;
      const parts: string[] = [];
      if (contaminacao) parts.push("Contaminação");
      if (marcasDagua) parts.push("Marcas d'água");
      if (cristalizacaoExistente) parts.push("Cristalização existente");
      return parts.length > 0 ? parts.join(", ") : null;
    }
    case "motor":
      return diagnostic.motor.condition ? ENGINE_CONDITION_LABELS[diagnostic.motor.condition] : null;
    case "interior": {
      const labels: Record<string, string> = {
        plasticos: "Plásticos",
        couro: "Couro",
        tecidos: "Tecidos",
        tapetes: "Tapetes",
        teto: "Teto",
        portaMalas: "Porta-malas",
        vidrosInternos: "Vidros internos",
        odor: "Odor",
        pelosAnimais: "Pelos de animais",
        areia: "Areia",
      };
      const parts = Object.entries(diagnostic.interior)
        .filter(([, marked]) => marked)
        .map(([key]) => labels[key]);
      return parts.length > 0 ? parts.join(", ") : null;
    }
  }
}
