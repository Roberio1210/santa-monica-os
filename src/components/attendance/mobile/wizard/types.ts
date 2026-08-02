import type { DiagnosticPhoto, TechnicalDiagnosticInput, TechnicalRecommendation } from "@/lib/attendance/types";
import type { SearchResult } from "@/lib/attendance/service";

export const WIZARD_STEPS = ["cliente", "veiculo", "diagnostico", "fotos", "recomendacoes", "servicos", "confirmar"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  cliente: "Cliente",
  veiculo: "Veículo",
  diagnostico: "Diagnóstico",
  fotos: "Fotos",
  recomendacoes: "Recomendações",
  servicos: "Serviços",
  confirmar: "Confirmar",
};

export type CustomerSelection = { kind: "existing"; result: SearchResult } | { kind: "new"; name: string; phone: string; cpf: string };

export type VehicleSelection = { kind: "existing"; vehicleId: string } | { kind: "new"; plate: string; brand: string; model: string; year: string; color: string };

/**
 * Estado único do wizard, vivo enquanto o gerente navega pelas 7 etapas. Cada etapa grava no
 * backend só quando o gerente avança dela (`visitId`/`diagnosticId` só existem depois da escrita
 * real correspondente) — uma etapa interrompida nunca perde o que já foi confirmado antes dela.
 */
export interface WizardData {
  customer: CustomerSelection | null;
  vehicle: VehicleSelection | null;
  mileage: string;
  visitId: string | null;
  orderId: string | null;
  customerName: string;
  vehicleLabel: string;
  diagnosticId: string | null;
  diagnostic: TechnicalDiagnosticInput;
  observations: string;
  photos: DiagnosticPhoto[];
  recommendations: TechnicalRecommendation[];
  selectedServiceIds: Set<string>;
}
