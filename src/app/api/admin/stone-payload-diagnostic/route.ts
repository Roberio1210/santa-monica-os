import "server-only";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getConciliationFile } from "@/lib/integrations/stone/service";
import type { StoneAccountInstallment, StoneAccountTransaction, StoneInstallment, StoneTransaction } from "@/lib/integrations/stone/types";

/**
 * Missão 67 — ferramenta diagnóstica TEMPORÁRIA (ver Missão 66, aprovada). Único propósito:
 * confirmar, com dado real da Stone, se e como a liquidação (`FinancialTransactionsAccounts`,
 * `Installment.PaymentDate`) de uma venda aparece — inclusive quando cai num `referenceDate`
 * diferente do dia da venda (Missão 64: hipótese de que o pipeline nunca cruza isso entre dias).
 *
 * Reutiliza EXCLUSIVAMENTE `getConciliationFile` (`service.ts`) — o "único ponto de entrada
 * autorizado" já existente para falar com a Stone (GET, cacheado, nunca escreve). Nunca importa
 * `persistence/*`, `mapping.ts` ou qualquer repositório de escrita — ver `route.test.ts` para a
 * prova de que nenhum desses símbolos é sequer importado.
 *
 * Restrita a `role === "admin"` via sessão individual real (`getCurrentUser()`), independente de
 * `INDIVIDUAL_AUTH_ENABLED` — essa flag só controla a exigência de sessão para navegação geral;
 * aqui a checagem é sempre explícita e sempre exigida.
 *
 * Remover esta rota (e seu teste) assim que a causa raiz da Missão 64 estiver confirmada — não é
 * uma ferramenta de operação contínua.
 */

export const dynamic = "force-dynamic";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function jsonNoStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

/** Correlação diagnóstica sem expor o identificador real — hash irreversível, curto, determinístico (mesma entrada → mesma saída, em qualquer referenceDate consultado). */
function maskKey(value: string | null): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

const REFERENCE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface SanitizedExpectedPayment {
  acquirerTransactionKeyMasked: string;
  installmentNumber: number;
  grossAmount: number;
  netAmount: number;
  previsionPaymentDate: string | null;
  originalPaymentDate: string | null;
}

interface SanitizedSettlement {
  acquirerTransactionKeyMasked: string;
  installmentNumber: number;
  netAmount: number;
  paymentDate: string;
  advanceRateAmount: number | null;
  advancedReceivableOriginalPaymentDate: string | null;
}

interface StonePayloadDiagnosticResponse {
  referenceDate: string;
  status: string;
  error: string | null;
  hasFinancialTransactionsAccountsSection: boolean;
  salesCount: number;
  settlementsInstallmentCount: number;
  expectedPayments: SanitizedExpectedPayment[];
  settlements: SanitizedSettlement[];
}

function sanitizeSaleInstallment(sale: StoneTransaction, installment: StoneInstallment): SanitizedExpectedPayment {
  return {
    acquirerTransactionKeyMasked: maskKey(sale.acquirerTransactionKey)!,
    installmentNumber: installment.installmentNumber,
    grossAmount: installment.grossAmount,
    netAmount: installment.netAmount,
    previsionPaymentDate: installment.previsionPaymentDate,
    originalPaymentDate: installment.originalPaymentDate,
  };
}

function sanitizeSettlementInstallment(accountTx: StoneAccountTransaction, installment: StoneAccountInstallment): SanitizedSettlement {
  return {
    acquirerTransactionKeyMasked: maskKey(accountTx.acquirerTransactionKey)!,
    installmentNumber: installment.installmentNumber,
    netAmount: installment.netAmount,
    paymentDate: installment.paymentDate,
    advanceRateAmount: installment.advanceRateAmount,
    advancedReceivableOriginalPaymentDate: installment.advancedReceivableOriginalPaymentDate,
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonNoStore({ error: "Não autorizado." }, 401);
  if (user.role !== "admin") return jsonNoStore({ error: "Acesso restrito a administradores." }, 403);

  const url = new URL(request.url);
  const params = url.searchParams;

  // Só `referenceDate` é aceito — qualquer outro parâmetro (fromDate/toDate/etc.) é rejeitado
  // explicitamente para nunca virar um explorador genérico da API Stone (Missão 66, Parte E).
  const allowedParams = new Set(["referenceDate"]);
  for (const key of params.keys()) {
    if (!allowedParams.has(key)) return jsonNoStore({ error: `Parâmetro não permitido: "${key}". Só "referenceDate" é aceito.` }, 400);
  }

  const referenceDate = params.get("referenceDate");
  if (!referenceDate || !REFERENCE_DATE_PATTERN.test(referenceDate)) {
    return jsonNoStore({ error: 'Informe "referenceDate" no formato YYYY-MM-DD.' }, 400);
  }

  const result = await getConciliationFile(referenceDate, "XML2_4");

  if (result.status !== "ok" || !result.file) {
    // `result.error`/`limitations` já vêm sanitizados por `service.ts` (CATEGORY_MESSAGES) — nunca a mensagem crua do upstream.
    const response: StonePayloadDiagnosticResponse = {
      referenceDate,
      status: result.status,
      error: result.error,
      hasFinancialTransactionsAccountsSection: false,
      salesCount: 0,
      settlementsInstallmentCount: 0,
      expectedPayments: [],
      settlements: [],
    };
    return jsonNoStore(response, 200);
  }

  const file = result.file;

  const expectedPayments = file.financialTransactions.flatMap((sale) => sale.installments.map((installment) => sanitizeSaleInstallment(sale, installment)));
  const settlements = file.financialTransactionsAccounts.flatMap((accountTx) => accountTx.installments.map((installment) => sanitizeSettlementInstallment(accountTx, installment)));

  const response: StonePayloadDiagnosticResponse = {
    referenceDate,
    status: result.status,
    error: null,
    hasFinancialTransactionsAccountsSection: file.financialTransactionsAccounts.length > 0,
    salesCount: file.financialTransactions.length,
    settlementsInstallmentCount: settlements.length,
    expectedPayments,
    settlements,
  };

  return jsonNoStore(response, 200);
}
