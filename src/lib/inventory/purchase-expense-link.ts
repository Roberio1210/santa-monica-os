import "server-only";
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
