import { PageHeader } from "@/components/shared/page-header";
import { StoneConciliacaoView } from "@/components/finance/stone-conciliacao-view";
import { StoneCostAnalysisView } from "@/components/finance/stone-cost-analysis-view";
import { getStoneConciliacaoPageData } from "@/lib/integrations/stone/pageData";
import { getStoneCostAnalysisPageData } from "@/lib/integrations/stone/costAnalysisPageData";
import { saoPauloDateISO, parsePeriodParams } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

interface SearchParams {
  period?: string;
  from?: string;
  to?: string;
}

export default async function StoneConciliacaoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const today = saoPauloDateISO();
  const params = await searchParams;
  const costPeriod = parsePeriodParams(params);

  const [data, costAnalysisData] = await Promise.all([getStoneConciliacaoPageData(today), getStoneCostAnalysisPageData(costPeriod.from, costPeriod.to)]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stone Conciliação"
        description="Conciliação financeira Stone: vendas, recebimentos, antecipações, cancelamentos e chargebacks processados via arquivo diário. Nunca é a Conta Stone — sem saldo bancário, extrato ou Pix direto da conta."
      />
      <StoneCostAnalysisView data={costAnalysisData} period={costPeriod} />
      <StoneConciliacaoView data={data} today={today} />
    </div>
  );
}
