/**
 * Missão 86 (Departamento Pessoal) — funções PURAS (nenhum I/O aqui) sobre o estado de um
 * adiantamento. Mesma separação já usada em todo o projeto (capacity.ts, reconciliation.ts):
 * lógica de negócio testável sem banco, a camada de I/O (hr/service.ts) só orquestra.
 */

export type EmployeeAdvanceStatus = "aberto" | "parcialmente_compensado" | "compensado";

export interface EmployeeAdvanceState {
  amount: number;
  compensatedAmount: number;
}

/** Saldo em aberto de um adiantamento — nunca negativo, nunca maior que o valor original. */
export function computeAdvanceOutstanding(advance: EmployeeAdvanceState): number {
  const outstanding = advance.amount - advance.compensatedAmount;
  return Math.max(0, Math.round(outstanding * 100) / 100);
}

/** Deriva o status a partir do valor compensado — nunca um campo solto que pode divergir do saldo real. */
export function computeAdvanceStatus(advance: EmployeeAdvanceState): EmployeeAdvanceStatus {
  const outstanding = computeAdvanceOutstanding(advance);
  if (outstanding <= 0) return "compensado";
  if (advance.compensatedAmount > 0) return "parcialmente_compensado";
  return "aberto";
}

export class AdvanceCompensationError extends Error {}

/**
 * Aplica uma compensação (desconto de um pagamento futuro) a um adiantamento existente — nunca
 * permite compensar mais do que o saldo em aberto (impediria criar um adiantamento "negativo").
 */
export function applyAdvanceCompensation(advance: EmployeeAdvanceState, compensationAmount: number): { compensatedAmount: number; status: EmployeeAdvanceStatus } {
  if (compensationAmount <= 0) throw new AdvanceCompensationError("Valor de compensação deve ser maior que zero.");
  const outstanding = computeAdvanceOutstanding(advance);
  if (compensationAmount > outstanding) {
    throw new AdvanceCompensationError(`Compensação de ${compensationAmount} excede o saldo em aberto de ${outstanding}.`);
  }
  const compensatedAmount = Math.round((advance.compensatedAmount + compensationAmount) * 100) / 100;
  return { compensatedAmount, status: computeAdvanceStatus({ amount: advance.amount, compensatedAmount }) };
}
