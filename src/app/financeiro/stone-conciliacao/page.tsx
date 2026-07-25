import { PageHeader } from "@/components/shared/page-header";
import { StoneConciliacaoView } from "@/components/finance/stone-conciliacao-view";
import { getStoneConciliacaoPageData } from "@/lib/integrations/stone/pageData";
import { saoPauloDateISO } from "@/lib/utils/timezone";

export const dynamic = "force-dynamic";

export default async function StoneConciliacaoPage() {
  const today = saoPauloDateISO();
  const data = await getStoneConciliacaoPageData(today);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stone Conciliação"
        description="Conciliação financeira Stone: vendas, recebimentos, antecipações, cancelamentos e chargebacks processados via arquivo diário. Nunca é a Conta Stone — sem saldo bancário, extrato ou Pix direto da conta."
      />
      <StoneConciliacaoView data={data} today={today} />
    </div>
  );
}
