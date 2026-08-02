import Link from "next/link";
import { ChevronRight, Car } from "lucide-react";
import { MobileTopBar } from "@/components/attendance/mobile/top-bar";
import { fetchRecentVehicles } from "@/lib/attendance/service";

export const dynamic = "force-dynamic";

const RECENT_VEHICLES_LIMIT = 50;

export default async function VeiculosPage() {
  const vehicles = await fetchRecentVehicles(RECENT_VEHICLES_LIMIT);

  return (
    <div>
      <MobileTopBar title="Veículos" showBack />

      <div className="space-y-2.5 px-4 pt-4 pb-4">
        {vehicles.length === 0 ? (
          <p className="py-8 text-center text-sm text-foreground-subtle">Nenhum veículo cadastrado ainda.</p>
        ) : (
          vehicles.map(({ vehicle, customer }) => (
            <Link
              key={vehicle.id}
              href={`/atendimento/veiculos/${vehicle.id}`}
              className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-background-panel p-4 transition-transform active:scale-[0.98]"
            >
              <Car className="h-5 w-5 shrink-0 text-foreground-subtle" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-medium text-foreground">{[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Veículo"}</p>
                <p className="mt-0.5 truncate text-sm text-foreground-subtle">
                  {vehicle.plate ?? "Placa não informada"} · {customer.name ?? "Cliente sem nome cadastrado"}
                </p>
              </div>
              <ChevronRight className="h-5 w-5 shrink-0 text-foreground-subtle" />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
