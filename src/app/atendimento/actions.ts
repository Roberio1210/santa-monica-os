"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addTechnicalRecommendation,
  advanceServiceOrderStatus,
  createServiceOrderFromApprovedServices,
  registerQuickCustomerAndVehicle,
  saveDiagnosticStep,
  searchByPhoneOrPlate,
  setServiceOrderStatus,
  startAttendance,
  type QuickRegisterInput,
  type SearchResult,
} from "@/lib/attendance/service";
import type { ExteriorAssessment, InteriorAssessment, ServiceOrderStatus } from "@/lib/attendance/types";

export async function searchAttendanceAction(query: string): Promise<SearchResult | null> {
  return searchByPhoneOrPlate(query);
}

/** Cadastro rápido + início do atendimento em uma única ação — poucos cliques, como pede a UX. */
export async function quickStartAttendanceAction(input: QuickRegisterInput, mileageAtVisit: number | null): Promise<void> {
  const { customer, vehicle } = await registerQuickCustomerAndVehicle(input);
  const visit = await startAttendance(customer.id, vehicle.id, mileageAtVisit);
  redirect(`/atendimento/${visit.id}`);
}

export async function startAttendanceForExistingAction(customerId: string, vehicleId: string, mileageAtVisit: number | null): Promise<void> {
  const visit = await startAttendance(customerId, vehicleId, mileageAtVisit);
  redirect(`/atendimento/${visit.id}`);
}

export interface DiagnosticFormState {
  error: string | null;
  success: string | null;
}

export async function saveDiagnosticAction(serviceVisitId: string, exterior: ExteriorAssessment, interior: InteriorAssessment, observations: string | null): Promise<DiagnosticFormState> {
  try {
    await saveDiagnosticStep(serviceVisitId, exterior, interior, observations);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao salvar o diagnóstico.", success: null };
  }
  revalidatePath(`/atendimento/${serviceVisitId}`);
  return { error: null, success: "Diagnóstico salvo." };
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

export async function setServiceOrderStatusAction(serviceOrderId: string, status: ServiceOrderStatus): Promise<void> {
  await setServiceOrderStatus(serviceOrderId, status);
  revalidatePath("/atendimento");
}
