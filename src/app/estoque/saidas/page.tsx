import { PageHeader } from "@/components/shared/page-header";
import { ExitForm } from "@/components/inventory/exit-form";
import { getInventoryRepository } from "@/lib/inventory/repository-factory";
import { toItemView } from "@/lib/inventory/status";
import { stripFinancialFieldsFromItems } from "@/lib/inventory/operational-view";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function SaidasPage() {
  const currentUser = await getCurrentUser();
  const rawItems = await getInventoryRepository().listItems();
  let items = rawItems.map(toItemView).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  // Missão de Usuários Individuais (V5.3) — ExitForm só usa nome/marca, mas o objeto inteiro vira prop de Client Component (vai no payload mesmo sem ser renderizado) — nunca deixar custo/valor chegarem lá para operacional.
  if (currentUser?.role === "operacional") items = stripFinancialFieldsFromItems(items);

  return (
    <div className="space-y-6">
      <PageHeader title="Saídas" description="Baixa manual por motivo — consumo, perda, descarte, teste ou outros." />
      <ExitForm items={items} />
    </div>
  );
}
