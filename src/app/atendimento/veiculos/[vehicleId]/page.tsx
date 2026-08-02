import { notFound } from "next/navigation";
import { Camera, Phone } from "lucide-react";
import { MobileTopBar } from "@/components/attendance/mobile/top-bar";
import { TimelineList } from "@/components/attendance/mobile/timeline-list";
import { fetchVehicleTimeline } from "@/lib/attendance/service";

export const dynamic = "force-dynamic";

export default async function VehicleTimelinePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const detail = await fetchVehicleTimeline(vehicleId);
  if (!detail) notFound();

  const { vehicle, customer, entries, totalPhotos } = detail;
  const vehicleLabel = [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Veículo";

  return (
    <div>
      <MobileTopBar title={vehicleLabel} showBack />

      <div className="space-y-4 px-4 pb-8 pt-4">
        <div className="rounded-2xl border border-border-subtle bg-background-panel p-4">
          <p className="text-sm text-foreground-subtle">{vehicle.plate ?? "Placa não informada"}</p>
          <p className="mt-2 text-base font-semibold text-foreground">{customer.name ?? "Cliente sem nome cadastrado"}</p>
          {customer.phone ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-sm text-foreground-subtle">
              <Phone className="h-3.5 w-3.5" />
              {customer.phone}
            </p>
          ) : null}
        </div>

        {totalPhotos > 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-foreground-subtle">
            <Camera className="h-3.5 w-3.5" />
            {totalPhotos} foto{totalPhotos > 1 ? "s" : ""} registrada{totalPhotos > 1 ? "s" : ""} no histórico
          </div>
        ) : null}

        <TimelineList entries={entries} />
      </div>
    </div>
  );
}
