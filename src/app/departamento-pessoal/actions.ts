"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { updateEmployee, updateContractor, ConcurrencyConflictError, NotFoundError } from "@/lib/hr/repository";

export interface FormActionState {
  error: string | null;
  success: string | null;
}

/**
 * Fase 3 do Departamento Pessoal (20/09/2026) — checagem FAIL-CLOSED, deliberadamente diferente
 * de `assertAdminForAction` (`src/app/estoque/actions.ts`), que libera a ação quando não existe
 * sessão individual nenhuma (comportamento correto para estoque, mas não aceitável para dados de
 * folha/cadastro). Mesmo padrão já usado em `src/app/api/admin/stone-payload-diagnostic/route.ts`
 * (rota que também exige admin "independente de INDIVIDUAL_AUTH_ENABLED — essa flag só controla
 * a exigência de sessão para navegação geral"): aqui a exigência é sempre explícita.
 *
 * Consequência aceita e intencional: enquanto `INDIVIDUAL_AUTH_ENABLED` estiver desligado (nenhum
 * usuário jamais loga individualmente), `getCurrentUser()` sempre retorna `null` e esta função
 * sempre nega — ninguém, nem o proprietário, consegue editar um cadastro até existir uma sessão
 * admin real. Isso é o comportamento desejado (nunca reduzir a segurança para contornar isso),
 * não um bug: a segurança do servidor nunca depende de o botão estar visível ou escondido na UI —
 * chamar esta action diretamente (fetch manual, DevTools, replay de request) tem exatamente a
 * mesma checagem.
 */
async function requireAdmin(): Promise<{ error: string; user: null } | { error: null; user: CurrentUser }> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return { error: "Não autorizado — é necessário estar autenticado como administrador para editar este cadastro.", user: null };
  if (currentUser.role !== "admin") return { error: "Acesso restrito a administradores.", user: null };
  return { error: null, user: currentUser };
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  const str = String(value ?? "").trim();
  return str.length > 0 ? str : null;
}

/**
 * Campos de dinheiro usam `<input type="number">` no formulário — o navegador sempre envia
 * ponto decimal ("3500.00"), nunca vírgula, independente do locale de exibição. Isso evita por
 * construção a ambiguidade BR/US que já causou um bug real neste projeto (parser de importação de
 * compras, Missão de Consolidação Financeira). Nunca aceita negativo (não faz sentido no domínio).
 */
function parseOptionalMoney(value: FormDataEntryValue | null): { ok: true; value: number | null } | { ok: false } {
  const str = String(value ?? "").trim();
  if (str.length === 0) return { ok: true, value: null };
  const n = Number(str);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

function parseExpectedUpdatedAt(value: FormDataEntryValue | null): Date | null {
  const str = String(value ?? "");
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Edição cadastral de colaborador CLT (`employees`) — nunca cria/altera pagamento, comissão, benefício ou qualquer registro financeiro. */
export async function updateEmployeeAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const auth = await requireAdmin();
  if (auth.error !== null) return { error: auth.error, success: null };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Colaborador não identificado.", success: null };

  const expectedUpdatedAt = parseExpectedUpdatedAt(formData.get("expectedUpdatedAt"));
  if (!expectedUpdatedAt) return { error: "Estado do formulário inválido — recarregue a página e tente novamente.", success: null };

  const fullName = parseOptionalString(formData.get("fullName"));
  if (!fullName) return { error: "Nome é obrigatório.", success: null };
  const role = parseOptionalString(formData.get("role"));
  if (!role) return { error: "Função é obrigatória.", success: null };
  const admissionDate = parseOptionalString(formData.get("admissionDate"));
  const workSchedule = parseOptionalString(formData.get("workSchedule"));
  const baseSalaryResult = parseOptionalMoney(formData.get("baseSalary"));
  if (!baseSalaryResult.ok) return { error: "Salário base inválido — informe um valor numérico não negativo.", success: null };
  const notes = parseOptionalString(formData.get("notes"));

  try {
    await updateEmployee(id, { fullName, role, admissionDate, workSchedule, baseSalary: baseSalaryResult.value, notes }, expectedUpdatedAt, auth.user.id);
  } catch (err) {
    if (err instanceof NotFoundError) return { error: "Colaborador não encontrado.", success: null };
    if (err instanceof ConcurrencyConflictError) return { error: err.message, success: null };
    return { error: "Falha ao salvar o cadastro. Tente novamente.", success: null };
  }

  revalidatePath("/departamento-pessoal");
  revalidatePath(`/departamento-pessoal/${id}`);
  return { error: null, success: "Cadastro atualizado." };
}

/** Edição cadastral de prestador PJ (`contractors`) — mesmas garantias de `updateEmployeeAction`. */
export async function updateContractorAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const auth = await requireAdmin();
  if (auth.error !== null) return { error: auth.error, success: null };

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Colaborador não identificado.", success: null };

  const expectedUpdatedAt = parseExpectedUpdatedAt(formData.get("expectedUpdatedAt"));
  if (!expectedUpdatedAt) return { error: "Estado do formulário inválido — recarregue a página e tente novamente.", success: null };

  const businessName = parseOptionalString(formData.get("businessName"));
  if (!businessName) return { error: "Nome/razão social é obrigatório.", success: null };
  const typeRaw = String(formData.get("type") ?? "");
  const type = typeRaw === "pessoa_fisica" || typeRaw === "pessoa_juridica" ? typeRaw : null;
  if (!type) return { error: "Tipo inválido.", success: null };
  const taxId = parseOptionalString(formData.get("taxId"));
  const contactPhone = parseOptionalString(formData.get("contactPhone"));
  const scope = parseOptionalString(formData.get("scope"));
  const agreedValueResult = parseOptionalMoney(formData.get("agreedValue"));
  if (!agreedValueResult.ok) return { error: "Valor combinado inválido — informe um valor numérico não negativo.", success: null };
  const contractStart = parseOptionalString(formData.get("contractStart"));
  const contractEnd = parseOptionalString(formData.get("contractEnd"));
  const notes = parseOptionalString(formData.get("notes"));

  try {
    await updateContractor(id, { businessName, type, taxId, contactPhone, scope, agreedValue: agreedValueResult.value, contractStart, contractEnd, notes }, expectedUpdatedAt, auth.user.id);
  } catch (err) {
    if (err instanceof NotFoundError) return { error: "Colaborador não encontrado.", success: null };
    if (err instanceof ConcurrencyConflictError) return { error: err.message, success: null };
    return { error: "Falha ao salvar o cadastro. Tente novamente.", success: null };
  }

  revalidatePath("/departamento-pessoal");
  revalidatePath(`/departamento-pessoal/${id}`);
  return { error: null, success: "Cadastro atualizado." };
}

/**
 * Ativar/desativar (nunca excluir) — ação própria, separada do formulário de edição, mesmo
 * padrão de `toggleItemActiveAction` (`src/app/estoque/actions.ts`). `type` decide qual
 * repositório chamar; `expectedUpdatedAt` garante a mesma proteção de concorrência do formulário
 * principal, mesmo sendo uma ação de um clique só.
 */
export async function toggleCollaboratorActiveAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const auth = await requireAdmin();
  if (auth.error !== null) return { error: auth.error, success: null };

  const id = String(formData.get("id") ?? "");
  const type = String(formData.get("type") ?? "");
  const active = formData.get("active") === "true";
  const expectedUpdatedAt = parseExpectedUpdatedAt(formData.get("expectedUpdatedAt"));
  if (!id || (type !== "employee" && type !== "contractor")) return { error: "Colaborador não identificado.", success: null };
  if (!expectedUpdatedAt) return { error: "Estado do formulário inválido — recarregue a página e tente novamente.", success: null };

  try {
    if (type === "employee") await updateEmployee(id, { active }, expectedUpdatedAt, auth.user.id);
    else await updateContractor(id, { active }, expectedUpdatedAt, auth.user.id);
  } catch (err) {
    if (err instanceof NotFoundError) return { error: "Colaborador não encontrado.", success: null };
    if (err instanceof ConcurrencyConflictError) return { error: err.message, success: null };
    return { error: "Falha ao atualizar a situação do colaborador.", success: null };
  }

  revalidatePath("/departamento-pessoal");
  revalidatePath(`/departamento-pessoal/${id}`);
  return { error: null, success: active ? "Colaborador reativado." : "Colaborador marcado como inativo." };
}
