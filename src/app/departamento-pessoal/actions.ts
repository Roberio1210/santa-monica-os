"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import {
  updateEmployee,
  updateContractor,
  recordEmployeePayment,
  createEmployeeRecord,
  createContractorRecord,
  ConcurrencyConflictError,
  NotFoundError,
  InvalidPaymentCategoryError,
  InvalidFinancialAccountError,
  InvalidAmountError,
  DuplicateCollaboratorError,
  RECORDABLE_EMPLOYEE_PAYMENT_CATEGORIES,
  type RecordableEmployeePaymentCategory,
} from "@/lib/hr/repository";

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

/**
 * Fase 4 (20/09/2026) — "Registrar pagamento". `idempotencyKey` é calculada AQUI, no servidor, a
 * partir dos campos já validados/normalizados (nunca confiada do cliente) — determinística, não
 * aleatória, de propósito: um duplo clique, um F5 seguido de reenvio do mesmo formulário, ou um
 * retry de rede reenviam exatamente os mesmos valores, produzindo a MESMA chave, então a garantia
 * `UNIQUE` do banco (`employee_payments.idempotency_key`) barra a segunda escrita — nunca cria um
 * segundo pagamento. Um pagamento genuinamente novo (outro valor, outra data, outra categoria ou
 * mesmo só uma descrição diferente) sempre produz uma chave diferente, nunca é bloqueado.
 */
function computePaymentIdempotencyKey(input: {
  subjectId: string;
  category: string;
  amount: number;
  date: string;
  competenceDate: string | null;
  description: string;
}): string {
  const raw = [input.subjectId, input.category, input.amount.toFixed(2), input.date, input.competenceDate ?? "", input.description].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

function parseCategory(value: FormDataEntryValue | null): RecordableEmployeePaymentCategory | null {
  const str = String(value ?? "");
  return (RECORDABLE_EMPLOYEE_PAYMENT_CATEGORIES as readonly string[]).includes(str) ? (str as RecordableEmployeePaymentCategory) : null;
}

/**
 * Registra um pagamento novo (nunca edita um existente). O colaborador vem sempre da ficha
 * (`subjectType`/`subjectId` em campos ocultos, preenchidos pelo servidor ao renderizar a página
 * — o formulário nunca expõe um seletor de colaborador, então não há como "trocar
 * silenciosamente" quem recebe). Nunca aceita categoria `adiantamento` (fluxo próprio de
 * `employee_advances`, fora desta action) nem qualquer categoria sem mapeamento de DRE confirmado
 * — ver `RECORDABLE_EMPLOYEE_PAYMENT_CATEGORIES`.
 */
export async function registerEmployeePaymentAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const auth = await requireAdmin();
  if (auth.error !== null) return { error: auth.error, success: null };

  const subjectId = String(formData.get("subjectId") ?? "");
  const subjectTypeRaw = String(formData.get("subjectType") ?? "");
  const subjectType = subjectTypeRaw === "employee" || subjectTypeRaw === "contractor" ? subjectTypeRaw : null;
  if (!subjectId || !subjectType) return { error: "Colaborador não identificado.", success: null };

  const category = parseCategory(formData.get("category"));
  if (!category) return { error: "Categoria inválida. Adiantamento tem uma ação própria, fora deste formulário.", success: null };

  const amountResult = parseOptionalMoney(formData.get("amount"));
  if (!amountResult.ok || amountResult.value === null || amountResult.value <= 0) return { error: "Valor deve ser numérico e maior que zero.", success: null };

  const date = parseOptionalString(formData.get("date"));
  if (!date) return { error: "Data do pagamento é obrigatória.", success: null };

  // Competência é conceito independente da data do pagamento — nunca derivada automaticamente aqui.
  const competenceDate = parseOptionalString(formData.get("competenceDate"));

  const description = parseOptionalString(formData.get("description"));
  if (!description) return { error: "Descrição é obrigatória.", success: null };

  const financialAccountId = String(formData.get("financialAccountId") ?? "");
  if (!financialAccountId) return { error: "Origem/conta do pagamento é obrigatória.", success: null };

  const notes = parseOptionalString(formData.get("notes"));

  const idempotencyKey = computePaymentIdempotencyKey({ subjectId, category, amount: amountResult.value, date, competenceDate, description });

  let result;
  try {
    result = await recordEmployeePayment(
      { subjectType, subjectId, category, amount: amountResult.value, date, competenceDate, description, notes, financialAccountId, idempotencyKey },
      auth.user.id,
    );
  } catch (err) {
    if (err instanceof NotFoundError) return { error: "Colaborador não encontrado.", success: null };
    if (err instanceof InvalidPaymentCategoryError) return { error: err.message, success: null };
    if (err instanceof InvalidFinancialAccountError) return { error: "Conta/origem do pagamento inválida.", success: null };
    if (err instanceof InvalidAmountError) return { error: err.message, success: null };
    return { error: "Falha ao registrar o pagamento. Tente novamente.", success: null };
  }

  revalidatePath("/departamento-pessoal");
  revalidatePath(`/departamento-pessoal/${subjectId}`);
  return { error: null, success: result.created ? "Pagamento registrado." : "Este pagamento já havia sido registrado — nenhum novo lançamento foi criado." };
}

/**
 * Fase 5 (20/09/2026) — cadastro de colaborador CLT novo. Nunca cria pagamento/adiantamento/
 * cash_movement — só `employees` + `audit_logs`. Redireciona para a ficha individual em caso de
 * sucesso (`redirect` lança internamente — nunca deve ser capturado pelo `catch` abaixo, por isso
 * fica fora do bloco `try`).
 */
export async function createEmployeeAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const auth = await requireAdmin();
  if (auth.error !== null) return { error: auth.error, success: null };

  const fullName = parseOptionalString(formData.get("fullName"));
  if (!fullName) return { error: "Nome é obrigatório.", success: null };
  const role = parseOptionalString(formData.get("role"));
  if (!role) return { error: "Função é obrigatória.", success: null };
  const admissionDate = parseOptionalString(formData.get("admissionDate"));
  const workSchedule = parseOptionalString(formData.get("workSchedule"));
  const baseSalaryResult = parseOptionalMoney(formData.get("baseSalary"));
  if (!baseSalaryResult.ok) return { error: "Salário base inválido — informe um valor numérico não negativo.", success: null };
  const notes = parseOptionalString(formData.get("notes"));

  let created;
  try {
    created = await createEmployeeRecord({ fullName, role, admissionDate, workSchedule, baseSalary: baseSalaryResult.value, notes }, auth.user.id);
  } catch {
    return { error: "Falha ao cadastrar colaborador. Tente novamente.", success: null };
  }

  revalidatePath("/departamento-pessoal");
  redirect(`/departamento-pessoal/${created.id}`);
}

/**
 * Fase 5 (20/09/2026) — cadastro de prestador PJ novo. Único identificador confiável do schema é
 * `taxId` (CPF/CNPJ) — quando informado e já existente, bloqueia e informa (nunca mescla
 * silenciosamente). Sem `taxId`, não há como checar duplicidade (nome sozinho nunca é prova).
 */
export async function createContractorAction(_prevState: FormActionState, formData: FormData): Promise<FormActionState> {
  const auth = await requireAdmin();
  if (auth.error !== null) return { error: auth.error, success: null };

  const businessName = parseOptionalString(formData.get("businessName"));
  if (!businessName) return { error: "Nome/razão social é obrigatório.", success: null };
  const typeRaw = String(formData.get("type") ?? "");
  const type = typeRaw === "pessoa_fisica" || typeRaw === "pessoa_juridica" ? typeRaw : null;
  if (!type) return { error: "Tipo é obrigatório.", success: null };
  const taxId = parseOptionalString(formData.get("taxId"));
  const contactPhone = parseOptionalString(formData.get("contactPhone"));
  const scope = parseOptionalString(formData.get("scope"));
  const agreedValueResult = parseOptionalMoney(formData.get("agreedValue"));
  if (!agreedValueResult.ok) return { error: "Valor combinado inválido — informe um valor numérico não negativo.", success: null };
  const contractStart = parseOptionalString(formData.get("contractStart"));
  const notes = parseOptionalString(formData.get("notes"));

  let created;
  try {
    created = await createContractorRecord({ businessName, type, taxId, contactPhone, scope, agreedValue: agreedValueResult.value, contractStart, notes }, auth.user.id);
  } catch (err) {
    if (err instanceof DuplicateCollaboratorError) return { error: err.message, success: null };
    return { error: "Falha ao cadastrar colaborador. Tente novamente.", success: null };
  }

  revalidatePath("/departamento-pessoal");
  redirect(`/departamento-pessoal/${created.id}`);
}
