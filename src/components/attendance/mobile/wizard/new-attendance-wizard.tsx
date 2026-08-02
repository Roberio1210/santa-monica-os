"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { advanceServiceOrderStatusAction, registerVehicleAndStartVisitAction, saveWizardDiagnosticAction, startVisitAction } from "@/app/atendimento/actions";
import { StepCliente } from "@/components/attendance/mobile/wizard/step-cliente";
import { StepVeiculo } from "@/components/attendance/mobile/wizard/step-veiculo";
import { StepDiagnostico } from "@/components/attendance/mobile/wizard/step-diagnostico";
import { StepFotos } from "@/components/attendance/mobile/wizard/step-fotos";
import { StepRecomendacoes } from "@/components/attendance/mobile/wizard/step-recomendacoes";
import { StepServicos } from "@/components/attendance/mobile/wizard/step-servicos";
import { StepConfirmar } from "@/components/attendance/mobile/wizard/step-confirmar";
import { WIZARD_STEPS, WIZARD_STEP_LABELS, type WizardData, type WizardStep } from "@/components/attendance/mobile/wizard/types";
import type { ServiceCatalogEntry } from "@/lib/attendance/repository";
import { emptyTechnicalDiagnostic } from "@/lib/attendance/types";
import { shouldSuggestPackageUpgrade } from "@/lib/attendance/diagnosticRecommendations";
import type { SearchResult } from "@/lib/attendance/service";

const INITIAL_DATA: WizardData = {
  customer: null,
  vehicle: null,
  mileage: "",
  visitId: null,
  orderId: null,
  customerName: "",
  vehicleLabel: "",
  diagnosticId: null,
  diagnostic: emptyTechnicalDiagnostic(),
  observations: "",
  photos: [],
  recommendations: [],
  selectedServiceIds: new Set(),
};

function vehicleLabelFrom(brand: string | null, model: string | null, plate: string | null): string {
  return [brand, model, plate].filter(Boolean).join(" ") || "Veículo";
}

export function NewAttendanceWizard({ initialCustomer, serviceCatalog }: { initialCustomer: SearchResult | null; serviceCatalog: ServiceCatalogEntry[] }) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [data, setData] = useState<WizardData>(INITIAL_DATA);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const step: WizardStep = WIZARD_STEPS[stepIndex];

  function goBack() {
    setError(null);
    if (stepIndex > 0) {
      setStepIndex((i) => i - 1);
    } else {
      router.back();
    }
  }

  function handleVeiculoSelect(vehicle: WizardData["vehicle"]) {
    const customer = data.customer;
    if (!customer || !vehicle) return;
    setError(null);
    startTransition(async () => {
      const mileageAtVisit = data.mileage.trim() ? Number(data.mileage.trim()) : null;

      if (vehicle.kind === "existing" && customer.kind === "existing") {
        const existingVehicle = customer.result.vehicles.find((v) => v.id === vehicle.vehicleId);
        try {
          const { visitId, orderId } = await startVisitAction(customer.result.customer.id, vehicle.vehicleId, mileageAtVisit);
          setData((prev) => ({
            ...prev,
            vehicle,
            visitId,
            orderId,
            customerName: customer.result.customer.name ?? "Cliente",
            vehicleLabel: existingVehicle ? vehicleLabelFrom(existingVehicle.brand, existingVehicle.model, existingVehicle.plate) : "Veículo",
          }));
          setStepIndex((i) => i + 1);
        } catch {
          setError("Não foi possível iniciar o atendimento. Tente novamente.");
        }
        return;
      }

      if (vehicle.kind !== "new") return;

      const customerName = customer.kind === "existing" ? (customer.result.customer.name ?? "Cliente") : customer.name;
      const customerPhone = customer.kind === "existing" ? (customer.result.customer.phone ?? "") : customer.phone;
      const customerCpf = customer.kind === "new" ? customer.cpf || null : null;

      try {
        const { visitId, orderId } = await registerVehicleAndStartVisitAction(
          {
            customerName,
            customerPhone,
            customerCpf,
            vehiclePlate: vehicle.plate.toUpperCase(),
            vehicleBrand: vehicle.brand || null,
            vehicleModel: vehicle.model || null,
            vehicleYear: vehicle.year ? Number(vehicle.year) : null,
            vehicleColor: vehicle.color || null,
          },
          mileageAtVisit,
        );
        setData((prev) => ({
          ...prev,
          vehicle,
          visitId,
          orderId,
          customerName,
          vehicleLabel: vehicleLabelFrom(vehicle.brand || null, vehicle.model || null, vehicle.plate),
        }));
        setStepIndex((i) => i + 1);
      } catch {
        setError("Não foi possível cadastrar e iniciar o atendimento. Verifique os dados e tente novamente.");
      }
    });
  }

  function handleDiagnosticoAdvance() {
    const visitId = data.visitId;
    const orderId = data.orderId;
    if (!visitId || !orderId) return;
    setError(null);
    startTransition(async () => {
      const { pintura, rodas, pneus, vidros, motor, interior } = data.diagnostic;
      const result = await saveWizardDiagnosticAction(visitId, pintura, rodas, pneus, vidros, motor, interior, data.observations.trim() || null);
      if (result.error || !result.diagnosticId) {
        setError(result.error ?? "Não foi possível salvar o diagnóstico.");
        return;
      }
      await advanceServiceOrderStatusAction(orderId, "recebido");
      setData((prev) => ({ ...prev, diagnosticId: result.diagnosticId }));
      setStepIndex((i) => i + 1);
    });
  }

  return (
    <div>
      <header className="sticky top-0 z-30 border-b border-border-subtle bg-background/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-14 items-center gap-1">
          <button type="button" onClick={goBack} aria-label="Voltar" className="-ml-2 flex h-11 w-11 items-center justify-center text-foreground-muted active:text-foreground">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-base font-semibold text-foreground">{WIZARD_STEP_LABELS[step]}</h1>
            <p className="text-xs text-foreground-subtle">
              Etapa {stepIndex + 1} de {WIZARD_STEPS.length}
            </p>
          </div>
        </div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-background-elevated">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
            style={{ width: `${((stepIndex + 1) / WIZARD_STEPS.length) * 100}%` }}
          />
        </div>
      </header>

      <div className="space-y-4 px-4 pb-24 pt-4">
        {error ? <p className="text-sm text-critical">{error}</p> : null}
        {isPending && (step === "veiculo" || step === "diagnostico") ? <p className="text-sm text-foreground-subtle">Salvando...</p> : null}

        {step === "cliente" ? (
          <StepCliente
            initialCustomer={initialCustomer}
            onSelect={(selection) => {
              setData((prev) => ({ ...prev, customer: selection }));
              setStepIndex((i) => i + 1);
            }}
          />
        ) : null}

        {step === "veiculo" && data.customer ? (
          <StepVeiculo
            customer={data.customer}
            mileage={data.mileage}
            onMileageChange={(mileage) => setData((prev) => ({ ...prev, mileage }))}
            onSelect={handleVeiculoSelect}
          />
        ) : null}

        {step === "diagnostico" ? (
          <StepDiagnostico
            diagnostic={data.diagnostic}
            observations={data.observations}
            onChange={(diagnostic) => setData((prev) => ({ ...prev, diagnostic }))}
            onObservationsChange={(observations) => setData((prev) => ({ ...prev, observations }))}
          />
        ) : null}

        {step === "fotos" && data.diagnosticId ? (
          <StepFotos diagnosticId={data.diagnosticId} photos={data.photos} onPhotoAdded={(photo) => setData((prev) => ({ ...prev, photos: [...prev.photos, photo] }))} />
        ) : null}

        {step === "recomendacoes" && data.visitId ? (
          <StepRecomendacoes
            visitId={data.visitId}
            diagnostic={data.diagnostic}
            recommendations={data.recommendations}
            onAdded={(recommendation) => setData((prev) => ({ ...prev, recommendations: [...prev.recommendations, recommendation] }))}
          />
        ) : null}

        {step === "servicos" ? (
          <StepServicos
            serviceCatalog={serviceCatalog}
            selectedServiceIds={data.selectedServiceIds}
            showUpgradeHint={shouldSuggestPackageUpgrade(data.diagnostic)}
            onToggle={(serviceId) =>
              setData((prev) => {
                const next = new Set(prev.selectedServiceIds);
                if (next.has(serviceId)) next.delete(serviceId);
                else next.add(serviceId);
                return { ...prev, selectedServiceIds: next };
              })
            }
          />
        ) : null}

        {step === "confirmar" && data.visitId ? (
          <StepConfirmar
            visitId={data.visitId}
            customerName={data.customerName}
            vehicleLabel={data.vehicleLabel}
            serviceCatalog={serviceCatalog}
            selectedServiceIds={data.selectedServiceIds}
            photos={data.photos}
            recommendations={data.recommendations}
          />
        ) : null}
      </div>

      {step === "diagnostico" || step === "fotos" || step === "recomendacoes" || step === "servicos" ? (
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md border-t border-border-subtle bg-background/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 backdrop-blur">
          <button
            type="button"
            disabled={isPending || (step === "servicos" && data.selectedServiceIds.size === 0)}
            onClick={() => (step === "diagnostico" ? handleDiagnosticoAdvance() : setStepIndex((i) => i + 1))}
            className="flex h-12 w-full items-center justify-center rounded-xl bg-accent text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
          >
            {isPending ? "Salvando..." : "Avançar"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
