import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { AccountsReceivableForm } from "@/components/finance/accounts-receivable-form";
import { fetchCostCenters, fetchFinancialAccounts, fetchPartners, fetchRevenueCategories } from "@/lib/finance/service";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { updateAccountsReceivableAction } from "@/app/financeiro/contas-a-receber/actions";

export const dynamic = "force-dynamic";

export default async function EditarContaAReceberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, partners, categories, costCenters, financialAccounts] = await Promise.all([
    getFinanceRepository().getAccountsReceivable(id),
    fetchPartners(),
    fetchRevenueCategories(),
    fetchCostCenters(),
    fetchFinancialAccounts(),
  ]);

  if (!item) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title="Editar conta a receber" description={item.description} />
      <AccountsReceivableForm
        mode="edit"
        action={updateAccountsReceivableAction}
        partners={partners}
        categories={categories}
        costCenters={costCenters}
        financialAccounts={financialAccounts}
        initialValues={item}
      />
    </div>
  );
}
