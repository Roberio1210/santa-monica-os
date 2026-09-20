import "server-only";
import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { employees, contractors, employeeDocuments, employeePayments, employeeAdvances, auditLogs } from "@/db/schema";
import { applyAdvanceCompensation, type EmployeeAdvanceState } from "@/lib/hr/advances";

/**
 * Missão 86 (Departamento Pessoal) — camada de I/O sobre `employees`/`contractors`/
 * `employee_payments`/`employee_advances`. Reaproveita 100% do schema já existente (10/07/2026),
 * nunca duplica entidade: `getOrCreate*` sempre busca por nome antes de criar.
 *
 * Sem repositório em memória nesta primeira versão (módulo novo, ainda sem tela pública) — os
 * testes de integração usam TEST_DATABASE_URL, os de lógica pura usam advances.ts/costSummary.ts
 * diretamente (ver testes correspondentes).
 */

export type EmployeeRow = typeof employees.$inferSelect;
export type ContractorRow = typeof contractors.$inferSelect;
export type EmployeePaymentRow = typeof employeePayments.$inferSelect;
export type EmployeeAdvanceRow = typeof employeeAdvances.$inferSelect;
export type EmployeeDocumentRow = typeof employeeDocuments.$inferSelect;

function db() {
  const instance = getDb();
  if (!instance) throw new Error("Banco não configurado.");
  return instance;
}

export async function listEmployees(): Promise<EmployeeRow[]> {
  return db().select().from(employees).where(eq(employees.active, true));
}

export async function listContractors(): Promise<ContractorRow[]> {
  return db().select().from(contractors).where(eq(contractors.active, true));
}

/**
 * Ficha individual (Fase 1, 20/09/2026) — busca por ID SEM filtrar por `active`: um colaborador
 * desligado continua acessível pela ficha (histórico não desaparece), só deixa de aparecer na
 * listagem principal de `/departamento-pessoal`. `null` quando o ID não existe (ou pertence ao
 * outro tipo — a página resolve tentando `getEmployeeById` e, se null, `getContractorById`).
 */
export async function getEmployeeById(id: string): Promise<EmployeeRow | null> {
  const [row] = await db().select().from(employees).where(eq(employees.id, id)).limit(1);
  return row ?? null;
}

export async function getContractorById(id: string): Promise<ContractorRow | null> {
  const [row] = await db().select().from(contractors).where(eq(contractors.id, id)).limit(1);
  return row ?? null;
}

/** Colaborador não encontrado pelo ID exato informado — nunca um fallback silencioso. */
export class NotFoundError extends Error {}

/**
 * Update concorrente: outra sessão salvou o mesmo cadastro entre a leitura e esta escrita.
 * Nunca sobrescrita silenciosa — o chamador deve pedir para o usuário recarregar e tentar de novo.
 */
export class ConcurrencyConflictError extends Error {}

/**
 * Whitelist explícita dos campos editáveis de `employees` (Fase 3, 20/09/2026) — nunca um spread
 * de objeto arbitrário. Cada campo só é incluído no `UPDATE` se estiver presente em `patch`
 * (`in` check, não `!== undefined`, para permitir setar explicitamente `null` num campo nullable
 * sem confundir com "não enviado"); os demais permanecem exatamente como estavam. Nunca inclui
 * `id`/`createdAt`/`source`/`externalId` — mesmo que um chamador malicioso os injete no objeto
 * `patch` (`as any`), esta função nunca os lê.
 */
export interface UpdateEmployeeInput {
  fullName?: string;
  role?: string;
  admissionDate?: string | null;
  workSchedule?: string | null;
  baseSalary?: number | null;
  notes?: string | null;
  active?: boolean;
}

/**
 * `expectedUpdatedAt` implementa concorrência otimista SEM migration: a escrita só é aplicada se
 * `updated_at` no banco ainda for exatamente o valor lido pelo formulário (truncado a
 * milissegundos — `now()` do Postgres tem precisão de microssegundos, uma comparação exata
 * quebraria sempre). Zero linhas afetadas => outra sessão alterou o registro nesse meio tempo =>
 * `ConcurrencyConflictError`, nunca uma sobrescrita silenciosa. `actorUserId` vai para o
 * `audit_logs` — `null` quando não há sessão individual real (nunca inventado).
 */
export async function updateEmployee(id: string, patch: UpdateEmployeeInput, expectedUpdatedAt: Date, actorUserId: string | null): Promise<EmployeeRow> {
  return db().transaction(async (tx) => {
    const [existing] = await tx.select().from(employees).where(eq(employees.id, id)).limit(1);
    if (!existing) throw new NotFoundError(`Colaborador (CLT) não encontrado: ${id}`);

    const setValues: Record<string, unknown> = { updatedAt: new Date() };
    if ("fullName" in patch) setValues.fullName = patch.fullName;
    if ("role" in patch) setValues.role = patch.role;
    if ("admissionDate" in patch) setValues.admissionDate = patch.admissionDate;
    if ("workSchedule" in patch) setValues.workSchedule = patch.workSchedule;
    if ("baseSalary" in patch) setValues.baseSalary = patch.baseSalary === null || patch.baseSalary === undefined ? null : String(patch.baseSalary);
    if ("notes" in patch) setValues.notes = patch.notes;
    if ("active" in patch) setValues.active = patch.active;

    const [updated] = await tx
      .update(employees)
      .set(setValues)
      .where(and(eq(employees.id, id), sql`date_trunc('milliseconds', ${employees.updatedAt}) = date_trunc('milliseconds', ${expectedUpdatedAt.toISOString()}::timestamptz)`))
      .returning();

    if (!updated) throw new ConcurrencyConflictError("Este cadastro foi alterado por outra sessão — recarregue a página antes de salvar novamente.");

    await tx.insert(auditLogs).values({
      actorUserId,
      action: "update_employee_cadastro",
      entityType: "employee",
      entityId: id,
      beforeState: existing,
      afterState: updated,
      source: "manual",
    });

    return updated;
  });
}

/**
 * Fase 3 (revisão final, 20/09/2026) — `audit_logs` nunca grava CPF/CNPJ completo (decisão
 * explícita do gestor), nem no valor anterior nem no novo: `taxId` vira `"[presente]"`/`null`,
 * nunca o documento em si. `employees` não tem coluna de CPF (ver schema), então só `contractors`
 * precisa desta redação.
 */
function redactContractorForAudit(row: ContractorRow): Record<string, unknown> {
  const { taxId, ...rest } = row;
  return { ...rest, taxId: taxId ? "[presente]" : null };
}

/** Mesma whitelist explícita e a mesma disciplina de `updateEmployee`, para `contractors` (PJ). */
export interface UpdateContractorInput {
  businessName?: string;
  type?: "pessoa_fisica" | "pessoa_juridica";
  taxId?: string | null;
  contactPhone?: string | null;
  scope?: string | null;
  agreedValue?: number | null;
  contractStart?: string | null;
  contractEnd?: string | null;
  notes?: string | null;
  active?: boolean;
}

export async function updateContractor(id: string, patch: UpdateContractorInput, expectedUpdatedAt: Date, actorUserId: string | null): Promise<ContractorRow> {
  return db().transaction(async (tx) => {
    const [existing] = await tx.select().from(contractors).where(eq(contractors.id, id)).limit(1);
    if (!existing) throw new NotFoundError(`Prestador (PJ) não encontrado: ${id}`);

    const setValues: Record<string, unknown> = { updatedAt: new Date() };
    if ("businessName" in patch) setValues.businessName = patch.businessName;
    if ("type" in patch) setValues.type = patch.type;
    if ("taxId" in patch) setValues.taxId = patch.taxId;
    if ("contactPhone" in patch) setValues.contactPhone = patch.contactPhone;
    if ("scope" in patch) setValues.scope = patch.scope;
    if ("agreedValue" in patch) setValues.agreedValue = patch.agreedValue === null || patch.agreedValue === undefined ? null : String(patch.agreedValue);
    if ("contractStart" in patch) setValues.contractStart = patch.contractStart;
    if ("contractEnd" in patch) setValues.contractEnd = patch.contractEnd;
    if ("notes" in patch) setValues.notes = patch.notes;
    if ("active" in patch) setValues.active = patch.active;

    const [updated] = await tx
      .update(contractors)
      .set(setValues)
      .where(and(eq(contractors.id, id), sql`date_trunc('milliseconds', ${contractors.updatedAt}) = date_trunc('milliseconds', ${expectedUpdatedAt.toISOString()}::timestamptz)`))
      .returning();

    if (!updated) throw new ConcurrencyConflictError("Este cadastro foi alterado por outra sessão — recarregue a página antes de salvar novamente.");

    await tx.insert(auditLogs).values({
      actorUserId,
      action: "update_contractor_cadastro",
      entityType: "contractor",
      entityId: id,
      beforeState: redactContractorForAudit(existing),
      afterState: redactContractorForAudit(updated),
      source: "manual",
      notes: existing.taxId !== updated.taxId ? "cpf_cnpj: alterado" : null,
    });

    return updated;
  });
}

export interface CreateEmployeeInput {
  fullName: string;
  role: string;
  admissionDate?: string | null;
  workSchedule?: string | null;
  baseSalary?: number | null;
  source?: string;
  notes?: string | null;
}

/** Nunca cria duplicado — busca por `fullName` (case-insensitive) antes de inserir. */
export async function getOrCreateEmployee(input: CreateEmployeeInput): Promise<EmployeeRow> {
  const existing = await db().select().from(employees).where(eq(employees.fullName, input.fullName)).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db()
    .insert(employees)
    .values({
      fullName: input.fullName,
      role: input.role,
      admissionDate: input.admissionDate ?? null,
      workSchedule: input.workSchedule ?? null,
      baseSalary: input.baseSalary !== null && input.baseSalary !== undefined ? String(input.baseSalary) : null,
      source: input.source ?? "manual",
      notes: input.notes ?? null,
    })
    .returning();
  return row;
}

export interface CreateContractorInput {
  businessName: string;
  type?: "pessoa_fisica" | "pessoa_juridica";
  taxId?: string | null;
  scope?: string | null;
  agreedValue?: number | null;
  contractStart?: string | null;
  source?: string;
  notes?: string | null;
}

/** Nunca cria duplicado — busca por `businessName` (exato) antes de inserir. */
export async function getOrCreateContractor(input: CreateContractorInput): Promise<ContractorRow> {
  const existing = await db().select().from(contractors).where(eq(contractors.businessName, input.businessName)).limit(1);
  if (existing[0]) return existing[0];
  const [row] = await db()
    .insert(contractors)
    .values({
      businessName: input.businessName,
      type: input.type ?? "pessoa_fisica",
      taxId: input.taxId ?? null,
      scope: input.scope ?? null,
      agreedValue: input.agreedValue !== null && input.agreedValue !== undefined ? String(input.agreedValue) : null,
      contractStart: input.contractStart ?? null,
      source: input.source ?? "manual",
      notes: input.notes ?? null,
    })
    .returning();
  return row;
}

export interface CreateEmployeePaymentInput {
  subjectType?: "employee" | "contractor" | null;
  subjectId?: string | null;
  category: EmployeePaymentRow["category"];
  amount: number;
  date: string;
  competenceDate?: string | null;
  description: string;
  cashMovementId?: string | null;
  notes?: string | null;
}

/**
 * Idempotente por `cashMovementId` quando informado — um mesmo fato financeiro (`cash_movement`)
 * nunca deve virar dois registros semânticos no DP, mesmo que a função seja chamada de novo (ex.:
 * reprocessamento de um lote, retry). Sem `cashMovementId` (ex.: futuro pagamento 100% dentro do
 * DP antes de existir o lançamento financeiro), não há chave determinística ainda — cada chamada
 * cria um registro novo, responsabilidade do chamador não repetir.
 */
export async function createEmployeePayment(input: CreateEmployeePaymentInput): Promise<EmployeePaymentRow> {
  if (input.cashMovementId) {
    const [existing] = await db().select().from(employeePayments).where(eq(employeePayments.cashMovementId, input.cashMovementId)).limit(1);
    if (existing) return existing;
  }

  const [row] = await db()
    .insert(employeePayments)
    .values({
      subjectType: input.subjectType ?? null,
      subjectId: input.subjectId ?? null,
      category: input.category,
      amount: String(input.amount),
      date: input.date,
      competenceDate: input.competenceDate ?? null,
      description: input.description,
      cashMovementId: input.cashMovementId ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return row;
}

/**
 * `dateFrom`/`dateTo` filtram pela data de CAIXA (`date`) — é o que `/departamento-pessoal` usa
 * por padrão (mesma lógica do Livro Caixa: agrupa pelo mês em que o dinheiro efetivamente saiu).
 * `competenceDateFrom`/`competenceDateTo` filtram pela COMPETÊNCIA (`competenceDate`) — uso
 * separado e explícito para quando a pergunta é "quanto pertence economicamente a este mês",
 * nunca misturado com o filtro de caixa na mesma chamada (Missão DP, 20/09/2026: um pagamento de
 * R$450 com `date=2026-08-31` e `competenceDate=2026-09-01` deve aparecer em agosto pelo caixa e
 * em setembro pela competência — os dois filtros respondem perguntas diferentes, nunca a mesma).
 * Um registro sem `competenceDate` nunca aparece num filtro de competência (não há como assumir a
 * qual mês ele pertenceria).
 */
export async function listEmployeePayments(filter?: { subjectId?: string; dateFrom?: string; dateTo?: string; competenceDateFrom?: string; competenceDateTo?: string }): Promise<EmployeePaymentRow[]> {
  const conditions = [eq(employeePayments.active, true)];
  if (filter?.subjectId) conditions.push(eq(employeePayments.subjectId, filter.subjectId));
  if (filter?.dateFrom) conditions.push(gte(employeePayments.date, filter.dateFrom));
  if (filter?.dateTo) conditions.push(lte(employeePayments.date, filter.dateTo));
  if (filter?.competenceDateFrom) conditions.push(gte(employeePayments.competenceDate, filter.competenceDateFrom));
  if (filter?.competenceDateTo) conditions.push(lte(employeePayments.competenceDate, filter.competenceDateTo));
  return db()
    .select()
    .from(employeePayments)
    .where(and(...conditions))
    .orderBy(desc(employeePayments.date));
}

export interface CreateEmployeeAdvanceInput {
  subjectType: "employee" | "contractor";
  subjectId: string;
  amount: number;
  date: string;
  reason?: string | null;
  cashMovementId?: string | null;
  employeePaymentId?: string | null;
}

/** Idempotente por `cashMovementId`, mesmo raciocínio de `createEmployeePayment` acima. */
export async function createEmployeeAdvance(input: CreateEmployeeAdvanceInput): Promise<EmployeeAdvanceRow> {
  if (input.cashMovementId) {
    const [existing] = await db().select().from(employeeAdvances).where(eq(employeeAdvances.cashMovementId, input.cashMovementId)).limit(1);
    if (existing) return existing;
  }

  const [row] = await db()
    .insert(employeeAdvances)
    .values({
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      amount: String(input.amount),
      date: input.date,
      reason: input.reason ?? null,
      status: "aberto",
      compensatedAmount: "0",
      cashMovementId: input.cashMovementId ?? null,
      employeePaymentId: input.employeePaymentId ?? null,
    })
    .returning();
  return row;
}

export async function listEmployeeAdvances(subjectId?: string): Promise<EmployeeAdvanceRow[]> {
  const conditions = [eq(employeeAdvances.active, true)];
  if (subjectId) conditions.push(eq(employeeAdvances.subjectId, subjectId));
  return db()
    .select()
    .from(employeeAdvances)
    .where(and(...conditions))
    .orderBy(desc(employeeAdvances.date));
}

export async function listOpenEmployeeAdvances(): Promise<EmployeeAdvanceRow[]> {
  return db()
    .select()
    .from(employeeAdvances)
    .where(and(eq(employeeAdvances.active, true), or(eq(employeeAdvances.status, "aberto"), eq(employeeAdvances.status, "parcialmente_compensado"))));
}

/** Aplica uma compensação usando a lógica pura de advances.ts — nunca deixa o saldo/estado divergir. */
export async function compensateEmployeeAdvance(advanceId: string, compensationAmount: number, compensatedAt: string): Promise<EmployeeAdvanceRow> {
  const [existing] = await db().select().from(employeeAdvances).where(eq(employeeAdvances.id, advanceId)).limit(1);
  if (!existing) throw new Error(`Adiantamento não encontrado: ${advanceId}`);

  const state: EmployeeAdvanceState = { amount: Number(existing.amount), compensatedAmount: Number(existing.compensatedAmount) };
  const result = applyAdvanceCompensation(state, compensationAmount);

  const [updated] = await db()
    .update(employeeAdvances)
    .set({ compensatedAmount: String(result.compensatedAmount), status: result.status, compensatedAt, updatedAt: new Date() })
    .where(eq(employeeAdvances.id, advanceId))
    .returning();
  return updated;
}

export async function listEmployeeDocuments(subjectType: "employee" | "contractor", subjectId: string): Promise<EmployeeDocumentRow[]> {
  return db()
    .select()
    .from(employeeDocuments)
    .where(and(eq(employeeDocuments.subjectType, subjectType), eq(employeeDocuments.subjectId, subjectId), eq(employeeDocuments.active, true)));
}
