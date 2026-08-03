import { Car } from "lucide-react";
import { formatDateBR } from "@/lib/utils/format";
import { saoPauloDateISO } from "@/lib/utils/timezone";
import type { VehicleMemory } from "@/lib/crm-intelligente/types";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-foreground-subtle">{label}</p>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

/** Identidade do veículo (Missão 21: "VEÍCULOS") — só os campos pedidos, todos reais. */
export function VehicleCard({ memory }: { memory: VehicleMemory }) {
  const { vehicle } = memory;
  return (
    <div className="rounded-xl border border-border-subtle bg-background-elevated p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Car className="h-4 w-4 text-foreground-subtle" />
        {[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Veículo sem marca/modelo cadastrado"}
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        <Field label="Placa" value={vehicle.plate ?? "—"} />
        <Field label="Cor" value={vehicle.color ?? "—"} />
        <Field label="Ano" value={vehicle.year ? String(vehicle.year) : "—"} />
        <Field label="Visitas" value={String(memory.visitCount)} />
        <Field label="Última visita" value={memory.lastVisitAt ? formatDateBR(saoPauloDateISO(new Date(memory.lastVisitAt))) : "—"} />
      </div>
    </div>
  );
}
