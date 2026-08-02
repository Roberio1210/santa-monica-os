"use server";

import { revalidatePath } from "next/cache";
import {
  addDiagnosticPhoto,
  addTechnicalRecommendation,
  advanceServiceOrderStatus,
  createServiceOrderFromApprovedServices,
  fetchCustomerSearchResult,
  registerQuickCustomerAndVehicle,
  saveDiagnosticStep,
  searchByPhoneOrPlate,
  searchCustomersByText,
  startAttendance,
  startServiceOrder,
  type QuickRegisterInput,
  type SearchResult,
} from "@/lib/attendance/service";
import type { DiagnosticPhoto, ExteriorAssessment, InteriorAssessment, PhotoStage, ServiceOrderStatus } from "@/lib/attendance/types";

export async function searchAttendanceAction(query: string): Promise<SearchResult | null> {
  return searchByPhoneOrPlate(query);
}

/** Busca livre por nome/veículo — só entra em ação quando a query não parece telefone nem placa. */
export async function searchAttendanceByTextAction(query: string): Promise<SearchResult[]> {
  return searchCustomersByText(query);
}

export async function fetchCustomerByIdAction(customerId: string): Promise<SearchResult | null> {
  return fetchCustomerSearchResult(customerId);
}

/** Inicia o atendimento (visita + Ordem de Serviço em `recebido`) para um cliente/veículo já cadastrados — usado na Etapa 2 do wizard quando o gerente seleciona um veículo existente. */
export async function startVisitAction(customerId: string, vehicleId: string, mileageAtVisit: number | null): Promise<{ visitId: string; orderId: string }> {
  const visit = await startAttendance(customerId, vehicleId, mileageAtVisit);
  const order = await startServiceOrder(visit.id);
  return { visitId: visit.id, orderId: order.id };
}

/** Cadastra cliente/veículo (reaproveitando por telefone/placa quando já existem) e já inicia o atendimento (visita + ordem em `recebido`) — usado na Etapa 2 do wizard para cliente novo ou veículo novo de cliente existente. */
export async function registerVehicleAndStartVisitAction(input: QuickRegisterInput, mileageAtVisit: number | null): Promise<{ visitId: string; orderId: string }> {
  const { customer, vehicle } = await registerQuickCustomerAndVehicle(input);
  const visit = await startAttendance(customer.id, vehicle.id, mileageAtVisit);
  const order = await startServiceOrder(visit.id);
  return { visitId: visit.id, orderId: order.id };
}

/** `caption` sempre `null` — registra só o estágio da foto (estrutura preparada, sem upload real). */
export async function addPhotoAction(diagnosticId: string, stage: PhotoStage): Promise<DiagnosticPhoto> {
  return addDiagnosticPhoto(diagnosticId, stage, null);
}

export interface DiagnosticFormState {
  error: string | null;
  success: string | null;
}

/** Devolve o `diagnosticId` — a Etapa 4 (Fotos) do wizard precisa dele para anexar fotos ao diagnóstico certo. */
export async function saveWizardDiagnosticAction(
  serviceVisitId: string,
  exterior: ExteriorAssessment,
  interior: InteriorAssessment,
  observations: string | null,
): Promise<{ diagnosticId: string | null; error: string | null }> {
  try {
    const diagnostic = await saveDiagnosticStep(serviceVisitId, exterior, interior, observations);
    return { diagnosticId: diagnostic.id, error: null };
  } catch (err) {
    return { diagnosticId: null, error: err instanceof Error ? err.message : "Falha ao salvar o diagnóstico." };
  }
}

export async function addRecommendationAction(serviceVisitId: string, category: string, observations: string | null): Promise<DiagnosticFormState> {
  try {
    await addTechnicalRecommendation(serviceVisitId, category, observations);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao registrar a recomendação.", success: null };
  }
  revalidatePath(`/atendimento/${serviceVisitId}`);
  return { error: null, success: "Recomendação registrada." };
}

export async function createServiceOrderAction(serviceVisitId: string, serviceIds: string[]): Promise<DiagnosticFormState> {
  try {
    await createServiceOrderFromApprovedServices(serviceVisitId, serviceIds);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao criar a Ordem de Serviço.", success: null };
  }
  revalidatePath(`/atendimento/${serviceVisitId}`);
  revalidatePath("/atendimento");
  return { error: null, success: "Ordem de Serviço criada — Aguardando Execução." };
}

export async function advanceServiceOrderStatusAction(serviceOrderId: string, currentStatus: ServiceOrderStatus): Promise<void> {
  await advanceServiceOrderStatus(serviceOrderId, currentStatus);
  revalidatePath("/atendimento");
}

/** Check-in rápido ("Cliente Chegou") — cliente/veículo já identificados na busca inline da Gestão do Dia. Mesmo par visita+ordem do wizard, sem passar pelas etapas de diagnóstico/fotos/serviços. */
export async function checkInArrivalAction(customerId: string, vehicleId: string): Promise<{ visitId: string; orderId: string }> {
  const result = await startVisitAction(customerId, vehicleId, null);
  revalidatePath("/atendimento");
  return result;
}
