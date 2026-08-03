import { describeDiagnosticArea } from "@/lib/attendance/diagnosticSummary";
import { DIAGNOSTIC_AREAS, type Diagnostic, type ServiceVisit } from "@/lib/attendance/types";
import type { DiagnosticAreaEvolution } from "@/lib/crm-intelligente/types";

/**
 * "Memória Técnica do Veículo" (Missão 21) — compara os dois diagnósticos mais recentes do
 * veículo, área por área, usando o mesmo texto real já usado no Detalhe da Ordem
 * (`describeDiagnosticArea`). Nunca inventa uma condição "Boa"/"Regular" única por área: o
 * checklist real usa critérios próprios por área (ex.: pintura tem 4 níveis de problema
 * independentes, não uma nota geral) — comparamos a descrição real, não um resumo fabricado.
 */
export function compareDiagnostics(previous: Diagnostic, current: Diagnostic): DiagnosticAreaEvolution[] {
  return DIAGNOSTIC_AREAS.map((area) => {
    const previousText = describeDiagnosticArea(previous, area) ?? "Sem achados registrados";
    const currentText = describeDiagnosticArea(current, area) ?? "Sem achados registrados";
    return { area, previous: previousText, current: currentText, changed: previousText !== currentText };
  });
}

/**
 * Só retorna uma comparação quando o veículo tem ao menos 2 diagnósticos reais (`null` caso
 * contrário) — "comparar somente quando existirem diagnósticos anteriores".
 */
export function buildVehicleDiagnosticEvolution(params: { vehicleId: string; visits: ServiceVisit[]; diagnostics: Diagnostic[] }): DiagnosticAreaEvolution[] | null {
  const visitIds = new Set(params.visits.filter((v) => v.vehicleId === params.vehicleId).map((v) => v.id));
  const vehicleDiagnostics = params.diagnostics.filter((d) => visitIds.has(d.serviceVisitId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (vehicleDiagnostics.length < 2) return null;
  const [current, previous] = vehicleDiagnostics;
  return compareDiagnostics(previous, current);
}
