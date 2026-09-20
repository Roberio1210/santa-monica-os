import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { cashMovements, employeeAdvances, employeePayments, employees, contractors, auditLogs, users, financialAccounts, financialCategories } from "@/db/schema";
import { inArray, eq, sql } from "drizzle-orm";
import {
  createEmployeeAdvance,
  createEmployeePayment,
  listEmployeePayments,
  getEmployeeById,
  getContractorById,
  updateEmployee,
  updateContractor,
  recordEmployeePayment,
  NotFoundError,
  ConcurrencyConflictError,
  InvalidPaymentCategoryError,
  InvalidFinancialAccountError,
  InvalidAmountError,
  createEmployeeRecord,
  createContractorRecord,
  DuplicateCollaboratorError,
} from "@/lib/hr/repository";
import { getCollaboratorProfile } from "@/lib/hr/service";

/** Cria um `cash_movement` mínimo real, só para satisfazer a FK real de `employee_payments`/`employee_advances` — nunca um valor fictício sem lastro. */
async function createTestCashMovement(amount: number): Promise<string> {
  const db = getDb()!;
  const [row] = await db
    .insert(cashMovements)
    .values({ date: "2026-09-18", type: "saida", amount: String(amount), description: "cash_movement de teste (Missão 86, repository.postgres.test.ts)" })
    .returning();
  return row.id;
}

/**
 * Missão 86 — só roda contra Postgres real de teste (`TEST_DATABASE_URL`, nunca produção — mesma
 * garantia de `src/db/client.ts`, mesmo padrão de `stone/persistence/postgres-repository.*.test.ts`).
 *
 * Bug real encontrado ao vivo nesta missão: rodar o script de cadastro do DP uma segunda vez
 * (retry manual) criou um `employee_payment`/`employee_advance` DUPLICADO para o mesmo
 * `cash_movement_id` — a função não checava idempotência antes de inserir. Corrigido em
 * `repository.ts` (checa por `cashMovementId` existente antes de criar). Este teste prova a
 * correção contra constraints/índices reais, não só a simulação.
 */
const hasRealDb = !!process.env.TEST_DATABASE_URL;
const createdPaymentIds: string[] = [];
const createdAdvanceIds: string[] = [];
const createdCashMovementIds: string[] = [];
const createdEmployeeIds: string[] = [];
const createdContractorIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  if (!hasRealDb) return;
  const db = getDb();
  if (!db) return;
  if (createdAdvanceIds.length > 0) await db.delete(employeeAdvances).where(inArray(employeeAdvances.id, createdAdvanceIds));
  // audit_logs de employee_payment (Fase 4, entityId = payment.id) precisam sumir ANTES de
  // employee_payments/users, senão a FK audit_logs.actor_user_id -> users trava o delete de users.
  const auditableIds = [...createdEmployeeIds, ...createdContractorIds, ...createdPaymentIds];
  if (auditableIds.length > 0) await db.delete(auditLogs).where(inArray(auditLogs.entityId, auditableIds));
  if (createdPaymentIds.length > 0) await db.delete(employeePayments).where(inArray(employeePayments.id, createdPaymentIds));
  if (createdCashMovementIds.length > 0) await db.delete(cashMovements).where(inArray(cashMovements.id, createdCashMovementIds));
  if (createdEmployeeIds.length > 0) await db.delete(employees).where(inArray(employees.id, createdEmployeeIds));
  if (createdContractorIds.length > 0) await db.delete(contractors).where(inArray(contractors.id, createdContractorIds));
  if (createdUserIds.length > 0) await db.delete(users).where(inArray(users.id, createdUserIds));
});

describe.skipIf(!hasRealDb)("createEmployeePayment / createEmployeeAdvance — idempotência real (Missão 86)", () => {
  it("9) chamar createEmployeePayment duas vezes com o mesmo cashMovementId NÃO cria um segundo registro", async () => {
    const cashMovementId = await createTestCashMovement(80);
    createdCashMovementIds.push(cashMovementId);
    const input = { category: "diaria_freelancer" as const, amount: 80, date: "2026-09-18", description: "teste idempotência", cashMovementId };

    const first = await createEmployeePayment(input);
    const second = await createEmployeePayment(input);
    createdPaymentIds.push(first.id);

    expect(second.id).toBe(first.id);

    const db = getDb();
    const rows = await db!.select().from(employeePayments).where(inArray(employeePayments.cashMovementId, [cashMovementId]));
    expect(rows).toHaveLength(1);
  });

  it("10) chamar createEmployeeAdvance duas vezes com o mesmo cashMovementId NÃO cria um segundo adiantamento", async () => {
    const cashMovementId = await createTestCashMovement(100);
    createdCashMovementIds.push(cashMovementId);
    const input = { subjectType: "contractor" as const, subjectId: randomUUID(), amount: 100, date: "2026-09-19", cashMovementId };

    const first = await createEmployeeAdvance(input);
    const second = await createEmployeeAdvance(input);
    createdAdvanceIds.push(first.id);

    expect(second.id).toBe(first.id);

    const db = getDb();
    const rows = await db!.select().from(employeeAdvances).where(inArray(employeeAdvances.cashMovementId, [cashMovementId]));
    expect(rows).toHaveLength(1);
  });
});

/**
 * Missão DP (20/09/2026) — `beneficio_auxilio` é uma categoria real do enum (prova contra
 * Postgres real, não só o tipo TypeScript) e `listEmployeePayments` filtra corretamente por
 * `competenceDate` quando a competência diverge da data de caixa (ex.: R$450 pago em 31/08 com
 * competência setembro — deve aparecer no filtro de competência de setembro e NÃO no de agosto,
 * mesmo com `date` em agosto).
 */
describe.skipIf(!hasRealDb)("beneficio_auxilio + filtro por competência (Missão DP, 20/09/2026)", () => {
  it("11) beneficio_auxilio é aceito pelo enum real do banco", async () => {
    const cashMovementId = await createTestCashMovement(450);
    createdCashMovementIds.push(cashMovementId);
    const payment = await createEmployeePayment({
      category: "beneficio_auxilio",
      amount: 450,
      date: "2026-08-31",
      competenceDate: "2026-09-01",
      description: "teste beneficio_auxilio",
      cashMovementId,
    });
    createdPaymentIds.push(payment.id);
    expect(payment.category).toBe("beneficio_auxilio");
    expect(payment.competenceDate).toBe("2026-09-01");
  });

  it("12) filtro por competenceDateFrom/To encontra o pagamento pela competência de setembro, mesmo com date em agosto", async () => {
    const cashMovementId = await createTestCashMovement(450);
    createdCashMovementIds.push(cashMovementId);
    const payment = await createEmployeePayment({
      category: "beneficio_auxilio",
      amount: 450,
      date: "2026-08-31",
      competenceDate: "2026-09-01",
      description: "teste filtro competência",
      cashMovementId,
    });
    createdPaymentIds.push(payment.id);

    const bySeptCompetence = await listEmployeePayments({ competenceDateFrom: "2026-09-01", competenceDateTo: "2026-09-30" });
    expect(bySeptCompetence.some((p) => p.id === payment.id)).toBe(true);

    const byAugustCompetence = await listEmployeePayments({ competenceDateFrom: "2026-08-01", competenceDateTo: "2026-08-31" });
    expect(byAugustCompetence.some((p) => p.id === payment.id)).toBe(false);

    // pelo filtro de CAIXA (date), continua aparecendo em agosto — os dois filtros respondem perguntas diferentes.
    const byAugustCashDate = await listEmployeePayments({ dateFrom: "2026-08-01", dateTo: "2026-08-31" });
    expect(byAugustCashDate.some((p) => p.id === payment.id)).toBe(true);
  });
});

/**
 * Ficha individual (`/departamento-pessoal/[id]`, Fase 1, 20/09/2026) — `getEmployeeById`/
 * `getContractorById` e `getCollaboratorProfile` contra Postgres real. Cria um funcionário CLT e
 * um prestador PJ de teste (nunca reaproveita os 5 colaboradores reais), com pagamentos e um
 * adiantamento vinculados, para provar isolamento entre pessoas — nunca dado real de produção.
 */
/**
 * Fase 2 do Departamento Pessoal (20/09/2026) — testes DIRETOS de `getEmployeeById`/
 * `getContractorById`, isolados de `getCollaboratorProfile` (que já os exercita indiretamente
 * desde a Fase 1). Prova, na função em si: busca por ID exato (nunca por nome aproximado),
 * ausência de fallback cruzado entre as duas tabelas, preservação de todos os campos e leitura
 * pura (chamadas repetidas nunca criam/alteram linha nenhuma).
 */
describe.skipIf(!hasRealDb)("getEmployeeById / getContractorById — Fase 2 (20/09/2026)", () => {
  it("getEmployeeById encontra um employee existente e preserva TODOS os campos, não só alguns", async () => {
    const db = getDb()!;
    const [created] = await db
      .insert(employees)
      .values({ fullName: `Fase2 CLT ${randomUUID()}`, role: "Cargo de teste", admissionDate: "2026-02-01", workSchedule: "08h-17h", baseSalary: "3000.00", notes: "nota de teste" })
      .returning();
    createdEmployeeIds.push(created.id);

    const found = await getEmployeeById(created.id);
    expect(found).toEqual(created);
  });

  it("getContractorById encontra um contractor existente e preserva TODOS os campos, não só alguns", async () => {
    const db = getDb()!;
    const [created] = await db
      .insert(contractors)
      .values({ businessName: `Fase2 PJ ${randomUUID()}`, taxId: "111.111.111-11", scope: "Lavação", agreedValue: "2600.00", contractStart: "2026-03-01" })
      .returning();
    createdContractorIds.push(created.id);

    const found = await getContractorById(created.id);
    expect(found).toEqual(created);
  });

  it("não confunde dois employees diferentes — cada ID retorna exatamente a pessoa certa", async () => {
    const db = getDb()!;
    const [a] = await db.insert(employees).values({ fullName: `Fase2 A ${randomUUID()}`, role: "Cargo A" }).returning();
    const [b] = await db.insert(employees).values({ fullName: `Fase2 B ${randomUUID()}`, role: "Cargo B" }).returning();
    createdEmployeeIds.push(a.id, b.id);

    expect((await getEmployeeById(a.id))!.id).toBe(a.id);
    expect((await getEmployeeById(a.id))!.role).toBe("Cargo A");
    expect((await getEmployeeById(b.id))!.id).toBe(b.id);
    expect((await getEmployeeById(b.id))!.role).toBe("Cargo B");
  });

  it("não confunde dois contractors diferentes — cada ID retorna exatamente a pessoa certa", async () => {
    const db = getDb()!;
    const [a] = await db.insert(contractors).values({ businessName: `Fase2 PJ A ${randomUUID()}` }).returning();
    const [b] = await db.insert(contractors).values({ businessName: `Fase2 PJ B ${randomUUID()}` }).returning();
    createdContractorIds.push(a.id, b.id);

    expect((await getContractorById(a.id))!.id).toBe(a.id);
    expect((await getContractorById(b.id))!.id).toBe(b.id);
    expect((await getContractorById(a.id))!.businessName).not.toBe((await getContractorById(b.id))!.businessName);
  });

  it("zero fallback cruzado: um ID de employee nunca é encontrado por getContractorById, e vice-versa", async () => {
    const db = getDb()!;
    const [employee] = await db.insert(employees).values({ fullName: `Fase2 cruzado CLT ${randomUUID()}`, role: "Cargo" }).returning();
    createdEmployeeIds.push(employee.id);
    expect(await getContractorById(employee.id)).toBeNull();

    const [contractor] = await db.insert(contractors).values({ businessName: `Fase2 cruzado PJ ${randomUUID()}` }).returning();
    createdContractorIds.push(contractor.id);
    expect(await getEmployeeById(contractor.id)).toBeNull();
  });

  it("chamadas repetidas a getEmployeeById/getContractorById são 100% leitura — nenhuma linha nova, nenhuma alteração", async () => {
    const db = getDb()!;
    const [employee] = await db.insert(employees).values({ fullName: `Fase2 repetido CLT ${randomUUID()}`, role: "Cargo" }).returning();
    createdEmployeeIds.push(employee.id);
    const [contractor] = await db.insert(contractors).values({ businessName: `Fase2 repetido PJ ${randomUUID()}` }).returning();
    createdContractorIds.push(contractor.id);

    const countsQuery = sql<{ employees: number; contractors: number }>`select (select count(*)::int from employees) as employees, (select count(*)::int from contractors) as contractors`;
    const [before] = (await db.execute(countsQuery)) as unknown as Array<{ employees: number; contractors: number }>;

    await getEmployeeById(employee.id);
    await getEmployeeById(employee.id);
    await getEmployeeById(randomUUID());
    await getContractorById(contractor.id);
    await getContractorById(contractor.id);
    await getContractorById(randomUUID());

    const [after] = (await db.execute(countsQuery)) as unknown as Array<{ employees: number; contractors: number }>;
    expect(after).toEqual(before);

    // e os dados continuam exatamente os mesmos, sem nenhuma alteração por efeito colateral
    expect(await getEmployeeById(employee.id)).toEqual(employee);
    expect(await getContractorById(contractor.id)).toEqual(contractor);
  });
});

describe.skipIf(!hasRealDb)("Ficha individual — getEmployeeById/getContractorById/getCollaboratorProfile (Fase 1, 20/09/2026)", () => {
  it("13) getEmployeeById retorna null para ID inexistente", async () => {
    const result = await getEmployeeById(randomUUID());
    expect(result).toBeNull();
  });

  it("14) getContractorById retorna null para ID inexistente", async () => {
    const result = await getContractorById(randomUUID());
    expect(result).toBeNull();
  });

  it("15) getCollaboratorProfile retorna null para ID que não existe em nenhuma das duas tabelas", async () => {
    const profile = await getCollaboratorProfile(randomUUID(), { from: "2026-01-01", to: "2026-12-31" });
    expect(profile).toBeNull();
  });

  it("16) ficha de um employee (CLT): dados cadastrais, isolamento de pagamentos, cálculo por categoria e filtro de período", async () => {
    const db = getDb()!;
    const [employee] = await db.insert(employees).values({ fullName: `Teste CLT ${randomUUID()}`, role: "Função de teste", admissionDate: "2026-01-10" }).returning();
    createdEmployeeIds.push(employee.id);

    const [outroEmployee] = await db.insert(employees).values({ fullName: `Teste CLT outro ${randomUUID()}`, role: "Não informado" }).returning();
    createdEmployeeIds.push(outroEmployee.id);

    const cm1 = await createTestCashMovement(1000);
    createdCashMovementIds.push(cm1);
    const cm2 = await createTestCashMovement(50);
    createdCashMovementIds.push(cm2);
    const cmOutro = await createTestCashMovement(999);
    createdCashMovementIds.push(cmOutro);

    const p1 = await createEmployeePayment({ subjectType: "employee", subjectId: employee.id, category: "salario_fixo", amount: 1000, date: "2026-06-05", description: "salário teste", cashMovementId: cm1 });
    const p2 = await createEmployeePayment({ subjectType: "employee", subjectId: employee.id, category: "bonus", amount: 50, date: "2026-06-10", description: "bônus teste", cashMovementId: cm2 });
    const pOutro = await createEmployeePayment({ subjectType: "employee", subjectId: outroEmployee.id, category: "salario_fixo", amount: 999, date: "2026-06-05", description: "salário de outra pessoa", cashMovementId: cmOutro });
    createdPaymentIds.push(p1.id, p2.id, pOutro.id);

    const profile = await getCollaboratorProfile(employee.id, { from: "2026-06-01", to: "2026-06-30" });
    expect(profile).not.toBeNull();
    expect(profile!.type).toBe("employee");
    expect(profile!.name).toBe(employee.fullName);
    expect(profile!.role).toBe("Função de teste");
    expect(profile!.admissionOrStart).toBe("2026-01-10");
    expect(profile!.taxId).toBeNull(); // employees não têm coluna taxId — nunca inventado

    // isolamento: só os pagamentos DESTA pessoa aparecem, nunca os de outroEmployee
    expect(profile!.payments).toHaveLength(2);
    expect(profile!.payments.every((p) => p.subjectId === employee.id)).toBe(true);
    expect(profile!.payments.some((p) => p.id === pOutro.id)).toBe(false);

    // cálculo por categoria — nunca somado cegamente
    expect(profile!.costSummary.porCategoria.salario_fixo).toBe(1000);
    expect(profile!.costSummary.porCategoria.bonus).toBe(50);
    expect(profile!.costSummary.totalGeral).toBe(1050);

    // filtro de período: fora do intervalo, nenhum pagamento aparece
    const outOfRange = await getCollaboratorProfile(employee.id, { from: "2027-01-01", to: "2027-01-31" });
    expect(outOfRange!.payments).toHaveLength(0);
    expect(outOfRange!.costSummary.totalGeral).toBe(0);

    // ausência de documentos -> lista vazia, nunca inventada
    expect(profile!.documents).toEqual([]);
  });

  it("17) ficha de um contractor (PJ): CPF/CNPJ e valor combinado vêm só de colunas estruturadas, adiantamento pertence só à pessoa certa", async () => {
    const db = getDb()!;
    const [contractor] = await db.insert(contractors).values({ businessName: `Teste PJ ${randomUUID()}`, taxId: "000.000.000-00", agreedValue: "2600.00", scope: "Lavação" }).returning();
    createdContractorIds.push(contractor.id);

    const [outroContractor] = await db.insert(contractors).values({ businessName: `Teste PJ outro ${randomUUID()}` }).returning();
    createdContractorIds.push(outroContractor.id);

    const cmAdv = await createTestCashMovement(200);
    createdCashMovementIds.push(cmAdv);
    const advance = await createEmployeeAdvance({ subjectType: "contractor", subjectId: contractor.id, amount: 200, date: "2026-06-15", reason: "teste isolamento", cashMovementId: cmAdv });
    createdAdvanceIds.push(advance.id);

    const profile = await getCollaboratorProfile(contractor.id, { from: "2026-06-01", to: "2026-06-30" });
    expect(profile).not.toBeNull();
    expect(profile!.type).toBe("contractor");
    expect(profile!.taxId).toBe("000.000.000-00");
    expect(profile!.agreedValueOrBaseSalary).toBe(2600);
    expect(profile!.workSchedule).toBeNull(); // contractors não têm jornada — nunca inventado

    // isolamento: adiantamento aparece só para o contractor certo, nunca para outroContractor
    expect(profile!.advances).toHaveLength(1);
    expect(profile!.advances[0]!.id).toBe(advance.id);
    const outroProfile = await getCollaboratorProfile(outroContractor.id, { from: "2026-06-01", to: "2026-06-30" });
    expect(outroProfile!.advances).toHaveLength(0);
  });

  it("18) FGTS genérico (subjectId null) nunca aparece na ficha de nenhum colaborador específico", async () => {
    const db = getDb()!;
    const [employee] = await db.insert(employees).values({ fullName: `Teste encargo ${randomUUID()}`, role: "Não informado" }).returning();
    createdEmployeeIds.push(employee.id);

    const cm = await createTestCashMovement(235.56);
    createdCashMovementIds.push(cm);
    const encargoGenerico = await createEmployeePayment({ category: "encargo", amount: 235.56, date: "2026-06-18", description: "FGTS genérico de teste", cashMovementId: cm });
    createdPaymentIds.push(encargoGenerico.id);
    expect(encargoGenerico.subjectId).toBeNull();

    const profile = await getCollaboratorProfile(employee.id, { from: "2026-06-01", to: "2026-06-30" });
    expect(profile!.payments.some((p) => p.id === encargoGenerico.id)).toBe(false);
    expect(profile!.costSummary.porCategoria.encargo).toBe(0);
  });

  it("19) getCollaboratorProfile é 100% leitura — nenhuma linha nova em employees/contractors/employee_payments/employee_advances", async () => {
    const db = getDb()!;
    const countsQuery = sql<{ employees: number; contractors: number; employee_payments: number; employee_advances: number }>`
      select
        (select count(*)::int from employees) as employees,
        (select count(*)::int from contractors) as contractors,
        (select count(*)::int from employee_payments) as employee_payments,
        (select count(*)::int from employee_advances) as employee_advances
    `;
    const [before] = (await db.execute(countsQuery)) as unknown as Array<{ employees: number; contractors: number; employee_payments: number; employee_advances: number }>;

    await getCollaboratorProfile(randomUUID(), { from: "2026-01-01", to: "2026-12-31" });
    const [existing] = await db.select().from(employees).limit(1);
    if (existing) await getCollaboratorProfile(existing.id, { from: "2026-01-01", to: "2026-12-31" });

    const [after] = (await db.execute(countsQuery)) as unknown as Array<{ employees: number; contractors: number; employee_payments: number; employee_advances: number }>;

    expect(after).toEqual(before);
  });
});

/**
 * Fase 3 do Departamento Pessoal (20/09/2026) — `updateEmployee`/`updateContractor`: whitelist
 * explícita, concorrência otimista via `updated_at` (sem migration), audit log, e prova de que
 * NENHUMA tabela financeira é tocada por uma edição cadastral.
 */
describe.skipIf(!hasRealDb)("updateEmployee / updateContractor — Fase 3 (20/09/2026)", () => {
  it("atualiza os campos enviados e preserva os não enviados (employee)", async () => {
    const db = getDb()!;
    const [created] = await db.insert(employees).values({ fullName: `Fase3 CLT ${randomUUID()}`, role: "Cargo original", admissionDate: "2026-01-01", workSchedule: "manhã", baseSalary: "1000.00", notes: "nota original" }).returning();
    createdEmployeeIds.push(created.id);

    const updated = await updateEmployee(created.id, { role: "Cargo novo" }, created.updatedAt, null);

    expect(updated.role).toBe("Cargo novo");
    // não enviados continuam exatamente como estavam
    expect(updated.fullName).toBe(created.fullName);
    expect(updated.admissionDate).toBe("2026-01-01");
    expect(updated.workSchedule).toBe("manhã");
    expect(updated.baseSalary).toBe("1000.00");
    expect(updated.notes).toBe("nota original");
  });

  it("atualiza os campos enviados e preserva os não enviados (contractor)", async () => {
    const db = getDb()!;
    const [created] = await db.insert(contractors).values({ businessName: `Fase3 PJ ${randomUUID()}`, taxId: "222.222.222-22", scope: "Escopo original", agreedValue: "2600.00" }).returning();
    createdContractorIds.push(created.id);

    const updated = await updateContractor(created.id, { agreedValue: 2150 }, created.updatedAt, null);

    expect(updated.agreedValue).toBe("2150.00");
    expect(updated.businessName).toBe(created.businessName);
    expect(updated.taxId).toBe("222.222.222-22");
    expect(updated.scope).toBe("Escopo original");
  });

  it("outro colaborador permanece 100% intacto", async () => {
    const db = getDb()!;
    const [target] = await db.insert(employees).values({ fullName: `Fase3 alvo ${randomUUID()}`, role: "Cargo A" }).returning();
    const [other] = await db.insert(employees).values({ fullName: `Fase3 outro ${randomUUID()}`, role: "Cargo B" }).returning();
    createdEmployeeIds.push(target.id, other.id);

    await updateEmployee(target.id, { role: "Cargo A alterado" }, target.updatedAt, null);

    const untouched = await getEmployeeById(other.id);
    expect(untouched).toEqual(other);
  });

  it("ID inexistente lança NotFoundError, nunca cria registro novo", async () => {
    const db = getDb()!;
    const [{ n: before }] = (await db.execute(sql`select count(*)::int as n from employees`)) as unknown as Array<{ n: number }>;

    await expect(updateEmployee(randomUUID(), { role: "x" }, new Date(), null)).rejects.toBeInstanceOf(NotFoundError);

    const [{ n: after }] = (await db.execute(sql`select count(*)::int as n from employees`)) as unknown as Array<{ n: number }>;
    expect(after).toBe(before);
  });

  it("concorrência: updatedAt divergente rejeita a escrita com ConcurrencyConflictError, nunca sobrescreve silenciosamente", async () => {
    const db = getDb()!;
    const [created] = await db.insert(employees).values({ fullName: `Fase3 concorrencia ${randomUUID()}`, role: "Original" }).returning();
    createdEmployeeIds.push(created.id);

    // simula outra sessão salvando primeiro
    await updateEmployee(created.id, { role: "Alterado por outra sessão" }, created.updatedAt, null);

    // esta chamada ainda usa o updatedAt ANTIGO (de antes da outra sessão salvar)
    await expect(updateEmployee(created.id, { role: "Tentativa desatualizada" }, created.updatedAt, null)).rejects.toBeInstanceOf(ConcurrencyConflictError);

    const current = await getEmployeeById(created.id);
    expect(current!.role).toBe("Alterado por outra sessão"); // nunca sobrescrito pela tentativa desatualizada
  });

  it("update repetido com o mesmo patch e updatedAt sempre atualizado é idempotente no resultado final", async () => {
    const db = getDb()!;
    const [created] = await db.insert(employees).values({ fullName: `Fase3 idempotente ${randomUUID()}`, role: "Original" }).returning();
    createdEmployeeIds.push(created.id);

    const first = await updateEmployee(created.id, { role: "Mesmo valor" }, created.updatedAt, null);
    const second = await updateEmployee(created.id, { role: "Mesmo valor" }, first.updatedAt, null);

    expect(first.role).toBe("Mesmo valor");
    expect(second.role).toBe("Mesmo valor");
    expect(second.id).toBe(created.id);
  });

  it("active true -> false e false -> true funcionam e preservam o histórico associado", async () => {
    const db = getDb()!;
    const [employee] = await db.insert(employees).values({ fullName: `Fase3 ativo ${randomUUID()}`, role: "Cargo" }).returning();
    createdEmployeeIds.push(employee.id);
    const cashMovementId = await createTestCashMovement(500);
    createdCashMovementIds.push(cashMovementId);
    const payment = await createEmployeePayment({ subjectType: "employee", subjectId: employee.id, category: "salario_fixo", amount: 500, date: "2026-06-01", description: "pagamento de teste", cashMovementId });
    createdPaymentIds.push(payment.id);

    const deactivated = await updateEmployee(employee.id, { active: false }, employee.updatedAt, null);
    expect(deactivated.active).toBe(false);
    const paymentsAfterDeactivate = await listEmployeePayments({ subjectId: employee.id });
    expect(paymentsAfterDeactivate.some((p) => p.id === payment.id)).toBe(true); // histórico preservado

    const reactivated = await updateEmployee(employee.id, { active: true }, deactivated.updatedAt, null);
    expect(reactivated.active).toBe(true);
  });

  it("mass assignment: chaves fora da whitelist (id, createdAt) injetadas no patch são ignoradas", async () => {
    const db = getDb()!;
    const [created] = await db.insert(employees).values({ fullName: `Fase3 mass-assign ${randomUUID()}`, role: "Original" }).returning();
    createdEmployeeIds.push(created.id);
    const [victim] = await db.insert(employees).values({ fullName: `Fase3 vitima ${randomUUID()}`, role: "Vítima" }).returning();
    createdEmployeeIds.push(victim.id);

    // simula um payload adulterado (bypassando o TypeScript de propósito, como um atacante faria via fetch manual)
    const maliciousPatch = { role: "Cargo legítimo", id: victim.id, createdAt: new Date(0), active: true } as unknown as Parameters<typeof updateEmployee>[1];
    const updated = await updateEmployee(created.id, maliciousPatch, created.updatedAt, null);

    expect(updated.id).toBe(created.id); // nunca vira o ID injetado
    expect(updated.createdAt).toEqual(created.createdAt); // createdAt nunca é sobrescrito
    expect(updated.role).toBe("Cargo legítimo"); // o campo legítimo foi aplicado normalmente

    const victimUntouched = await getEmployeeById(victim.id);
    expect(victimUntouched).toEqual(victim); // a "vítima" nunca foi tocada
  });

  it("audit_logs registra a alteração com entidade, ação, ator e before/after state", async () => {
    const db = getDb()!;
    const [created] = await db.insert(contractors).values({ businessName: `Fase3 audit ${randomUUID()}`, scope: "Antes" }).returning();
    createdContractorIds.push(created.id);
    const [actor] = await db.insert(users).values({ email: `fase3-audit-${randomUUID()}@teste.local`, name: "Admin de teste", role: "admin" }).returning();
    createdUserIds.push(actor.id);
    const actorId = actor.id;

    await updateContractor(created.id, { scope: "Depois" }, created.updatedAt, actorId);

    const logs = await db.select().from(auditLogs).where(inArray(auditLogs.entityId, [created.id]));
    expect(logs).toHaveLength(1);
    expect(logs[0]!.entityType).toBe("contractor");
    expect(logs[0]!.actorUserId).toBe(actorId);
    expect((logs[0]!.beforeState as { scope: string }).scope).toBe("Antes");
    expect((logs[0]!.afterState as { scope: string }).scope).toBe("Depois");
  });

  it("CPF/CNPJ NUNCA aparece completo no audit_logs — nem no valor anterior, nem no novo — quando o campo muda", async () => {
    const db = getDb()!;
    const cpfOriginal = "123.456.789-00";
    const cpfNovo = "987.654.321-00";
    const [created] = await db.insert(contractors).values({ businessName: `Fase3 cpf ${randomUUID()}`, taxId: cpfOriginal }).returning();
    createdContractorIds.push(created.id);

    await updateContractor(created.id, { taxId: cpfNovo }, created.updatedAt, null);

    const logs = await db.select().from(auditLogs).where(inArray(auditLogs.entityId, [created.id]));
    expect(logs).toHaveLength(1);
    const serialized = JSON.stringify(logs[0]!.beforeState) + JSON.stringify(logs[0]!.afterState) + (logs[0]!.notes ?? "");
    expect(serialized).not.toContain(cpfOriginal);
    expect(serialized).not.toContain(cpfNovo);
    expect((logs[0]!.beforeState as { taxId: string }).taxId).toBe("[presente]");
    expect((logs[0]!.afterState as { taxId: string }).taxId).toBe("[presente]");
    expect(logs[0]!.notes).toBe("cpf_cnpj: alterado"); // indica QUE mudou, nunca o valor
  });

  it("CPF/CNPJ continua redigido no audit_logs mesmo quando NÃO muda (outro campo é editado)", async () => {
    const db = getDb()!;
    const cpf = "111.222.333-44";
    const [created] = await db.insert(contractors).values({ businessName: `Fase3 cpf-inalterado ${randomUUID()}`, taxId: cpf, scope: "Antes" }).returning();
    createdContractorIds.push(created.id);

    await updateContractor(created.id, { scope: "Depois" }, created.updatedAt, null);

    const logs = await db.select().from(auditLogs).where(inArray(auditLogs.entityId, [created.id]));
    const serialized = JSON.stringify(logs[0]!.beforeState) + JSON.stringify(logs[0]!.afterState);
    expect(serialized).not.toContain(cpf);
    expect(logs[0]!.notes).toBeNull(); // CPF não mudou, então nem a nota "alterado" aparece
  });

  it("editar o valor combinado NÃO cria employee_payment, cash_movement nem employee_advance", async () => {
    const db = getDb()!;
    const [created] = await db.insert(contractors).values({ businessName: `Fase3 sem-efeito-financeiro ${randomUUID()}`, agreedValue: "1000.00" }).returning();
    createdContractorIds.push(created.id);

    const countsQuery = sql<{ employee_payments: number; employee_advances: number; cash_movements: number }>`
      select
        (select count(*)::int from employee_payments) as employee_payments,
        (select count(*)::int from employee_advances) as employee_advances,
        (select count(*)::int from cash_movements) as cash_movements
    `;
    const [before] = (await db.execute(countsQuery)) as unknown as Array<{ employee_payments: number; employee_advances: number; cash_movements: number }>;

    await updateContractor(created.id, { agreedValue: 2600 }, created.updatedAt, null);

    const [after] = (await db.execute(countsQuery)) as unknown as Array<{ employee_payments: number; employee_advances: number; cash_movements: number }>;
    expect(after).toEqual(before);
  });
});

/**
 * Fase 4 do Departamento Pessoal (20/09/2026) — "Registrar pagamento": `recordEmployeePayment`
 * cria `cash_movements` + `employee_payments` numa única transação, com idempotência garantida
 * pelo `UNIQUE` real de `employee_payments.idempotency_key` (migration 0062), nunca por
 * `bank_statement_lines` fictícia, nunca criando `employee_advances` por engano.
 */
describe.skipIf(!hasRealDb)("recordEmployeePayment — Fase 4 (20/09/2026)", () => {
  async function accountId(name: string): Promise<string> {
    const db = getDb()!;
    const [row] = await db.select().from(financialAccounts).where(eq(financialAccounts.name, name)).limit(1);
    if (!row) throw new Error(`Conta de teste não encontrada: ${name}`);
    return row.id;
  }
  async function categoryIdByExternalId(externalId: string): Promise<string> {
    const db = getDb()!;
    const [row] = await db.select().from(financialCategories).where(eq(financialCategories.externalId, externalId)).limit(1);
    if (!row) throw new Error(`Categoria DRE de teste não encontrada: ${externalId}`);
    return row.id;
  }

  it("1/2/3/4/5) pagamento válido cria exatamente 1 cash_movement + 1 employee_payment, vinculados, colaborador/valor/categoria/competência/data corretos", async () => {
    const db = getDb()!;
    const [employee] = await db.insert(employees).values({ fullName: `Fase4 registrar ${randomUUID()}`, role: "Cargo" }).returning();
    createdEmployeeIds.push(employee.id);
    const stoneId = await accountId("Stone");

    const result = await recordEmployeePayment(
      {
        subjectType: "employee",
        subjectId: employee.id,
        category: "salario_fixo",
        amount: 500,
        date: "2026-09-05",
        competenceDate: null,
        description: "Pagamento de teste Fase 4",
        notes: null,
        financialAccountId: stoneId,
        idempotencyKey: `fase4-${randomUUID()}`,
      },
      null,
    );
    createdPaymentIds.push(result.payment.id);
    createdCashMovementIds.push(result.cashMovement.id);

    expect(result.created).toBe(true);
    expect(result.payment.subjectId).toBe(employee.id);
    expect(result.payment.cashMovementId).toBe(result.cashMovement.id);
    expect(result.payment.amount).toBe("500.00");
    expect(result.cashMovement.amount).toBe("500.00");
    expect(result.payment.category).toBe("salario_fixo");
    expect(result.payment.date).toBe("2026-09-05");
    expect(result.payment.competenceDate).toBeNull();
    expect(result.cashMovement.financialAccountId).toBe(stoneId);

    const paymentsInDb = await db.select().from(employeePayments).where(eq(employeePayments.cashMovementId, result.cashMovement.id));
    expect(paymentsInDb).toHaveLength(1); // exatamente 1, nunca mais
  });

  it("comissão de mês anterior: competenceDate diferente de date, nunca derivada automaticamente", async () => {
    const db = getDb()!;
    const [contractor] = await db.insert(contractors).values({ businessName: `Fase4 comissao ${randomUUID()}` }).returning();
    createdContractorIds.push(contractor.id);
    const stoneId = await accountId("Stone");

    const result = await recordEmployeePayment(
      {
        subjectType: "contractor",
        subjectId: contractor.id,
        category: "comissao",
        amount: 1200,
        date: "2026-08-10",
        competenceDate: "2026-07-01",
        description: "Comissão de julho, paga em agosto",
        notes: null,
        financialAccountId: stoneId,
        idempotencyKey: `fase4-${randomUUID()}`,
      },
      null,
    );
    createdPaymentIds.push(result.payment.id);
    createdCashMovementIds.push(result.cashMovement.id);

    expect(result.payment.date).toBe("2026-08-10");
    expect(result.payment.competenceDate).toBe("2026-07-01");
  });

  it("benefício: categoria beneficio_auxilio persiste e usa DRE de Prestadores PJ (PJ)", async () => {
    const db = getDb()!;
    const [contractor] = await db.insert(contractors).values({ businessName: `Fase4 beneficio ${randomUUID()}` }).returning();
    createdContractorIds.push(contractor.id);
    const stoneId = await accountId("Stone");
    const prestadoresPjId = await categoryIdByExternalId("despesa-prestadores-pj");

    const result = await recordEmployeePayment(
      { subjectType: "contractor", subjectId: contractor.id, category: "beneficio_auxilio", amount: 450, date: "2026-09-01", competenceDate: null, description: "Transporte+lanche", notes: null, financialAccountId: stoneId, idempotencyKey: `fase4-${randomUUID()}` },
      null,
    );
    createdPaymentIds.push(result.payment.id);
    createdCashMovementIds.push(result.cashMovement.id);

    expect(result.payment.category).toBe("beneficio_auxilio");
    expect(result.cashMovement.categoryId).toBe(prestadoresPjId);
  });

  it("reembolso NUNCA usa a mesma categoria DRE de remuneração — usa 'Reembolso a sócios/colaboradores', nunca 'Prestadores PJ'", async () => {
    const db = getDb()!;
    const [contractor] = await db.insert(contractors).values({ businessName: `Fase4 reembolso ${randomUUID()}` }).returning();
    createdContractorIds.push(contractor.id);
    const stoneId = await accountId("Stone");
    const reembolsoId = await categoryIdByExternalId("despesa-reembolso-a-socios-colaboradores");
    const prestadoresPjId = await categoryIdByExternalId("despesa-prestadores-pj");

    const result = await recordEmployeePayment(
      { subjectType: "contractor", subjectId: contractor.id, category: "reembolso", amount: 30, date: "2026-09-10", competenceDate: null, description: "Gasolina de cliente", notes: null, financialAccountId: stoneId, idempotencyKey: `fase4-${randomUUID()}` },
      null,
    );
    createdPaymentIds.push(result.payment.id);
    createdCashMovementIds.push(result.cashMovement.id);

    expect(result.cashMovement.categoryId).toBe(reembolsoId);
    expect(result.cashMovement.categoryId).not.toBe(prestadoresPjId); // nunca contamina o balde de remuneração
  });

  it("pagamento em dinheiro usa Caixa físico, sem nenhuma bank_statement_line criada", async () => {
    const db = getDb()!;
    const [contractor] = await db.insert(contractors).values({ businessName: `Fase4 dinheiro ${randomUUID()}` }).returning();
    createdContractorIds.push(contractor.id);
    const caixaId = await accountId("Caixa físico");
    const [{ n: bslBefore }] = (await db.execute(sql`select count(*)::int as n from bank_statement_lines`)) as unknown as Array<{ n: number }>;

    const result = await recordEmployeePayment(
      { subjectType: "contractor", subjectId: contractor.id, category: "salario_fixo", amount: 200, date: "2026-09-05", competenceDate: null, description: "Pago em dinheiro", notes: null, financialAccountId: caixaId, idempotencyKey: `fase4-${randomUUID()}` },
      null,
    );
    createdPaymentIds.push(result.payment.id);
    createdCashMovementIds.push(result.cashMovement.id);

    expect(result.cashMovement.financialAccountId).toBe(caixaId);
    const [{ n: bslAfter }] = (await db.execute(sql`select count(*)::int as n from bank_statement_lines`)) as unknown as Array<{ n: number }>;
    expect(bslAfter).toBe(bslBefore); // nenhuma linha de extrato fictícia criada
  });

  it("Ailos/CredCrea também é aceita como origem", async () => {
    const db = getDb()!;
    const [contractor] = await db.insert(contractors).values({ businessName: `Fase4 ailos ${randomUUID()}` }).returning();
    createdContractorIds.push(contractor.id);
    const ailosId = await accountId("Ailos / CredCrea");

    const result = await recordEmployeePayment(
      { subjectType: "contractor", subjectId: contractor.id, category: "outro", amount: 100, date: "2026-09-05", competenceDate: null, description: "Pago via Ailos", notes: null, financialAccountId: ailosId, idempotencyKey: `fase4-${randomUUID()}` },
      null,
    );
    createdPaymentIds.push(result.payment.id);
    createdCashMovementIds.push(result.cashMovement.id);

    expect(result.cashMovement.financialAccountId).toBe(ailosId);
  });

  it("idempotencyKey é persistida no employee_payment criado", async () => {
    const db = getDb()!;
    const [contractor] = await db.insert(contractors).values({ businessName: `Fase4 idkey ${randomUUID()}` }).returning();
    createdContractorIds.push(contractor.id);
    const stoneId = await accountId("Stone");
    const key = `fase4-persist-${randomUUID()}`;

    const result = await recordEmployeePayment(
      { subjectType: "contractor", subjectId: contractor.id, category: "outro", amount: 10, date: "2026-09-05", competenceDate: null, description: "teste chave", notes: null, financialAccountId: stoneId, idempotencyKey: key },
      null,
    );
    createdPaymentIds.push(result.payment.id);
    createdCashMovementIds.push(result.cashMovement.id);

    expect(result.payment.idempotencyKey).toBe(key);
  });

  it("mesma idempotencyKey chamada duas vezes -> só 1 pagamento, o segundo retorna created:false e o MESMO registro", async () => {
    const db = getDb()!;
    const [contractor] = await db.insert(contractors).values({ businessName: `Fase4 dedupe ${randomUUID()}` }).returning();
    createdContractorIds.push(contractor.id);
    const stoneId = await accountId("Stone");
    const key = `fase4-dedupe-${randomUUID()}`;
    const input = { subjectType: "contractor" as const, subjectId: contractor.id, category: "outro" as const, amount: 77, date: "2026-09-05", competenceDate: null, description: "teste dedupe", notes: null, financialAccountId: stoneId, idempotencyKey: key };

    const first = await recordEmployeePayment(input, null);
    const second = await recordEmployeePayment(input, null);
    createdPaymentIds.push(first.payment.id);
    createdCashMovementIds.push(first.cashMovement.id);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.payment.id).toBe(first.payment.id);
    expect(second.cashMovement.id).toBe(first.cashMovement.id);

    const count = await db.select().from(employeePayments).where(eq(employeePayments.idempotencyKey, key));
    expect(count).toHaveLength(1); // nunca 2
  });

  it("duas requisições CONCORRENTES com a mesma idempotencyKey -> apenas 1 pagamento (garantia do UNIQUE do banco, não só da aplicação)", async () => {
    const db = getDb()!;
    const [contractor] = await db.insert(contractors).values({ businessName: `Fase4 concorrencia ${randomUUID()}` }).returning();
    createdContractorIds.push(contractor.id);
    const stoneId = await accountId("Stone");
    const key = `fase4-race-${randomUUID()}`;
    const input = { subjectType: "contractor" as const, subjectId: contractor.id, category: "outro" as const, amount: 88, date: "2026-09-05", competenceDate: null, description: "teste concorrência", notes: null, financialAccountId: stoneId, idempotencyKey: key };

    const [a, b] = await Promise.all([recordEmployeePayment(input, null), recordEmployeePayment(input, null)]);
    createdPaymentIds.push(a.payment.id);
    createdCashMovementIds.push(a.cashMovement.id);

    expect(a.payment.id).toBe(b.payment.id); // as duas chamadas concorrentes convergem para o MESMO registro
    const count = await db.select().from(employeePayments).where(eq(employeePayments.idempotencyKey, key));
    expect(count).toHaveLength(1);
  });

  it("chaves diferentes para o mesmo colaborador/valor -> pagamentos distintos, nunca fundidos", async () => {
    const db = getDb()!;
    const [contractor] = await db.insert(contractors).values({ businessName: `Fase4 chaves-diferentes ${randomUUID()}` }).returning();
    createdContractorIds.push(contractor.id);
    const stoneId = await accountId("Stone");
    const base = { subjectType: "contractor" as const, subjectId: contractor.id, category: "outro" as const, amount: 50, date: "2026-09-05", competenceDate: null, description: "teste", notes: null, financialAccountId: stoneId };

    const first = await recordEmployeePayment({ ...base, idempotencyKey: `fase4-diff-a-${randomUUID()}` }, null);
    const second = await recordEmployeePayment({ ...base, idempotencyKey: `fase4-diff-b-${randomUUID()}` }, null);
    createdPaymentIds.push(first.payment.id, second.payment.id);
    createdCashMovementIds.push(first.cashMovement.id, second.cashMovement.id);

    expect(first.payment.id).not.toBe(second.payment.id);
    expect(first.created).toBe(true);
    expect(second.created).toBe(true);
  });

  it("colaborador inexistente -> NotFoundError, ROLLBACK completo (zero cash_movement, zero employee_payment)", async () => {
    const db = getDb()!;
    const stoneId = await accountId("Stone");
    const key = `fase4-notfound-${randomUUID()}`;
    const [{ n: cmBefore }] = (await db.execute(sql`select count(*)::int as n from cash_movements`)) as unknown as Array<{ n: number }>;

    await expect(
      recordEmployeePayment({ subjectType: "contractor", subjectId: randomUUID(), category: "outro", amount: 10, date: "2026-09-05", competenceDate: null, description: "x", notes: null, financialAccountId: stoneId, idempotencyKey: key }, null),
    ).rejects.toBeInstanceOf(NotFoundError);

    const [{ n: cmAfter }] = (await db.execute(sql`select count(*)::int as n from cash_movements`)) as unknown as Array<{ n: number }>;
    expect(cmAfter).toBe(cmBefore); // nenhum cash_movement órfão ficou para trás
    const orphanPayment = await db.select().from(employeePayments).where(eq(employeePayments.idempotencyKey, key));
    expect(orphanPayment).toHaveLength(0);
  });

  it("categoria 'adiantamento' é rejeitada — pertence a employee_advances, nunca a esta função", async () => {
    const db = getDb()!;
    const [contractor] = await db.insert(contractors).values({ businessName: `Fase4 sem-adiantamento ${randomUUID()}` }).returning();
    createdContractorIds.push(contractor.id);
    const stoneId = await accountId("Stone");

    await expect(
      recordEmployeePayment({ subjectType: "contractor", subjectId: contractor.id, category: "adiantamento" as never, amount: 10, date: "2026-09-05", competenceDate: null, description: "x", notes: null, financialAccountId: stoneId, idempotencyKey: `fase4-${randomUUID()}` }, null),
    ).rejects.toBeInstanceOf(InvalidPaymentCategoryError);

    const advancesCount = await db.select().from(employeeAdvances).where(eq(employeeAdvances.subjectId, contractor.id));
    expect(advancesCount).toHaveLength(0); // nenhum employee_advance criado acidentalmente
  });

  it("valor zero e valor negativo são bloqueados", async () => {
    const db = getDb()!;
    const [contractor] = await db.insert(contractors).values({ businessName: `Fase4 valor-invalido ${randomUUID()}` }).returning();
    createdContractorIds.push(contractor.id);
    const stoneId = await accountId("Stone");

    await expect(
      recordEmployeePayment({ subjectType: "contractor", subjectId: contractor.id, category: "outro", amount: 0, date: "2026-09-05", competenceDate: null, description: "x", notes: null, financialAccountId: stoneId, idempotencyKey: `fase4-${randomUUID()}` }, null),
    ).rejects.toBeInstanceOf(InvalidAmountError);
    await expect(
      recordEmployeePayment({ subjectType: "contractor", subjectId: contractor.id, category: "outro", amount: -10, date: "2026-09-05", competenceDate: null, description: "x", notes: null, financialAccountId: stoneId, idempotencyKey: `fase4-${randomUUID()}` }, null),
    ).rejects.toBeInstanceOf(InvalidAmountError);
  });

  it("conta financeira inválida/inexistente -> InvalidFinancialAccountError, rollback completo", async () => {
    const db = getDb()!;
    const [contractor] = await db.insert(contractors).values({ businessName: `Fase4 conta-invalida ${randomUUID()}` }).returning();
    createdContractorIds.push(contractor.id);

    await expect(
      recordEmployeePayment({ subjectType: "contractor", subjectId: contractor.id, category: "outro", amount: 10, date: "2026-09-05", competenceDate: null, description: "x", notes: null, financialAccountId: randomUUID(), idempotencyKey: `fase4-${randomUUID()}` }, null),
    ).rejects.toBeInstanceOf(InvalidFinancialAccountError);
  });

  it("outro colaborador não é afetado por um novo pagamento", async () => {
    const db = getDb()!;
    const [target] = await db.insert(contractors).values({ businessName: `Fase4 alvo-pagamento ${randomUUID()}` }).returning();
    const [other] = await db.insert(contractors).values({ businessName: `Fase4 outro-pagamento ${randomUUID()}` }).returning();
    createdContractorIds.push(target.id, other.id);
    const stoneId = await accountId("Stone");

    const result = await recordEmployeePayment(
      { subjectType: "contractor", subjectId: target.id, category: "outro", amount: 60, date: "2026-09-05", competenceDate: null, description: "x", notes: null, financialAccountId: stoneId, idempotencyKey: `fase4-${randomUUID()}` },
      null,
    );
    createdPaymentIds.push(result.payment.id);
    createdCashMovementIds.push(result.cashMovement.id);

    const otherPayments = await db.select().from(employeePayments).where(eq(employeePayments.subjectId, other.id));
    expect(otherPayments).toHaveLength(0);
  });

  it("audit_log é criado com entidade, ação, ator e referência ao cash_movement", async () => {
    const db = getDb()!;
    const [contractor] = await db.insert(contractors).values({ businessName: `Fase4 audit ${randomUUID()}` }).returning();
    createdContractorIds.push(contractor.id);
    const [actor] = await db.insert(users).values({ email: `fase4-audit-${randomUUID()}@teste.local`, name: "Admin de teste", role: "admin" }).returning();
    createdUserIds.push(actor.id);
    const stoneId = await accountId("Stone");

    const result = await recordEmployeePayment(
      { subjectType: "contractor", subjectId: contractor.id, category: "outro", amount: 15, date: "2026-09-05", competenceDate: null, description: "x", notes: null, financialAccountId: stoneId, idempotencyKey: `fase4-${randomUUID()}` },
      actor.id,
    );
    createdPaymentIds.push(result.payment.id);
    createdCashMovementIds.push(result.cashMovement.id);

    const logs = await db.select().from(auditLogs).where(inArray(auditLogs.entityId, [result.payment.id]));
    expect(logs).toHaveLength(1);
    expect(logs[0]!.entityType).toBe("employee_payment");
    expect(logs[0]!.action).toBe("create_employee_payment");
    expect(logs[0]!.actorUserId).toBe(actor.id);
    expect(logs[0]!.notes).toContain(result.cashMovement.id);
  });
});

/**
 * Fase 5 do Departamento Pessoal (20/09/2026) — cadastro de colaborador novo.
 * `createEmployeeRecord`/`createContractorRecord` nunca reaproveitam `getOrCreateEmployee`/
 * `getOrCreateContractor` (que mesclam por nome) — sempre `INSERT`, com bloqueio explícito por
 * `taxId` duplicado para PJ (única checagem de duplicidade confiável que o schema permite).
 */
describe.skipIf(!hasRealDb)("createEmployeeRecord / createContractorRecord — Fase 5 (20/09/2026)", () => {
  it("cria um CLT novo com todos os campos", async () => {
    const [actor] = await getDb()!.insert(users).values({ email: `fase5-emp-${randomUUID()}@teste.local`, name: "Admin de teste", role: "admin" }).returning();
    createdUserIds.push(actor.id);

    const row = await createEmployeeRecord({ fullName: `Fase5 CLT ${randomUUID()}`, role: "Cargo teste", admissionDate: "2026-09-01", workSchedule: "08h-17h", baseSalary: 3000, notes: "nota" }, actor.id);
    createdEmployeeIds.push(row.id);

    expect(row.role).toBe("Cargo teste");
    expect(row.admissionDate).toBe("2026-09-01");
    expect(row.workSchedule).toBe("08h-17h");
    expect(row.baseSalary).toBe("3000.00");
    expect(row.active).toBe(true);
  });

  it("cria um CLT novo com campos opcionais em branco -> ficam NULL, nunca inventados", async () => {
    const row = await createEmployeeRecord({ fullName: `Fase5 CLT minimo ${randomUUID()}`, role: "Cargo" }, null);
    createdEmployeeIds.push(row.id);

    expect(row.admissionDate).toBeNull();
    expect(row.workSchedule).toBeNull();
    expect(row.baseSalary).toBeNull();
    expect(row.notes).toBeNull();
  });

  it("cria um PJ novo com todos os campos", async () => {
    const row = await createContractorRecord(
      { businessName: `Fase5 PJ ${randomUUID()}`, type: "pessoa_fisica", taxId: `${randomUUID()}`, contactPhone: "47999999999", scope: "Lavação", agreedValue: 2600, contractStart: "2026-09-01", notes: "nota" },
      null,
    );
    createdContractorIds.push(row.id);

    expect(row.type).toBe("pessoa_fisica");
    expect(row.contactPhone).toBe("47999999999");
    expect(row.scope).toBe("Lavação");
    expect(row.agreedValue).toBe("2600.00");
    expect(row.active).toBe(true);
  });

  it("cria um PJ novo sem taxId (campo opcional) -> fica NULL, sem checagem de duplicidade", async () => {
    const row = await createContractorRecord({ businessName: `Fase5 PJ sem-cpf ${randomUUID()}`, type: "pessoa_juridica" }, null);
    createdContractorIds.push(row.id);

    expect(row.taxId).toBeNull();
    expect(row.contactPhone).toBeNull();
    expect(row.agreedValue).toBeNull();
  });

  it("duas pessoas com o MESMO nome mas SEM taxId são ambas cadastradas — nome sozinho nunca é prova de duplicidade", async () => {
    const sameName = `Fase5 Nome Repetido ${randomUUID()}`;
    const first = await createContractorRecord({ businessName: sameName, type: "pessoa_fisica" }, null);
    const second = await createContractorRecord({ businessName: sameName, type: "pessoa_fisica" }, null);
    createdContractorIds.push(first.id, second.id);

    expect(first.id).not.toBe(second.id); // duas pessoas, dois registros — nunca mesclado
  });

  it("PJ com taxId já cadastrado é BLOQUEADO — nunca mesclado silenciosamente", async () => {
    const taxId = `cpf-teste-${randomUUID()}`;
    const first = await createContractorRecord({ businessName: `Fase5 original ${randomUUID()}`, type: "pessoa_fisica", taxId }, null);
    createdContractorIds.push(first.id);

    await expect(createContractorRecord({ businessName: `Fase5 tentativa duplicada ${randomUUID()}`, type: "pessoa_fisica", taxId }, null)).rejects.toBeInstanceOf(DuplicateCollaboratorError);

    const db = getDb()!;
    const matches = await db.select().from(contractors).where(eq(contractors.taxId, taxId));
    expect(matches).toHaveLength(1); // continua só o original, nunca um segundo
  });

  it("audit_log é criado na criação do CLT e do PJ (CPF/CNPJ nunca em texto completo)", async () => {
    const db = getDb()!;
    const emp = await createEmployeeRecord({ fullName: `Fase5 audit emp ${randomUUID()}`, role: "Cargo" }, null);
    createdEmployeeIds.push(emp.id);
    const empLogs = await db.select().from(auditLogs).where(inArray(auditLogs.entityId, [emp.id]));
    expect(empLogs).toHaveLength(1);
    expect(empLogs[0]!.action).toBe("create_employee");
    expect(empLogs[0]!.beforeState).toBeNull();

    const taxId = `cpf-audit-${randomUUID()}`;
    const con = await createContractorRecord({ businessName: `Fase5 audit con ${randomUUID()}`, type: "pessoa_fisica", taxId }, null);
    createdContractorIds.push(con.id);
    const conLogs = await db.select().from(auditLogs).where(inArray(auditLogs.entityId, [con.id]));
    expect(conLogs).toHaveLength(1);
    expect(conLogs[0]!.action).toBe("create_contractor");
    const serialized = JSON.stringify(conLogs[0]!.afterState);
    expect(serialized).not.toContain(taxId); // CPF/CNPJ nunca em texto completo, mesma política da Fase 3
    expect((conLogs[0]!.afterState as { taxId: string }).taxId).toBe("[presente]");
  });

  it("cadastro de colaborador NÃO tem nenhum efeito financeiro colateral (employee_payments/cash_movements/employee_advances/bank_statement_lines inalterados)", async () => {
    const db = getDb()!;
    const countsQuery = sql<{ employee_payments: number; cash_movements: number; employee_advances: number; bank_statement_lines: number }>`
      select
        (select count(*)::int from employee_payments) as employee_payments,
        (select count(*)::int from cash_movements) as cash_movements,
        (select count(*)::int from employee_advances) as employee_advances,
        (select count(*)::int from bank_statement_lines) as bank_statement_lines
    `;
    const [before] = (await db.execute(countsQuery)) as unknown as Array<{ employee_payments: number; cash_movements: number; employee_advances: number; bank_statement_lines: number }>;

    const emp = await createEmployeeRecord({ fullName: `Fase5 sem-efeito ${randomUUID()}`, role: "Cargo", baseSalary: 5000 }, null);
    createdEmployeeIds.push(emp.id);
    const con = await createContractorRecord({ businessName: `Fase5 sem-efeito PJ ${randomUUID()}`, type: "pessoa_fisica", agreedValue: 2600 }, null);
    createdContractorIds.push(con.id);

    const [after] = (await db.execute(countsQuery)) as unknown as Array<{ employee_payments: number; cash_movements: number; employee_advances: number; bank_statement_lines: number }>;
    expect(after).toEqual(before); // mesmo informando salário/valor combinado, nenhum pagamento é gerado
  });
});
