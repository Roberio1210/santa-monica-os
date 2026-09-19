import "server-only";
import { listContractors, listEmployeeAdvances, listEmployeePayments, listEmployees, listOpenEmployeeAdvances, type ContractorRow, type EmployeeAdvanceRow, type EmployeePaymentRow, type EmployeeRow } from "@/lib/hr/repository";
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
