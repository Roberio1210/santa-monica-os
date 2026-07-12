import { PageHeader } from "@/components/shared/page-header";
import { AccountsPayableForm } from "@/components/finance/accounts-payable-form";
import { fetchCostCenters, fetchExpenseCategories, fetchFinancialAccounts, fetchSuppliers } from "@/lib/finance/service";
import { createAccountsPayableAction } from "@/app/financeiro/contas-a-pagar/actions";

export const dynamic = "force-dynamic";

export default async function NovaContaAPagarPage() {
  const [suppliers, categories, costCenters, financialAccounts] = await Promise.all([
    fetchSuppliers(),
    fetchExpenseCategories(),
    fetchCostCenters(),
    fetchFinancialAccounts(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Nova conta a pagar" description="Cadastro validado no servidor — persistido no PostgreSQL/Neon quando configurado." />
      <AccountsPayableForm mode="create" action={createAccountsPayableAction} suppliers={suppliers} categories={categories} costCenters={costCenters} financialAccounts={financialAccounts} />
    </div>
  );
}
