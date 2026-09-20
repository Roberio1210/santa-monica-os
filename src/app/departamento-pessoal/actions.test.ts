import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/hr/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hr/repository")>();
  return { ...actual, updateEmployee: vi.fn(), updateContractor: vi.fn(), recordEmployeePayment: vi.fn() };
});

import { updateEmployeeAction, updateContractorAction, toggleCollaboratorActiveAction, registerEmployeePaymentAction } from "@/app/departamento-pessoal/actions";
import { getCurrentUser } from "@/lib/auth/session";
import {
  updateEmployee,
  updateContractor,
  recordEmployeePayment,
  NotFoundError,
  ConcurrencyConflictError,
  InvalidPaymentCategoryError,
  InvalidFinancialAccountError,
  InvalidAmountError,
} from "@/lib/hr/repository";

/**
 * Fase 3 do Departamento Pessoal (20/09/2026) — prova que a autorização é FAIL-CLOSED e vive no
 * servidor, nunca só na UI: as três actions nunca chamam `updateEmployee`/`updateContractor`
 * quando não há sessão, ou quando a sessão não é admin — a checagem roda de novo mesmo que
 * alguém chame a action diretamente (é exatamente isso que este teste simula, sem passar por
 * nenhum componente React). Também prova a whitelist contra mass assignment: campos fora dos
 * nomes esperados no FormData nunca chegam ao patch enviado ao repositório.
 */
function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

const validEmployeePayload = { id: "emp-1", expectedUpdatedAt: "2026-09-20T10:00:00.000Z", fullName: "Kauã Teste", role: "Cargo" };
const validContractorPayload = { id: "con-1", expectedUpdatedAt: "2026-09-20T10:00:00.000Z", businessName: "Paulo Teste", type: "pessoa_fisica" };

beforeEach(() => {
  vi.mocked(getCurrentUser).mockReset();
  vi.mocked(updateEmployee).mockReset();
  vi.mocked(updateContractor).mockReset();
  vi.mocked(recordEmployeePayment).mockReset();
});

describe("updateEmployeeAction / updateContractorAction — RBAC fail-closed (Fase 3, 20/09/2026)", () => {
  it("1) sem sessão nenhuma -> erro, updateEmployee NUNCA é chamado", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const result = await updateEmployeeAction({ error: null, success: null }, formData(validEmployeePayload));
    expect(result.error).toMatch(/não autorizado/i);
    expect(updateEmployee).not.toHaveBeenCalled();
  });

  it("2) sessão operacional (não-admin) -> erro, updateEmployee NUNCA é chamado", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "op@example.com", name: "Operacional", role: "operacional" });
    const result = await updateEmployeeAction({ error: null, success: null }, formData(validEmployeePayload));
    expect(result.error).toMatch(/administradores/i);
    expect(updateEmployee).not.toHaveBeenCalled();
  });

  it("3) sessão admin -> updateEmployee é chamado normalmente", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    vi.mocked(updateEmployee).mockResolvedValue({} as never);
    const result = await updateEmployeeAction({ error: null, success: null }, formData(validEmployeePayload));
    expect(result.error).toBeNull();
    expect(updateEmployee).toHaveBeenCalledTimes(1);
    expect(updateEmployee).toHaveBeenCalledWith("emp-1", expect.objectContaining({ fullName: "Kauã Teste", role: "Cargo" }), expect.any(Date), "admin-1");
  });

  it("4) sem sessão nenhuma -> updateContractorAction também nega, updateContractor NUNCA é chamado", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const result = await updateContractorAction({ error: null, success: null }, formData(validContractorPayload));
    expect(result.error).toMatch(/não autorizado/i);
    expect(updateContractor).not.toHaveBeenCalled();
  });

  it("5) sessão operacional -> updateContractorAction nega", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "op@example.com", name: "Operacional", role: "operacional" });
    const result = await updateContractorAction({ error: null, success: null }, formData(validContractorPayload));
    expect(result.error).toMatch(/administradores/i);
    expect(updateContractor).not.toHaveBeenCalled();
  });

  it("6) sessão admin -> updateContractor é chamado normalmente", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    vi.mocked(updateContractor).mockResolvedValue({} as never);
    const result = await updateContractorAction({ error: null, success: null }, formData(validContractorPayload));
    expect(result.error).toBeNull();
    expect(updateContractor).toHaveBeenCalledTimes(1);
    expect(updateContractor).toHaveBeenCalledWith("con-1", expect.objectContaining({ businessName: "Paulo Teste", type: "pessoa_fisica" }), expect.any(Date), "admin-1");
  });

  it("7) payload adulterado: campos fora da whitelist do FormData (ex.: 'active', 'id' duplicado como outro valor, 'createdAt') nunca chegam ao patch enviado ao repositório", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    vi.mocked(updateEmployee).mockResolvedValue({} as never);
    const adulterado = formData({ ...validEmployeePayload, active: "true", createdAt: "2000-01-01", subjectId: "outro-id-qualquer", cashMovementId: "tentativa-de-injecao" });
    await updateEmployeeAction({ error: null, success: null }, adulterado);
    const patchEnviado = vi.mocked(updateEmployee).mock.calls[0]![1];
    expect(patchEnviado).not.toHaveProperty("active");
    expect(patchEnviado).not.toHaveProperty("createdAt");
    expect(patchEnviado).not.toHaveProperty("subjectId");
    expect(patchEnviado).not.toHaveProperty("cashMovementId");
  });

  it("8) NotFoundError do repositório vira mensagem amigável, nunca stack trace/SQL", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    vi.mocked(updateEmployee).mockRejectedValue(new NotFoundError("Colaborador (CLT) não encontrado: emp-1"));
    const result = await updateEmployeeAction({ error: null, success: null }, formData(validEmployeePayload));
    expect(result.error).toBe("Colaborador não encontrado.");
    expect(result.error).not.toMatch(/select|insert|update|SQL/i);
  });

  it("9) ConcurrencyConflictError do repositório vira mensagem amigável pedindo para recarregar", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    vi.mocked(updateEmployee).mockRejectedValue(new ConcurrencyConflictError("Este cadastro foi alterado por outra sessão — recarregue a página antes de salvar novamente."));
    const result = await updateEmployeeAction({ error: null, success: null }, formData(validEmployeePayload));
    expect(result.error).toMatch(/outra sessão/i);
  });

  it("10) nome vazio é rejeitado antes de chamar o repositório", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    const result = await updateEmployeeAction({ error: null, success: null }, formData({ ...validEmployeePayload, fullName: "" }));
    expect(result.error).toMatch(/nome/i);
    expect(updateEmployee).not.toHaveBeenCalled();
  });

  it("11) valor monetário negativo é rejeitado antes de chamar o repositório", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    const result = await updateEmployeeAction({ error: null, success: null }, formData({ ...validEmployeePayload, baseSalary: "-100" }));
    expect(result.error).toMatch(/salário/i);
    expect(updateEmployee).not.toHaveBeenCalled();
  });

  it("12) estado de formulário sem expectedUpdatedAt válido é rejeitado antes de chamar o repositório", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    const result = await updateEmployeeAction({ error: null, success: null }, formData({ ...validEmployeePayload, expectedUpdatedAt: "data-invalida" }));
    expect(result.error).toMatch(/recarregue/i);
    expect(updateEmployee).not.toHaveBeenCalled();
  });
});

describe("toggleCollaboratorActiveAction — RBAC fail-closed (Fase 3, 20/09/2026)", () => {
  it("13) sem sessão -> erro, nenhum repositório é chamado", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const result = await toggleCollaboratorActiveAction({ error: null, success: null }, formData({ id: "emp-1", type: "employee", active: "false", expectedUpdatedAt: "2026-09-20T10:00:00.000Z" }));
    expect(result.error).toMatch(/não autorizado/i);
    expect(updateEmployee).not.toHaveBeenCalled();
    expect(updateContractor).not.toHaveBeenCalled();
  });

  it("14) admin ativo->inativo (employee) chama updateEmployee com active=false", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    vi.mocked(updateEmployee).mockResolvedValue({} as never);
    const result = await toggleCollaboratorActiveAction({ error: null, success: null }, formData({ id: "emp-1", type: "employee", active: "false", expectedUpdatedAt: "2026-09-20T10:00:00.000Z" }));
    expect(result.error).toBeNull();
    expect(updateEmployee).toHaveBeenCalledWith("emp-1", { active: false }, expect.any(Date), "admin-1");
  });

  it("15) admin inativo->ativo (contractor) chama updateContractor com active=true", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    vi.mocked(updateContractor).mockResolvedValue({} as never);
    const result = await toggleCollaboratorActiveAction({ error: null, success: null }, formData({ id: "con-1", type: "contractor", active: "true", expectedUpdatedAt: "2026-09-20T10:00:00.000Z" }));
    expect(result.error).toBeNull();
    expect(updateContractor).toHaveBeenCalledWith("con-1", { active: true }, expect.any(Date), "admin-1");
  });
});

const validPaymentPayload = {
  subjectId: "con-1",
  subjectType: "contractor",
  category: "salario_fixo",
  amount: "500.00",
  date: "2026-09-05",
  description: "Pagamento de teste",
  financialAccountId: "stone-1",
};

describe("registerEmployeePaymentAction — Fase 4 (20/09/2026)", () => {
  it("16) sem sessão -> erro, recordEmployeePayment NUNCA é chamado", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const result = await registerEmployeePaymentAction({ error: null, success: null }, formData(validPaymentPayload));
    expect(result.error).toMatch(/não autorizado/i);
    expect(recordEmployeePayment).not.toHaveBeenCalled();
  });

  it("17) sessão operacional (não-admin) -> erro, recordEmployeePayment NUNCA é chamado", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", email: "op@example.com", name: "Operacional", role: "operacional" });
    const result = await registerEmployeePaymentAction({ error: null, success: null }, formData(validPaymentPayload));
    expect(result.error).toMatch(/administradores/i);
    expect(recordEmployeePayment).not.toHaveBeenCalled();
  });

  it("18) admin autorizado -> recordEmployeePayment é chamado com os campos certos, incluindo idempotencyKey determinística", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    vi.mocked(recordEmployeePayment).mockResolvedValue({ payment: {} as never, cashMovement: {} as never, created: true });

    const result = await registerEmployeePaymentAction({ error: null, success: null }, formData(validPaymentPayload));

    expect(result.error).toBeNull();
    expect(recordEmployeePayment).toHaveBeenCalledTimes(1);
    const [input, actorId] = vi.mocked(recordEmployeePayment).mock.calls[0]!;
    expect(input.subjectId).toBe("con-1");
    expect(input.subjectType).toBe("contractor");
    expect(input.category).toBe("salario_fixo");
    expect(input.amount).toBe(500);
    expect(input.date).toBe("2026-09-05");
    expect(input.competenceDate).toBeNull(); // nunca derivada automaticamente da data de pagamento
    expect(input.financialAccountId).toBe("stone-1");
    expect(typeof input.idempotencyKey).toBe("string");
    expect(input.idempotencyKey.length).toBeGreaterThan(0);
    expect(actorId).toBe("admin-1");
  });

  it("19) a idempotencyKey calculada é determinística: os MESMOS campos produzem a MESMA chave em duas chamadas", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    vi.mocked(recordEmployeePayment).mockResolvedValue({ payment: {} as never, cashMovement: {} as never, created: true });

    await registerEmployeePaymentAction({ error: null, success: null }, formData(validPaymentPayload));
    await registerEmployeePaymentAction({ error: null, success: null }, formData(validPaymentPayload));

    const key1 = vi.mocked(recordEmployeePayment).mock.calls[0]![0].idempotencyKey;
    const key2 = vi.mocked(recordEmployeePayment).mock.calls[1]![0].idempotencyKey;
    expect(key1).toBe(key2); // mesmo conteúdo -> mesma chave -> duplo clique/refresh nunca cria 2 pagamentos
  });

  it("20) competência diferente da data de pagamento produz uma chave DIFERENTE — nunca fundida com outra competência", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    vi.mocked(recordEmployeePayment).mockResolvedValue({ payment: {} as never, cashMovement: {} as never, created: true });

    await registerEmployeePaymentAction({ error: null, success: null }, formData({ ...validPaymentPayload, competenceDate: "2026-07-01" }));
    await registerEmployeePaymentAction({ error: null, success: null }, formData({ ...validPaymentPayload, competenceDate: "2026-08-01" }));

    const key1 = vi.mocked(recordEmployeePayment).mock.calls[0]![0].idempotencyKey;
    const key2 = vi.mocked(recordEmployeePayment).mock.calls[1]![0].idempotencyKey;
    expect(key1).not.toBe(key2);
  });

  it("21) categoria vazia/ausente é bloqueada antes de chamar o repositório", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    const result = await registerEmployeePaymentAction({ error: null, success: null }, formData({ ...validPaymentPayload, category: "" }));
    expect(result.error).toMatch(/categoria/i);
    expect(recordEmployeePayment).not.toHaveBeenCalled();
  });

  it("22) categoria 'adiantamento' é bloqueada na própria action (nem chega no repositório)", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    const result = await registerEmployeePaymentAction({ error: null, success: null }, formData({ ...validPaymentPayload, category: "adiantamento" }));
    expect(result.error).toMatch(/categoria/i);
    expect(recordEmployeePayment).not.toHaveBeenCalled();
  });

  it("23) valor ausente/zero/negativo é bloqueado antes de chamar o repositório", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    const r1 = await registerEmployeePaymentAction({ error: null, success: null }, formData({ ...validPaymentPayload, amount: "" }));
    const r2 = await registerEmployeePaymentAction({ error: null, success: null }, formData({ ...validPaymentPayload, amount: "0" }));
    const r3 = await registerEmployeePaymentAction({ error: null, success: null }, formData({ ...validPaymentPayload, amount: "-10" }));
    expect(r1.error).toMatch(/valor/i);
    expect(r2.error).toMatch(/valor/i);
    expect(r3.error).toMatch(/valor/i);
    expect(recordEmployeePayment).not.toHaveBeenCalled();
  });

  it("24) data do pagamento ausente é bloqueada antes de chamar o repositório", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    const result = await registerEmployeePaymentAction({ error: null, success: null }, formData({ ...validPaymentPayload, date: "" }));
    expect(result.error).toMatch(/data/i);
    expect(recordEmployeePayment).not.toHaveBeenCalled();
  });

  it("25) descrição ausente é bloqueada antes de chamar o repositório", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    const result = await registerEmployeePaymentAction({ error: null, success: null }, formData({ ...validPaymentPayload, description: "" }));
    expect(result.error).toMatch(/descrição/i);
    expect(recordEmployeePayment).not.toHaveBeenCalled();
  });

  it("26) origem/conta ausente é bloqueada antes de chamar o repositório", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    const result = await registerEmployeePaymentAction({ error: null, success: null }, formData({ ...validPaymentPayload, financialAccountId: "" }));
    expect(result.error).toMatch(/origem|conta/i);
    expect(recordEmployeePayment).not.toHaveBeenCalled();
  });

  it("27) colaborador não identificado (subjectId/subjectType ausentes) é bloqueado antes de chamar o repositório", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    const result = await registerEmployeePaymentAction({ error: null, success: null }, formData({ ...validPaymentPayload, subjectId: "" }));
    expect(result.error).toMatch(/colaborador/i);
    expect(recordEmployeePayment).not.toHaveBeenCalled();
  });

  it("28) NotFoundError/InvalidPaymentCategoryError/InvalidFinancialAccountError/InvalidAmountError do repositório viram mensagens amigáveis, nunca stack trace/SQL", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });

    vi.mocked(recordEmployeePayment).mockRejectedValueOnce(new NotFoundError("Colaborador não encontrado: con-1"));
    const r1 = await registerEmployeePaymentAction({ error: null, success: null }, formData(validPaymentPayload));
    expect(r1.error).toBe("Colaborador não encontrado.");

    vi.mocked(recordEmployeePayment).mockRejectedValueOnce(new InvalidPaymentCategoryError("Categoria não suportada"));
    const r2 = await registerEmployeePaymentAction({ error: null, success: null }, formData(validPaymentPayload));
    expect(r2.error).toBe("Categoria não suportada");

    vi.mocked(recordEmployeePayment).mockRejectedValueOnce(new InvalidFinancialAccountError("Conta inválida"));
    const r3 = await registerEmployeePaymentAction({ error: null, success: null }, formData(validPaymentPayload));
    expect(r3.error).toMatch(/conta.*inválida/i);

    vi.mocked(recordEmployeePayment).mockRejectedValueOnce(new InvalidAmountError("Valor inválido"));
    const r4 = await registerEmployeePaymentAction({ error: null, success: null }, formData(validPaymentPayload));
    expect(r4.error).toBe("Valor inválido");

    for (const r of [r1, r2, r3, r4]) expect(r.error).not.toMatch(/select|insert|update|SQL|Error:/i);
  });

  it("29) created:false (idempotência) retorna mensagem própria, nunca a mensagem de sucesso normal", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "admin-1", email: "a@example.com", name: "Admin", role: "admin" });
    vi.mocked(recordEmployeePayment).mockResolvedValue({ payment: {} as never, cashMovement: {} as never, created: false });

    const result = await registerEmployeePaymentAction({ error: null, success: null }, formData(validPaymentPayload));

    expect(result.error).toBeNull();
    expect(result.success).toMatch(/já havia sido registrado/i);
  });
});
