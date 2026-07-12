import { PageHeader } from "@/components/shared/page-header";
import { AccountsReceivableForm } from "@/components/finance/accounts-receivable-form";
import { fetchCostCenters, fetchFinancialAccounts, fetchPartners, fetchRevenueCategories } from "@/lib/finance/service";
import { createAccountsReceivableAction } from "@/app/financeiro/contas-a-receber/actions";

export const dynamic = "force-dynamic";

export default async function NovaContaAReceberPage() {
  const [partners, categories, costCenters, financialAccounts] = await Promise.all([
    fetchPartners(),
    fetchRevenueCategories(),
    fetchCostCenters(),
    fetchFinancialAccounts(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Nova conta a receber" description="Cadastro validado no servidor — persistido no PostgreSQL/Neon quando configurado." />
      <AccountsReceivableForm
        mode="create"
        action={createAccountsReceivableAction}
        partners={partners}
        categories={categories}
        costCenters={costCenters}
        financialAccounts={financialAccounts}
      />
    </div>
  );
}
