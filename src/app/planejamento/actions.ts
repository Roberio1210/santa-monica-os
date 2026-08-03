"use server";

import { revalidatePath } from "next/cache";
import { registerQuickCustomerAndVehicle, type QuickRegisterInput } from "@/lib/attendance/service";
import { createAppointment, setCapacityConfig, updateAppointmentStatus } from "@/lib/planning/service";
import type { AppointmentStatus } from "@/lib/planning/types";

export interface ActionResult {
  error: string | null;
}

/** Resolve cliente/veículo (reaproveita por telefone/placa quando já existem) e cria o agendamento. */
export async function createAppointmentAction(
  registerInput: QuickRegisterInput,
  appointmentInput: { serviceId: string; scheduledAt: string; expectedDurationMinutes: number | null; notes: string | null },
): Promise<ActionResult> {
  try {
    const { customer, vehicle } = await registerQuickCustomerAndVehicle(registerInput);
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
  return { error: null };
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
