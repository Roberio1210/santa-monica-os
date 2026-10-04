"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { EmergencyConcurrentUpdateError, EmergencyNotFoundError } from "@/lib/emergency/repository";
import {
  createEmergencyContact,
  EmergencyInvalidPriorityContactError,
  setEmergencyContactActive,
  setEmergencyProtocolActive,
  updateEmergencyContact,
  updateEmergencyProtocol,
} from "@/lib/emergency/service";
import { validateContactInput, validateProtocolInput } from "@/lib/emergency/validation";

export interface FormActionState {
  error: string | null;
  success: string | null;
}

/**
 * Módulo Emergência — Fase 1. Mesma checagem FAIL-CLOSED de `src/app/departamento-pessoal/actions.ts`
 * (`requireAdmin`): sem sessão individual ou com papel diferente de admin, nega sempre. Enquanto
 * `INDIVIDUAL_AUTH_ENABLED` estiver desligado, ninguém edita a Central (a leitura continua aberta
 * a todos) — comportamento intencional, nunca afrouxado para contornar isso. A rota
 * `/configuracoes/emergencia` também já é bloqueada para OPERACIONAL pelo middleware (default-deny
 * de `OPERATIONAL_ALLOWED_PREFIXES`), mas a segurança real está aqui: chamar a action diretamente
 * passa exatamente pela mesma checagem.
 */
async function requireAdmin(): Promise<{ error: string; user: null } | { error: null; user: CurrentUser }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Não autorizado — é necessário estar autenticado como administrador para editar a Central de Emergência.", user: null };
  if (currentUser.role !== "admin") return { error: "Acesso restrito a administradores.", user: null };
  return { error: null, user: currentUser };
}

function revalidateEmergency(): void {
  revalidatePath("/emergencia", "layout");
  revalidatePath("/configuracoes/emergencia");
}

function toErrorState(error: unknown): FormActionState {
  if (error instanceof EmergencyConcurrentUpdateError || error instanceof EmergencyNotFoundError || error instanceof EmergencyInvalidPriorityContactError) {
    return { error: error.message, success: null };
  }
  console.error("[emergencia] falha ao salvar:", error instanceof Error ? error.message : error);
  return { error: "Não foi possível salvar agora. Tente novamente.", success: null };
}

function readContactForm(formData: FormData) {
  return validateContactInput({
    name: formData.get("name"),
    category: formData.get("category"),
    phone: formData.get("phone"),
    phoneAlt: formData.get("phoneAlt"),
    whatsapp: formData.get("whatsapp"),
    email: formData.get("email"),
    website: formData.get("website"),
    priority: formData.get("priority"),
    displayOrder: formData.get("displayOrder"),
    notes: formData.get("notes"),
  });
}

export async function createContactAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const auth = await requireAdmin();
  if (auth.error !== null) return { error: auth.error, success: null };

  const parsed = readContactForm(formData);
  if (!parsed.ok) return { error: parsed.error, success: null };

  try {
    await createEmergencyContact(parsed.value, auth.user.id);
  } catch (error) {
    return toErrorState(error);
  }
  revalidateEmergency();
  return { error: null, success: "Contato criado." };
}

export async function updateContactAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const auth = await requireAdmin();
  if (auth.error !== null) return { error: auth.error, success: null };

  const id = String(formData.get("id") ?? "");
  const expectedUpdatedAt = String(formData.get("expectedUpdatedAt") ?? "");
  if (!id || !expectedUpdatedAt) return { error: "Requisição inválida.", success: null };

  const parsed = readContactForm(formData);
  if (!parsed.ok) return { error: parsed.error, success: null };

  try {
    await updateEmergencyContact(id, parsed.value, expectedUpdatedAt, auth.user.id);
  } catch (error) {
    return toErrorState(error);
  }
  revalidateEmergency();
  return { error: null, success: "Contato atualizado." };
}

export async function toggleContactActiveAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const auth = await requireAdmin();
  if (auth.error !== null) return { error: auth.error, success: null };

  const id = String(formData.get("id") ?? "");
  const expectedUpdatedAt = String(formData.get("expectedUpdatedAt") ?? "");
  const active = formData.get("active") === "true";
  if (!id || !expectedUpdatedAt) return { error: "Requisição inválida.", success: null };

  try {
    await setEmergencyContactActive(id, active, expectedUpdatedAt, auth.user.id);
  } catch (error) {
    return toErrorState(error);
  }
  revalidateEmergency();
  return { error: null, success: active ? "Contato reativado." : "Contato desativado." };
}

export async function updateProtocolAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const auth = await requireAdmin();
  if (auth.error !== null) return { error: auth.error, success: null };

  const id = String(formData.get("id") ?? "");
  const expectedUpdatedAt = String(formData.get("expectedUpdatedAt") ?? "");
  if (!id || !expectedUpdatedAt) return { error: "Requisição inválida.", success: null };

  const parsed = validateProtocolInput({
    title: formData.get("title"),
    category: formData.get("category"),
    description: formData.get("description"),
    priority: formData.get("priority"),
    displayOrder: formData.get("displayOrder"),
    warning: formData.get("warning"),
    notes: formData.get("notes"),
    priorityContactId: formData.get("priorityContactId"),
    potentialCoverageKeys: formData.getAll("potentialCoverageKeys"),
    steps: formData.get("steps"),
  });
  if (!parsed.ok) return { error: parsed.error, success: null };

  try {
    await updateEmergencyProtocol(id, parsed.value, expectedUpdatedAt, auth.user.id);
  } catch (error) {
    return toErrorState(error);
  }
  revalidateEmergency();
  return { error: null, success: "Protocolo atualizado." };
}

export async function toggleProtocolActiveAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const auth = await requireAdmin();
  if (auth.error !== null) return { error: auth.error, success: null };

  const id = String(formData.get("id") ?? "");
  const expectedUpdatedAt = String(formData.get("expectedUpdatedAt") ?? "");
  const active = formData.get("active") === "true";
  if (!id || !expectedUpdatedAt) return { error: "Requisição inválida.", success: null };

  try {
    await setEmergencyProtocolActive(id, active, expectedUpdatedAt, auth.user.id);
  } catch (error) {
    return toErrorState(error);
  }
  revalidateEmergency();
  return { error: null, success: active ? "Protocolo reativado." : "Protocolo desativado." };
}
