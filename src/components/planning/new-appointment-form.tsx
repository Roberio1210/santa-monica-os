"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Car, PlusCircle } from "lucide-react";
import { createAppointmentAction } from "@/app/planejamento/actions";
import { StepCliente } from "@/components/attendance/mobile/wizard/step-cliente";
import { fieldClasses, labelClasses } from "@/components/attendance/mobile/wizard/field-styles";
import type { CustomerSelection } from "@/components/attendance/mobile/wizard/types";
import { cn } from "@/lib/utils/cn";
import type { ServiceCatalogEntry } from "@/lib/attendance/repository";

export function NewAppointmentForm({ serviceCatalog }: { serviceCatalog: ServiceCatalogEntry[] }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerSelection | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [showNewVehicle, setShowNewVehicle] = useState(false);
  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");

  const [serviceId, setServiceId] = useState(serviceCatalog[0]?.id ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!customer) {
    return <StepCliente initialCustomer={null} onSelect={setCustomer} />;
  }

  const existingVehicles = customer.kind === "existing" ? customer.result.vehicles : [];
  const customerName = customer.kind === "existing" ? (customer.result.customer.name ?? "Cliente") : customer.name;

  const canSubmit = date.length > 0 && time.length > 0 && serviceId.length > 0 && (selectedVehicleId !== null || plate.trim().length > 0);

  function handleSubmit() {
    if (!canSubmit || !customer) return;
    setError(null);

    const selectedExistingVehicle = existingVehicles.find((v) => v.id === selectedVehicleId);
    const scheduledAt = `${date}T${time}:00-03:00`;

    startTransition(async () => {
      const result = await createAppointmentAction(
        {
          customerName,
          customerPhone: customer.kind === "existing" ? (customer.result.customer.phone ?? "") : customer.phone,
          customerCpf: customer.kind === "new" ? customer.cpf || null : null,
          vehiclePlate: (selectedExistingVehicle?.plate ?? plate).toUpperCase(),
          vehicleBrand: selectedExistingVehicle?.brand ?? (brand || null),
          vehicleModel: selectedExistingVehicle?.model ?? (model || null),
          vehicleYear: selectedExistingVehicle?.year ?? (year ? Number(year) : null),
          vehicleColor: selectedExistingVehicle?.color ?? (color || null),
        },
        { serviceId, scheduledAt, expectedDurationMinutes: duration ? Number(duration) : null, notes: notes.trim() || null },
      );
      if (result.error) {
        setError(result.error);
        return;
      }
      router.push("/planejamento");
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border-subtle bg-background-panel p-4">
        <p className="text-xs text-foreground-subtle">Cliente</p>
        <p className="text-base font-semibold text-foreground">{customerName}</p>
        <button type="button" onClick={() => setCustomer(null)} className="mt-1 text-xs text-accent underline">
          Trocar cliente
        </button>
      </div>

      <div className="space-y-2.5">
        <p className="text-sm font-medium text-foreground">Veículo</p>
        {existingVehicles.length > 0 && !showNewVehicle ? (
          <div className="space-y-2">
            {existingVehicles.map((vehicle) => (
              <button
                key={vehicle.id}
                type="button"
                onClick={() => setSelectedVehicleId(vehicle.id)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left",
                  selectedVehicleId === vehicle.id ? "border-accent bg-background-elevated" : "border-border-subtle bg-background-panel",
                )}
              >
                <Car className="h-5 w-5 shrink-0 text-foreground-subtle" />
                <div>
                  <p className="text-sm font-medium text-foreground">{[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Veículo"}</p>
                  <p className="text-xs text-foreground-subtle">{vehicle.plate ?? "Placa não informada"}</p>
                </div>
              </button>
            ))}
            <button type="button" onClick={() => { setShowNewVehicle(true); setSelectedVehicleId(null); }} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-subtle text-xs font-medium text-foreground-muted">
              <PlusCircle className="h-4 w-4" />
              Cadastrar outro veículo
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 rounded-xl border border-border-subtle bg-background-panel p-3">
            <div className="col-span-2">
              <label className={labelClasses} htmlFor="na-placa">
                Placa
              </label>
              <input id="na-placa" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} className={fieldClasses} placeholder="ABC1D23" />
            </div>
            <div>
              <label className={labelClasses} htmlFor="na-marca">
                Marca
              </label>
              <input id="na-marca" value={brand} onChange={(e) => setBrand(e.target.value)} className={fieldClasses} placeholder="Toyota" />
            </div>
            <div>
              <label className={labelClasses} htmlFor="na-modelo">
                Modelo
              </label>
              <input id="na-modelo" value={model} onChange={(e) => setModel(e.target.value)} className={fieldClasses} placeholder="Corolla Cross" />
            </div>
            <div>
              <label className={labelClasses} htmlFor="na-ano">
                Ano
              </label>
              <input id="na-ano" type="number" value={year} onChange={(e) => setYear(e.target.value)} className={fieldClasses} placeholder="2023" />
            </div>
            <div>
              <label className={labelClasses} htmlFor="na-cor">
                Cor
              </label>
              <input id="na-cor" value={color} onChange={(e) => setColor(e.target.value)} className={fieldClasses} placeholder="Branco" />
            </div>
            {existingVehicles.length > 0 ? (
              <button type="button" onClick={() => setShowNewVehicle(false)} className="col-span-2 text-xs text-foreground-subtle underline">
                Usar veículo já cadastrado
              </button>
            ) : null}
          </div>
        )}
      </div>

      <div className="space-y-2.5 rounded-xl border border-border-subtle bg-background-panel p-3">
        <p className="text-sm font-medium text-foreground">Agendamento</p>
        <div>
          <label className={labelClasses} htmlFor="na-servico">
            Serviço esperado
          </label>
          <select id="na-servico" value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={fieldClasses}>
            {serviceCatalog.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={labelClasses} htmlFor="na-data">
              Data
            </label>
            <input id="na-data" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClasses} />
          </div>
          <div>
            <label className={labelClasses} htmlFor="na-hora">
              Horário
            </label>
            <input id="na-hora" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={fieldClasses} />
          </div>
        </div>
        <div>
          <label className={labelClasses} htmlFor="na-duracao">
            Tempo previsto em minutos (opcional)
          </label>
          <input id="na-duracao" type="number" min={1} value={duration} onChange={(e) => setDuration(e.target.value)} className={fieldClasses} placeholder="Ex.: 90" />
        </div>
        <div>
          <label className={labelClasses} htmlFor="na-obs">
            Observações
          </label>
          <textarea id="na-obs" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${fieldClasses} h-auto py-2`} placeholder="Ex.: cliente prefere ser avisado por telefone" />
        </div>
      </div>

      {error ? <p className="text-sm text-critical">{error}</p> : null}

      <button
        type="button"
        disabled={!canSubmit || isPending}
        onClick={handleSubmit}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-accent text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        {isPending ? "Salvando..." : "Agendar"}
      </button>
    </div>
  );
}
