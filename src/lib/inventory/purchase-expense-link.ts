import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { purchaseImportLines, purchaseImports } from "@/db/schema/inventoryAudit";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import type { AccountsPayable, FinancePaymentMethod, Supplier } from "@/lib/finance/types";

/**
 * Missão de Instrumentação Gerencial — implementa a relação
 * COMPRA → MOVIMENTAÇÃO DE ESTOQUE → CONTA A PAGAR, sem duplicidade.
 *
 * Chamado só quando o usuário pede explicitamente ("gerar despesa vinculada") ao registrar uma
 * entrada de estoque (`manual-entry.ts`), nunca automaticamente para compras já existentes —
 * nenhuma despesa é fabricada retroativamente para as 19 compras históricas sem preço/fornecedor.
 *
 * Idempotência: `accounts_payable.external_id = compra-estoque:{movementId}` (coluna já existente,
 * UNIQUE, sem migração de schema) — reprocessar a mesma movimentação nunca cria uma segunda
 * despesa; `createAccountsPayable` já verifica isso antes de inserir (mesmo padrão de
 * `recordMovement`/Estoque).
 *
 * Nunca resume/inventa o fornecedor: só cria a despesa quando o texto de fornecedor da
 * movimentação bate por nome exato (case/acento insensível) com um fornecedor REAL já cadastrado
 * em `finance.suppliers` — mesma técnica de correspondência já usada em `purchasesQuery.ts`
 * (Missão 33) para nunca inventar um vínculo.
 */

function normalizeForExactMatch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export interface LinkPurchaseToExpenseInput {
  movementId: string;
  itemName: string;
  quantity: number;
  unit: string;
  unitPricePaid: number;
  supplierText: string;
  date: string;
  dueDate: string;
  invoiceNumber: string | null;
  paymentMethod: FinancePaymentMethod;
}

const PRODUCTS_CATEGORY_NAME = "Produtos e insumos";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Valida que o fornecedor informado corresponde a um fornecedor real cadastrado — chamada ANTES
 * de qualquer escrita (inclusive antes de criar a movimentação de estoque em `manual-entry.ts`),
 * para nunca deixar uma movimentação real órfã quando a despesa vinculada não pode ser gerada.
 * Nunca resume/inventa o fornecedor: exige correspondência exata (case/acento insensível) com um
 * fornecedor real em `finance.suppliers` — mesma técnica já usada em `purchasesQuery.ts`
 * (Missão 33).
 */
export async function resolveRealSupplierOrThrow(supplierText: string): Promise<Supplier> {
  const suppliers = await getFinanceRepository().listSuppliers();
  const normalizedSupplierText = normalizeForExactMatch(supplierText);
  const supplier = suppliers.find((s) => normalizeForExactMatch(s.name) === normalizedSupplierText);
  if (!supplier) {
    throw new Error(
      `Fornecedor "${supplierText}" não corresponde a nenhum fornecedor cadastrado em Financeiro > Fornecedores. Selecione um fornecedor real da lista para gerar a despesa vinculada, ou cadastre-o primeiro.`,
    );
  }
  return supplier;
}

/**
 * Cria (ou recupera, se já existir) a conta a pagar vinculada a esta entrada de estoque. Sempre
 * chamada DEPOIS de `resolveRealSupplierOrThrow` (a movimentação de estoque já existe neste
 * ponto) — só valida aqui a categoria "Produtos e insumos" (não deveria faltar — é uma categoria
 * real já cadastrada) e re-resolve o fornecedor pelo mesmo critério, por segurança.
 */
export async function linkPurchaseToExpense(input: LinkPurchaseToExpenseInput): Promise<AccountsPayable> {
  const repo = getFinanceRepository();
  const [categories, supplier] = await Promise.all([repo.listFinancialCategories("despesa"), resolveRealSupplierOrThrow(input.supplierText)]);

  const category = categories.find((c) => c.name === PRODUCTS_CATEGORY_NAME);
  if (!category) {
    throw new Error(`Categoria "${PRODUCTS_CATEGORY_NAME}" não encontrada no plano de contas — não é possível gerar a despesa vinculada.`);
  }

  const originalAmount = round2(input.quantity * input.unitPricePaid);
  const description = `Compra: ${input.itemName} (${input.quantity} ${input.unit})`;

  const [created] = await repo.createAccountsPayable({
    description,
    supplierId: supplier.id,
    categoryId: category.id,
    competenceDate: input.date,
    dueDate: input.dueDate,
    originalAmount,
    paymentMethod: input.paymentMethod,
    documentNumber: input.invoiceNumber,
    notes: `Gerada automaticamente a partir da entrada de estoque (movimentação ${input.movementId}).`,
    externalId: `compra-estoque:${input.movementId}`,
  });

  return created;
}

/**
 * Missão Financeiro V2 (Prioridade 8) — mesma ponte acima, para compras registradas via
 * `purchase_imports`/`purchase_import_lines` (ex.: a compra Farben da missão Estoque V2 Final),
 * que deliberadamente NUNCA geram `inventory_movements` (o saldo físico só muda com a contagem
 * presencial — ver `docs` da missão de Estoque). `externalId = purchase-import:{purchaseImportId}`
 * — mesma garantia de nunca duplicar ao reprocessar. O valor usado é sempre `final_value` (custo
 * REAL efetivamente pago) somado por linha, nunca `total_item_value` (valor de tabela) — ex.: a
 * compra Farben soma R$ 502,03 aqui, nunca os R$ 1.004,05 de tabela.
 */
export interface ConvertPurchaseImportToPayableInput {
  purchaseImportId: string;
  supplierText: string;
  dueDate: string;
  paymentMethod: FinancePaymentMethod;
  financialAccountId?: string | null;
  installmentTotal?: number;
  notes?: string | null;
}

export interface PurchaseImportLineForPayable {
  id: string;
  productDescription: string | null;
  finalValue: number | null;
  totalItemValue: number | null;
  date: string | null;
}

export interface PurchaseImportTotals {
  originalAmount: number;
  competenceDate: string;
  lineCount: number;
}

/**
 * Pura — soma o custo REAL (nunca o de tabela) das linhas de uma compra, em centavos (nunca
 * acumula erro de ponto flutuante). Lança quando alguma linha não tem valor real registrado —
 * nunca lança a despesa com um valor parcial/inventado.
 */
export function computePurchaseImportTotals(lines: PurchaseImportLineForPayable[], fallbackDate: string): PurchaseImportTotals {
  if (lines.length === 0) throw new Error("Compra sem nenhuma linha — nada para lançar.");
  const totalCents = lines.reduce((sum, line) => {
    const real = line.finalValue ?? line.totalItemValue;
    if (real === null) throw new Error(`Linha "${line.productDescription ?? line.id}" não tem valor real registrado — informe antes de lançar a despesa.`);
    return sum + Math.round(real * 100);
  }, 0);
  return { originalAmount: totalCents / 100, competenceDate: lines[0].date ?? fallbackDate, lineCount: lines.length };
}

export interface PurchaseImportExpenseLinkStatus {
  /** Despesa já lançada para esta compra (via `linkPurchaseImportToExpense`), quando existir. */
  existingExpense: AccountsPayable | null;
  /** Nome de fornecedor mais frequente entre as linhas — sugestão para preencher o formulário, nunca um vínculo automático. */
  suggestedSupplierName: string | null;
}

/**
 * Consultado pela UI (`/estoque/auditoria/importar-compras/[importId]`) antes de exibir o
 * formulário "Lançar despesa" — nunca decide nada sozinho, só informa o estado atual.
 */
export async function getPurchaseImportExpenseLinkStatus(purchaseImportId: string): Promise<PurchaseImportExpenseLinkStatus> {
  const db = getDb();
  if (!db) return { existingExpense: null, suggestedSupplierName: null };

  const [existingExpense, lines] = await Promise.all([
    getFinanceRepository().getAccountsPayableByExternalId(`purchase-import:${purchaseImportId}`),
    db.select({ supplierName: purchaseImportLines.supplierName }).from(purchaseImportLines).where(eq(purchaseImportLines.importId, purchaseImportId)),
  ]);

  const counts = new Map<string, number>();
  for (const line of lines) {
    if (!line.supplierName) continue;
    counts.set(line.supplierName, (counts.get(line.supplierName) ?? 0) + 1);
  }
  let suggestedSupplierName: string | null = null;
  let maxCount = 0;
  for (const [name, count] of counts) {
    if (count > maxCount) {
      maxCount = count;
      suggestedSupplierName = name;
    }
  }

  return { existingExpense, suggestedSupplierName };
}

export async function linkPurchaseImportToExpense(input: ConvertPurchaseImportToPayableInput): Promise<AccountsPayable> {
  const db = getDb();
  if (!db) throw new Error("Banco não configurado.");

  const [purchase] = await db.select().from(purchaseImports).where(eq(purchaseImports.id, input.purchaseImportId)).limit(1);
  if (!purchase) throw new Error("Compra não encontrada.");

  const lines = await db.select().from(purchaseImportLines).where(eq(purchaseImportLines.importId, input.purchaseImportId));
  const { originalAmount, competenceDate, lineCount } = computePurchaseImportTotals(
    lines.map((l) => ({ id: l.id, productDescription: l.productDescription, finalValue: l.finalValue !== null ? Number(l.finalValue) : null, totalItemValue: l.totalItemValue !== null ? Number(l.totalItemValue) : null, date: l.date })),
    new Date().toISOString().slice(0, 10),
  );

  const repo = getFinanceRepository();
  const [categories, supplier] = await Promise.all([repo.listFinancialCategories("despesa"), resolveRealSupplierOrThrow(input.supplierText)]);
  const category = categories.find((c) => c.name === PRODUCTS_CATEGORY_NAME);
  if (!category) throw new Error(`Categoria "${PRODUCTS_CATEGORY_NAME}" não encontrada no plano de contas.`);

  const description = `Compra ${supplier.name} — ${purchase.filename ?? purchase.id} (${lineCount} item(ns))`;

  const [created] = await repo.createAccountsPayable({
    description,
    supplierId: supplier.id,
    categoryId: category.id,
    financialAccountId: input.financialAccountId ?? null,
    competenceDate,
    dueDate: input.dueDate,
    originalAmount,
    paymentMethod: input.paymentMethod,
    installmentTotal: input.installmentTotal,
    notes: `Gerada a partir da compra de estoque "${purchase.filename ?? purchase.id}" (${lines.length} linha(s), custo real R$ ${originalAmount.toFixed(2)} — nunca o valor de tabela). ${input.notes ?? ""}`.trim(),
    externalId: `purchase-import:${input.purchaseImportId}`,
  });

  return created;
}
