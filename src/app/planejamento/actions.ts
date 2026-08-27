"use server";

import { revalidatePath } from "next/cache";
import { registerQuickCustomerAndVehicle, type QuickRegisterInput } from "@/lib/attendance/service";
import { checkAvailabilityForRequest, createAppointment, setCapacityConfig, updateAppointmentStatus } from "@/lib/planning/service";
import type { AppointmentStatus, ConflictingAppointmentRef } from "@/lib/planning/types";

export interface ActionResult {
  error: string | null;
  /** Missão CRM V2 Fase 1 — aviso informativo de possível duplicidade (nunca bloqueia, nunca funde). */
  duplicateWarning?: string | null;
  /**
   * Missão 3.2 — presente quando `checkAvailabilityForRequest` encontrou conflito real de
   * capacidade. O agendamento NUNCA é criado nesse caso — não existe "salvar mesmo assim" ainda.
   */
  availabilityConflict?: { conflictingAppointments: ConflictingAppointmentRef[] } | null;
  /**
   * Missão 3.2 — presente quando a disponibilidade não pôde ser calculada com segurança (ex.:
   * duração do serviço não cadastrada) E o chamador ainda não confirmou estar ciente disso
   * (`acknowledgedInsufficientData`). O agendamento NUNCA é criado nesse caso — o formulário deve
   * pedir a confirmação humana explícita e reenviar.
   */
  availabilityInsufficientData?: { reason: string } | null;
}

export interface NewAppointmentInput {
  serviceId: string;
  scheduledAt: string;
  expectedDurationMinutes: number | null;
  notes: string | null;
  /**
   * Missão 3.2 — confirmação humana explícita de que o usuário está ciente de que a
   * disponibilidade não pôde ser validada automaticamente. Só tem efeito quando
   * `checkAvailabilityForRequest` retornar "insufficient_data" — nunca contorna um "conflict"
   * real. Este campo só existe no fluxo Web humano — nenhuma tool do Zézinho o preenche.
   */
  acknowledgedInsufficientData?: boolean;
}

/**
 * Resolve cliente/veículo (reaproveita por telefone/placa quando já existem) e cria o
 * agendamento — SOMENTE depois de confirmar disponibilidade real via `checkAvailabilityForRequest`
 * (Missão 3.1), a MESMA fonte central usada pela tool `agenda_availability` do Zézinho. A
 * checagem roda aqui, no server action, imediatamente antes da escrita — nunca só no client —
 * para cobrir duas abas, duplo clique e reenvio do mesmo formulário (Missão 3.2, seção 10): uma
 * segunda tentativa de criar o MESMO horário sempre reavalia contra o que já foi salvo pela
 * primeira, nunca duplica silenciosamente. Uma corrida genuína entre duas requisições
 * verdadeiramente simultâneas (chegando ao banco antes de qualquer uma commitar) não é eliminada
 * por esta checagem sozinha — fechar isso por completo exigiria transaction/lock dedicado, fora
 * do escopo desta missão (documentado no checkpoint, não implementado aqui).
 */
export async function createAppointmentAction(registerInput: QuickRegisterInput, appointmentInput: NewAppointmentInput): Promise<ActionResult> {
  let duplicateWarning: string | null = null;
  try {
    const { customer, vehicle, possibleDuplicateCustomers, possibleDuplicateVehicles } = await registerQuickCustomerAndVehicle(registerInput);
    const parts: string[] = [];
    if (possibleDuplicateCustomers.length > 0) parts.push(`possível cliente já cadastrado (${possibleDuplicateCustomers.map((c) => c.name).join(", ")})`);
    if (possibleDuplicateVehicles.length > 0) parts.push(`possível veículo já cadastrado em outro cliente (${possibleDuplicateVehicles.map((v) => v.plate).join(", ")})`);
    duplicateWarning = parts.length > 0 ? parts.join("; ") : null;

    const availability = await checkAvailabilityForRequest({
      serviceId: appointmentInput.serviceId,
      scheduledAt: appointmentInput.scheduledAt,
      expectedDurationMinutes: appointmentInput.expectedDurationMinutes,
    });

    if (availability.status === "conflict") {
      return { error: "Já existe atendimento ocupando esse intervalo.", duplicateWarning, availabilityConflict: { conflictingAppointments: availability.conflictingAppointments } };
    }

    if (availability.status === "insufficient_data" && !appointmentInput.acknowledgedInsufficientData) {
      return { error: null, duplicateWarning, availabilityInsufficientData: { reason: availability.reason } };
    }

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
