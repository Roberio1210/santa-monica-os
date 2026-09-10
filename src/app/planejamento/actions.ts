"use server";

import { revalidatePath } from "next/cache";
import { assignPlateToVehicle, registerQuickCustomerAndVehicle, type QuickRegisterInput } from "@/lib/attendance/service";
import { getCurrentUser } from "@/lib/auth/session";
import { checkAvailabilityForRequest, createAppointment, setCapacityConfig, updateAppointmentDetails, updateAppointmentStatus } from "@/lib/planning/service";
import type { AppointmentStatus, ConflictingAppointmentRef } from "@/lib/planning/types";

/**
 * Missão 52 (login individual/RBAC) — `/planejamento` passou a ser liberado para o papel
 * `operacional` (agenda do dia a dia), mas a capacidade operacional (`boxesCount`/`dailyOperatingMinutes`)
 * continua exclusiva do administrador, mesmo padrão já usado em `src/app/estoque/actions.ts`
 * (`assertAdminForAction`): bloqueio na própria camada de ação, nunca só escondendo o formulário
 * na UI. `null` (sem sessão individual — estado de hoje, ou ADMIN) sempre passa; só bloqueia quando
 * existe uma sessão concreta identificando o papel como operacional.
 */
async function assertAdminForAction(): Promise<string | null> {
  const currentUser = await getCurrentUser();
  if (currentUser && currentUser.role !== "admin") {
    return "Sem permissão para esta ação.";
  }
  return null;
}

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

export interface EditAppointmentInput {
  appointmentId: string;
  serviceId: string;
  date: string;
  time: string;
  notes: string | null;
  expectedUpdatedAt: string;
}

/**
 * Missão 48 — único caminho de edição estrutural do agendamento (serviço/data/horário/observações).
 * Toda a validação real (status, data passada, duração do novo serviço, expediente, disponibilidade
 * excluindo o próprio agendamento, concorrência via `updatedAt`) vive em `updateAppointmentDetails`
 * — esta action só monta `scheduledAt` (mesmo padrão `${date}T${time}:00-03:00` de
 * `new-appointment-form.tsx`) e traduz o erro para uma mensagem já pronta para o usuário.
 */
export async function updateAppointmentDetailsAction(input: EditAppointmentInput): Promise<ActionResult> {
  try {
    await updateAppointmentDetails({
      appointmentId: input.appointmentId,
      serviceId: input.serviceId,
      scheduledAt: `${input.date}T${input.time}:00-03:00`,
      notes: input.notes,
      expectedUpdatedAt: input.expectedUpdatedAt,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao editar o agendamento." };
  }
  revalidatePath("/planejamento");
  return { error: null };
}

/**
 * Missão 48 (Parte J) — reaproveita 100% de `assignPlateToVehicle` (Missão 11, já auditado na
 * Missão 45): só PREENCHE uma placa ausente, nunca substitui uma já existente, nunca funde
 * veículos, nunca escreve na JumpPark. `vehicleId` nunca muda no `appointment` — placa é atributo
 * do veículo, não do agendamento (Parte J, explícito).
 */
export async function assignVehiclePlateAction(vehicleId: string, plate: string): Promise<ActionResult> {
  const result = await assignPlateToVehicle({ vehicleId, plate });
  switch (result.status) {
    case "assigned":
    case "already_assigned":
      revalidatePath("/planejamento");
      return { error: null };
    case "invalid_plate":
      return { error: "Placa inválida." };
    case "vehicle_not_found":
      return { error: "Veículo não encontrado." };
    case "conflict":
      return { error: "Esta placa já está vinculada a outro veículo." };
  }
}

export async function setCapacityConfigAction(boxesCount: number, dailyOperatingMinutes: number): Promise<ActionResult> {
  const denied = await assertAdminForAction();
  if (denied) return { error: denied };
  try {
    await setCapacityConfig({ boxesCount, dailyOperatingMinutes });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Falha ao salvar a capacidade." };
  }
  revalidatePath("/planejamento");
  return { error: null };
}
