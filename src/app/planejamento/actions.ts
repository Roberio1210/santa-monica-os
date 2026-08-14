"use server";

import { revalidatePath } from "next/cache";
import { registerQuickCustomerAndVehicle, type QuickRegisterInput } from "@/lib/attendance/service";
import { createAppointment, setCapacityConfig, updateAppointmentStatus } from "@/lib/planning/service";
import type { AppointmentStatus } from "@/lib/planning/types";

export interface ActionResult {
  error: string | null;
  /** Missão CRM V2 Fase 1 — aviso informativo de possível duplicidade (nunca bloqueia, nunca funde). */
  duplicateWarning?: string | null;
}

/** Resolve cliente/veículo (reaproveita por telefone/placa quando já existem) e cria o agendamento. */
export async function createAppointmentAction(
  registerInput: QuickRegisterInput,
  appointmentInput: { serviceId: string; scheduledAt: string; expectedDurationMinutes: number | null; notes: string | null },
): Promise<ActionResult> {
  let duplicateWarning: string | null = null;
  try {
    const { customer, vehicle, possibleDuplicateCustomers, possibleDuplicateVehicles } = await registerQuickCustomerAndVehicle(registerInput);
    const parts: string[] = [];
    if (possibleDuplicateCustomers.length > 0) parts.push(`possível cliente já cadastrado (${possibleDuplicateCustomers.map((c) => c.name).join(", ")})`);
    if (possibleDuplicateVehicles.length > 0) parts.push(`possível veículo já cadastrado em outro cliente (${possibleDuplicateVehicles.map((v) => v.plate).join(", ")})`);
    duplicateWarning = parts.length > 0 ? parts.join("; ") : null;
    await createAppointment({
      customerId: customer.id,
      vehicleId: vehicle.id,
      serviceId: appointmentInput.serviceId,
      scheduledAt: appointmentInput.scheduledAt,
      expectedDurationMinutes: appointmentInput.expectedDurationMinutes,
      notes: appointmentInput.notes,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao criar o agendamento." };
  }
  revalidatePath("/planejamento");
  return { error: null, duplicateWarning };
}

export async function updateAppointmentStatusAction(id: string, status: AppointmentStatus): Promise<ActionResult> {
  try {
    await updateAppointmentStatus(id, status);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao atualizar o status." };
  }
  revalidatePath("/planejamento");
  return { error: null };
}

export async function setCapacityConfigAction(boxesCount: number, dailyOperatingMinutes: number): Promise<ActionResult> {
  try {
    await setCapacityConfig({ boxesCount, dailyOperatingMinutes });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao salvar a capacidade." };
  }
  revalidatePath("/planejamento");
  return { error: null };
}
