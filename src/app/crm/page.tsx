import { PageHeader } from "@/components/shared/page-header";
import { CrmSearchBar } from "@/components/crm/search-bar";
import { CrmSearchResults } from "@/components/crm/search-results";
import { searchCrm } from "@/lib/crm-intelligente/service";

export const dynamic = "force-dynamic";

export default async function CrmPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const results = query.length >= 2 ? await searchCrm(query) : null;

  return (
    <div className="space-y-5">
      <PageHeader title="CRM Inteligente" description="Memória completa de cada cliente e veículo — nome, telefone ou placa." />
      <CrmSearchBar initialQuery={query} />
      <CrmSearchResults query={query} results={results} />
    </div>
  );
}
