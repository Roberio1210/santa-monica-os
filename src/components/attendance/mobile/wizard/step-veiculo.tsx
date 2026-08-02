"use client";

import { useState } from "react";
import { Car, PlusCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { fieldClasses, labelClasses } from "@/components/attendance/mobile/wizard/field-styles";
import type { CustomerSelection, VehicleSelection } from "@/components/attendance/mobile/wizard/types";

export function StepVeiculo({
  customer,
  mileage,
  onMileageChange,
  onSelect,
}: {
  customer: CustomerSelection;
  mileage: string;
  onMileageChange: (v: string) => void;
  onSelect: (vehicle: VehicleSelection) => void;
}) {
  const existingVehicles = customer.kind === "existing" ? customer.result.vehicles : [];
  const [showNewForm, setShowNewForm] = useState(existingVehicles.length === 0);
  const [plate, setPlate] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");

  const canSubmitNew = plate.trim().length > 0;

  return (
    <div className="space-y-4">
      {existingVehicles.length > 0 && !showNewForm ? (
        <div className="space-y-2.5">
          {existingVehicles.map((vehicle) => (
            <button
              key={vehicle.id}
              type="button"
              onClick={() => onSelect({ kind: "existing", vehicleId: vehicle.id })}
              className="flex w-full items-center gap-3 rounded-2xl border border-border-subtle bg-background-panel p-4 text-left transition-transform active:scale-[0.98]"
            >
              <Car className="h-5 w-5 shrink-0 text-foreground-subtle" />
              <div>
                <p className="text-base font-medium text-foreground">{[vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "Veículo"}</p>
                <p className="text-sm text-foreground-subtle">{vehicle.plate ?? "Placa não informada"}</p>
              </div>
            </button>
          ))}

          <button
            type="button"
            onClick={() => setShowNewForm(true)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-subtle text-sm font-medium text-foreground-muted active:scale-[0.98]"
          >
            <PlusCircle className="h-5 w-5" />
            Cadastrar outro veículo
          </button>
        </div>
      ) : null}

      {showNewForm ? (
        <div className="space-y-3 rounded-2xl border border-border-subtle bg-background-panel p-4">
          <p className="text-sm font-medium text-foreground">Dados do veículo</p>
          <div>
            <label className={labelClasses} htmlFor="wizard-veiculo-placa">
              Placa
            </label>
            <input id="wizard-veiculo-placa" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} className={fieldClasses} placeholder="ABC1D23" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClasses} htmlFor="wizard-veiculo-marca">
                Marca
              </label>
              <input id="wizard-veiculo-marca" value={brand} onChange={(e) => setBrand(e.target.value)} className={fieldClasses} placeholder="Toyota" />
            </div>
            <div>
              <label className={labelClasses} htmlFor="wizard-veiculo-modelo">
                Modelo
              </label>
              <input id="wizard-veiculo-modelo" value={model} onChange={(e) => setModel(e.target.value)} className={fieldClasses} placeholder="Corolla Cross" />
            </div>
            <div>
              <label className={labelClasses} htmlFor="wizard-veiculo-ano">
                Ano
              </label>
              <input id="wizard-veiculo-ano" type="number" value={year} onChange={(e) => setYear(e.target.value)} className={fieldClasses} placeholder="2023" />
            </div>
            <div>
              <label className={labelClasses} htmlFor="wizard-veiculo-cor">
                Cor
              </label>
              <input id="wizard-veiculo-cor" value={color} onChange={(e) => setColor(e.target.value)} className={fieldClasses} placeholder="Branco" />
            </div>
          </div>

          {existingVehicles.length > 0 ? (
            <button type="button" onClick={() => setShowNewForm(false)} className="text-sm text-foreground-subtle underline">
              Usar veículo já cadastrado
            </button>
          ) : null}

          <button
            type="button"
            disabled={!canSubmitNew}
            onClick={() => onSelect({ kind: "new", plate: plate.trim(), brand: brand.trim(), model: model.trim(), year: year.trim(), color: color.trim() })}
            className={cn(
              "flex h-12 w-full items-center justify-center rounded-xl bg-accent text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98]",
              !canSubmitNew && "opacity-50",
            )}
          >
            Continuar
          </button>
        </div>
      ) : null}

      <div>
        <label className={labelClasses} htmlFor="wizard-quilometragem">
          Quilometragem (opcional)
        </label>
        <input
          id="wizard-quilometragem"
          type="number"
          min={0}
          value={mileage}
          onChange={(e) => onMileageChange(e.target.value)}
          className={fieldClasses}
          placeholder="Ex.: 42000"
        />
      </div>
    </div>
  );
}
