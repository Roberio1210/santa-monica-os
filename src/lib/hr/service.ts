import "server-only";
import {
  listContractors,
  listEmployeeAdvances,
  listEmployeePayments,
  listEmployees,
  listOpenEmployeeAdvances,
  getEmployeeById,
  getContractorById,
  listEmployeeDocuments,
  type ContractorRow,
  type EmployeeAdvanceRow,
  type EmployeeDocumentRow,
  type EmployeePaymentRow,
  type EmployeeRow,
} from "@/lib/hr/repository";
import { summarizePersonnelCost, type EmployeePaymentForSummary, type PersonnelCostSummary } from "@/lib/hr/costSummary";

/**
 * Missão 86 (Departamento Pessoal) — agregador único da Visão Geral do DP, mesmo padrão de
 * `overview/service.ts` (VG1): a página nunca monta a consulta na mão, e cada domínio (folha,
 * adiantamentos, colaboradores) é buscado em paralelo.
 */
export interface DpCollaborator {
  id: string;
  type: "employee" | "contractor";
  name: string;
  active: boolean;
  role: string | null;
  admissionOrStart: string | null;
  totalInPeriod: number;
  paymentCountInPeriod: number;
}

export interface DpOverview {
  period: { from: string; to: string };
  costSummary: PersonnelCostSummary;
  employeeCount: number;
  contractorCount: number;
  collaborators: DpCollaborator[];
  recentPayments: EmployeePaymentRow[];
  openAdvances: EmployeeAdvanceRow[];
}

function totalsFor(subjectId: string, payments: EmployeePaymentRow[]): { total: number; count: number } {
  const mine = payments.filter((p) => p.subjectId === subjectId);
  return { total: mine.reduce((sum, p) => sum + Number(p.amount), 0), count: mine.length };
}

function toCollaborator(e: EmployeeRow, payments: EmployeePaymentRow[]): DpCollaborator {
  const { total, count } = totalsFor(e.id, payments);
  return { id: e.id, type: "employee", name: e.fullName, active: e.active, role: e.role, admissionOrStart: e.admissionDate, totalInPeriod: total, paymentCountInPeriod: count };
}
function contractorToCollaborator(c: ContractorRow, payments: EmployeePaymentRow[]): DpCollaborator {
  const { total, count } = totalsFor(c.id, payments);
  return { id: c.id, type: "contractor", name: c.businessName, active: c.active, role: c.scope, admissionOrStart: c.contractStart, totalInPeriod: total, paymentCountInPeriod: count };
}

export async function getDpOverview(period: { from: string; to: string }): Promise<DpOverview> {
  const [employeesList, contractorsList, payments, openAdvances] = await Promise.all([
    listEmployees(),
    listContractors(),
    listEmployeePayments({ dateFrom: period.from, dateTo: period.to }),
    listOpenEmployeeAdvances(),
  ]);

  const collaborators: DpCollaborator[] = [...employeesList.map((e) => toCollaborator(e, payments)), ...contractorsList.map((c) => contractorToCollaborator(c, payments))];

  const forSummary: EmployeePaymentForSummary[] = payments.map((p) => ({ category: p.category, amount: Number(p.amount) }));
  const costSummary = summarizePersonnelCost(forSummary);

  return {
    period,
    costSummary,
    employeeCount: employeesList.filter((e) => e.active).length,
    contractorCount: contractorsList.filter((c) => c.active).length,
    collaborators,
    recentPayments: payments.slice(0, 30),
    openAdvances,
  };
}

export async function getCollaboratorHistory(subjectId: string): Promise<EmployeePaymentRow[]> {
  return listEmployeePayments({ subjectId });
}

export async function listAllAdvances(): Promise<EmployeeAdvanceRow[]> {
  return listEmployeeAdvances();
}

/**
 * Ficha individual (`/departamento-pessoal/[id]`, Fase 1, 20/09/2026) — dados cadastrais
 * genéricos (nome/vínculo/função/CPF-CNPJ/valor combinado) NUNCA vêm do histórico financeiro,
 * só das colunas estruturadas de `employees`/`contractors` (que hoje, para os 5 colaboradores
 * reais, estão quase todas `null` — a ficha mostra "Não informado" nesses casos, nunca infere a
 * partir de `employee_payments`/notas). `payments`/`costSummary` já vêm filtrados por
 * `subjectId` — nunca incluem um encargo genérico (ex.: FGTS com `subjectId=null`) por engano.
 */
export interface CollaboratorProfile {
  id: string;
  type: "employee" | "contractor";
  name: string;
  active: boolean;
  role: string | null;
  admissionOrStart: string | null;
  /** Só existe estruturalmente para `contractor` — `employees` não tem essa coluna (ver docs/hr-module-architecture.md). */
  taxId: string | null;
  /** Só existe estruturalmente para `employee` — PJ não tem jornada registrada. */
  workSchedule: string | null;
  agreedValueOrBaseSalary: number | null;
  period: { from: string; to: string };
  costSummary: PersonnelCostSummary;
  payments: EmployeePaymentRow[];
  advances: EmployeeAdvanceRow[];
  documents: EmployeeDocumentRow[];
}

export async function getCollaboratorProfile(id: string, period: { from: string; to: string }): Promise<CollaboratorProfile | null> {
  const employee = await getEmployeeById(id);
  const contractor = employee ? null : await getContractorById(id);
  if (!employee && !contractor) return null;

  const subjectType: "employee" | "contractor" = employee ? "employee" : "contractor";

  const [payments, advances, documents] = await Promise.all([
    listEmployeePayments({ subjectId: id, dateFrom: period.from, dateTo: period.to }),
    listEmployeeAdvances(id),
    listEmployeeDocuments(subjectType, id),
  ]);

  const forSummary: EmployeePaymentForSummary[] = payments.map((p) => ({ category: p.category, amount: Number(p.amount) }));

  return {
    id,
    type: subjectType,
    name: employee ? employee.fullName : contractor!.businessName,
    active: employee ? employee.active : contractor!.active,
    role: employee ? employee.role : contractor!.scope,
    admissionOrStart: employee ? employee.admissionDate : contractor!.contractStart,
    taxId: employee ? null : contractor!.taxId,
    workSchedule: employee ? employee.workSchedule : null,
    agreedValueOrBaseSalary: employee ? (employee.baseSalary !== null ? Number(employee.baseSalary) : null) : contractor!.agreedValue !== null ? Number(contractor!.agreedValue) : null,
    period,
    costSummary: summarizePersonnelCost(forSummary),
    payments,
    advances,
    documents,
  };
}
