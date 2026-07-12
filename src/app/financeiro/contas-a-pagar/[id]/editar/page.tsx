import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { AccountsPayableForm } from "@/components/finance/accounts-payable-form";
import { fetchCostCenters, fetchExpenseCategories, fetchFinancialAccounts, fetchSuppliers } from "@/lib/finance/service";
import { getFinanceRepository } from "@/lib/finance/repository-factory";
import { updateAccountsPayableAction } from "@/app/financeiro/contas-a-pagar/actions";

export const dynamic = "force-dynamic";

export default async function EditarContaAPagarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [item, suppliers, categories, costCenters, financialAccounts] = await Promise.all([
    getFinanceRepository().getAccountsPayable(id),
    fetchSuppliers(),
    fetchExpenseCategories(),
    fetchCostCenters(),
    fetchFinancialAccounts(),
  ]);

  if (!item) notFound();

  return (
    <div className="space-y-6">
      <PageHeader title="Editar conta a pagar" description={item.description} />
      <AccountsPayableForm
        mode="edit"
        action={updateAccountsPayableAction}
        suppliers={suppliers}
        categories={categories}
        costCenters={costCenters}
        financialAccounts={financialAccounts}
        initialValues={item}
      />
    </div>
  );
}
