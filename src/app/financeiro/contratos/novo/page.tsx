import { PageHeader } from "@/components/shared/page-header";
import { ContractForm } from "@/components/finance/contract-form";
import { fetchPartners } from "@/lib/finance/service";

export const dynamic = "force-dynamic";

export default async function NovoContratoPage() {
  const partners = await fetchPartners();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Novo contrato"
        description="Registra um contrato real de mensalidade ou parceria pós-paga. Nunca gera cobrança sozinho — o fechamento/baixa continua exigindo confirmação explícita."
      />
      <ContractForm partners={partners} />
    </div>
  );
}
