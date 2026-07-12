import { PageHeader } from "@/components/shared/page-header";
import { StorageModeBadge } from "@/components/shared/storage-mode-badge";
import { ClassificationQueueView } from "@/components/finance/classification-queue-view";
import { ClassificationRulesView } from "@/components/finance/classification-rules-view";
import {
  fetchClassificationQueue,
  fetchClassificationRules,
  fetchCostCenters,
  fetchExpenseCategories,
  fetchPartners,
  fetchRevenueCategories,
  fetchSuppliers,
} from "@/lib/finance/service";
import { getStorageMode } from "@/lib/storage/mode";

export const dynamic = "force-dynamic";

export default async function ClassificacaoPage() {
  const [queue, rules, revenueCategories, expenseCategories, costCenters, suppliers, partners] = await Promise.all([
    fetchClassificationQueue(),
    fetchClassificationRules(),
    fetchRevenueCategories(),
    fetchExpenseCategories(),
    fetchCostCenters(),
    fetchSuppliers(),
    fetchPartners(),
  ]);
  const categories = [...revenueCategories, ...expenseCategories];
  const storageMode = getStorageMode();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Classificação Financeira"
        description="Fila de lançamentos pendentes de classificação gerencial e regras automáticas."
        actions={<StorageModeBadge mode={storageMode} />}
      />

      <ClassificationQueueView items={queue} categories={categories} costCenters={costCenters} suppliers={suppliers} partners={partners} />
      <ClassificationRulesView rules={rules} categories={categories} costCenters={costCenters} suppliers={suppliers} partners={partners} />
    </div>
  );
}
