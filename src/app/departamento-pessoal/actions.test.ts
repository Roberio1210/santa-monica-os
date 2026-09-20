import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/hr/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hr/repository")>();
  return { ...actual, updateEmployee: vi.fn(), updateContractor: vi.fn() };
});

import { updateEmployeeAction, updateContractorAction, toggleCollaboratorActiveAction } from "@/app/departamento-pessoal/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { updateEmployee, updateContractor, NotFoundError, ConcurrencyConflictError } from "@/lib/hr/repository";

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
