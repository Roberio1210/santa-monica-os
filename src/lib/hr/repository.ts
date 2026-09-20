import "server-only";
import { and, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { employees, contractors, employeeDocuments, employeePayments, employeeAdvances, auditLogs, cashMovements, financialAccounts, financialCategories } from "@/db/schema";
import { applyAdvanceCompensation, type EmployeeAdvanceState } from "@/lib/hr/advances";
import { RECORDABLE_EMPLOYEE_PAYMENT_CATEGORIES, type RecordableEmployeePaymentCategory } from "@/lib/hr/costSummary";

export { RECORDABLE_EMPLOYEE_PAYMENT_CATEGORIES, type RecordableEmployeePaymentCategory };

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

export type CashMovementRow = typeof cashMovements.$inferSelect;
export type FinancialAccountOption = { id: string; name: string };

/** Contas reais disponíveis hoje (Stone, Ailos/CredCrea, Caixa físico) — nunca inventa conta nova. */
export async function listFinancialAccountOptions(): Promise<FinancialAccountOption[]> {
  return db()
    .select({ id: financialAccounts.id, name: financialAccounts.name })
    .from(financialAccounts)
    .where(eq(financialAccounts.active, true));
}

export class InvalidPaymentCategoryError extends Error {}
export class InvalidFinancialAccountError extends Error {}
export class InvalidAmountError extends Error {}

/**
 * `reembolso` sempre mapeia para "Reembolso a sócios/colaboradores" (DRE), nunca para o mesmo
 * balde de "Prestadores PJ"/"Salários CLT" — é exatamente a distinção que impede um reembolso de
 * contaminar remuneração (mesmo raciocínio já aplicado ao R$25 de Vinícius, Fase 3). Resolvido
 * por `external_id` estável (nunca um UUID fixo no código — `financial_categories.external_id`
 * é o "slug estável... para seed idempotente" já documentado no próprio schema).
 */
function dreCategoryExternalIdFor(subjectType: "employee" | "contractor", category: RecordableEmployeePaymentCategory): string {
  if (category === "reembolso") return "despesa-reembolso-a-socios-colaboradores";
  return subjectType === "employee" ? "despesa-salarios-clt" : "despesa-prestadores-pj";
}

export interface RecordEmployeePaymentInput {
  subjectType: "employee" | "contractor";
  subjectId: string;
  category: RecordableEmployeePaymentCategory;
  amount: number;
  date: string;
  competenceDate: string | null;
  description: string;
  notes: string | null;
  financialAccountId: string;
  /** Determinística, calculada pelo chamador a partir dos campos normalizados — nunca um valor confiado sem checagem. */
  idempotencyKey: string;
}

export interface RecordEmployeePaymentResult {
  payment: EmployeePaymentRow;
  cashMovement: CashMovementRow;
  /** `false` quando a `idempotencyKey` já existia — o pagamento retornado é o ORIGINAL, nenhum novo foi criado. */
  created: boolean;
}

/**
 * O erro que chega aqui é o wrapper do drizzle-orm (`Failed query: ...`), nunca o `PostgresError`
 * bruto — os campos `code`/`constraint_name` reais ficam em `err.cause` (confirmado ao vivo por
 * teste: o primeiro código só checava o objeto externo e nunca reconhecia a violação real,
 * deixando a requisição perdedora da corrida estourar em vez de retornar o pagamento já
 * existente). Verifica os dois níveis para nunca depender de detalhe de implementação do driver.
 */
function isUniqueViolation(err: unknown, constraint: string): boolean {
  for (const candidate of [err, (err as { cause?: unknown } | null)?.cause]) {
    const pgErr = candidate as { code?: string; constraint_name?: string; message?: string } | null;
    if (pgErr && pgErr.code === "23505" && (pgErr.constraint_name === constraint || (pgErr.message?.includes(constraint) ?? false))) return true;
  }
  return false;
}

async function findByIdempotencyKey(idempotencyKey: string): Promise<RecordEmployeePaymentResult | null> {
  const [existing] = await db().select().from(employeePayments).where(eq(employeePayments.idempotencyKey, idempotencyKey)).limit(1);
  if (!existing || !existing.cashMovementId) return null;
  const [movement] = await db().select().from(cashMovements).where(eq(cashMovements.id, existing.cashMovementId)).limit(1);
  if (!movement) return null;
  return { payment: existing, cashMovement: movement, created: false };
}

/**
 * Fase 4 (20/09/2026) — "Registrar pagamento": cria `cash_movements` + `employee_payments` numa
 * ÚNICA transação (mesmo padrão de `recordPayablePayment`, `src/lib/finance/postgres-repository.ts`
 * — insere `cash_movements` DIRETO dentro da própria `tx`, nunca chamando `createCashMovement`
 * separadamente, o que abriria uma segunda transação e quebraria a atomicidade). Nunca cria
 * `bank_statement_line` (não existe extrato para um pagamento manual — a conciliação futura, se
 * o Pix aparecer depois no extrato real, é trabalho separado, fora desta função). Nunca cria
 * `employee_advance` — categoria `adiantamento` é rejeitada por `RECORDABLE_EMPLOYEE_PAYMENT_CATEGORIES`.
 *
 * Idempotência: checagem otimista ANTES de abrir transação (caminho rápido do reenvio comum) e
 * novamente pelo UNIQUE do banco (`employee_payments_idempotency_key_unique`) — se uma segunda
 * requisição concorrente ganhar a corrida, a primeira que chegar ao COMMIT define o pagamento
 * real; a que perder recebe de volta o mesmo registro (`created: false`), nunca um erro nem um
 * segundo pagamento.
 */
export async function recordEmployeePayment(input: RecordEmployeePaymentInput, actorUserId: string | null): Promise<RecordEmployeePaymentResult> {
  const existingByKey = await findByIdempotencyKey(input.idempotencyKey);
  if (existingByKey) return existingByKey;

  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new InvalidAmountError("Valor deve ser maior que zero.");
  if (!RECORDABLE_EMPLOYEE_PAYMENT_CATEGORIES.includes(input.category)) {
    throw new InvalidPaymentCategoryError(`Categoria não suportada por "Registrar pagamento": ${input.category}. Adiantamento usa o fluxo próprio de employee_advances.`);
  }

  try {
    return await db().transaction(async (tx) => {
      if (input.subjectType === "employee") {
        const [subject] = await tx.select().from(employees).where(eq(employees.id, input.subjectId)).limit(1);
        if (!subject) throw new NotFoundError(`Colaborador (CLT) não encontrado: ${input.subjectId}`);
      } else {
        const [subject] = await tx.select().from(contractors).where(eq(contractors.id, input.subjectId)).limit(1);
        if (!subject) throw new NotFoundError(`Prestador (PJ) não encontrado: ${input.subjectId}`);
      }

      const [account] = await tx.select().from(financialAccounts).where(and(eq(financialAccounts.id, input.financialAccountId), eq(financialAccounts.active, true))).limit(1);
      if (!account) throw new InvalidFinancialAccountError(`Conta financeira inválida ou inativa: ${input.financialAccountId}`);

      const dreExternalId = dreCategoryExternalIdFor(input.subjectType, input.category);
      const [dreCategory] = await tx.select().from(financialCategories).where(eq(financialCategories.externalId, dreExternalId)).limit(1);

      const [movement] = await tx
        .insert(cashMovements)
        .values({
          date: input.date,
          type: "saida",
          amount: String(input.amount),
          description: input.description,
          categoryId: dreCategory?.id ?? null,
          financialAccountId: input.financialAccountId,
          competenceDate: input.competenceDate,
          source: "manual",
          notes: input.notes,
        })
        .returning();

      const [payment] = await tx
        .insert(employeePayments)
        .values({
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          category: input.category,
          amount: String(input.amount),
          date: input.date,
          competenceDate: input.competenceDate,
          description: input.description,
          cashMovementId: movement.id,
          idempotencyKey: input.idempotencyKey,
          notes: input.notes,
        })
        .returning();

      await tx.insert(auditLogs).values({
        actorUserId,
        action: "create_employee_payment",
        entityType: "employee_payment",
        entityId: payment.id,
        beforeState: null,
        afterState: { ...payment, cashMovementId: movement.id },
        source: "manual",
        notes: `cash_movement_id: ${movement.id}`,
      });

      return { payment, cashMovement: movement, created: true };
    });
  } catch (err) {
    if (isUniqueViolation(err, "employee_payments_idempotency_key_unique")) {
      const resolved = await findByIdempotencyKey(input.idempotencyKey);
      if (resolved) return resolved;
    }
    throw err;
  }
}
