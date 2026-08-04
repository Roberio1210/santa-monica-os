import Link from "next/link";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
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
      <PageHeader
        title="CRM Inteligente"
        description="Memória completa de cada cliente e veículo — nome, telefone ou placa. Fonte oficial única de identidade de cliente do Santa Monica OS."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/crm/sem-retorno">Clientes sem retorno</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/crm/fidelizacao">Fidelização</Link>
            </Button>
          </div>
        }
      />
      <CrmSearchBar initialQuery={query} />
      <CrmSearchResults query={query} results={results} />
    </div>
  );
}
