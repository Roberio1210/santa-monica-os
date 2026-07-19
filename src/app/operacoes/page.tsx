import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Unavailable } from "@/components/shared/unavailable";
import { Badge } from "@/components/ui/badge";
import { OperationsView } from "@/components/operations/operations-view";
import { isJumpParkConfigured } from "@/lib/config/env";
import { fetchTodayOperations, type OperationOrder } from "@/lib/integrations/jumppark";
import { saoPauloDateISO } from "@/lib/utils/timezone";
import { Wifi } from "lucide-react";

// Consulta dados reais do JumpPark a cada acesso — nunca serve HTML estático desatualizado.
export const dynamic = "force-dynamic";

function todayIso(): string {
  return saoPauloDateISO();
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default async function OperacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const date = dateParam && isValidDate(dateParam) ? dateParam : todayIso();
  const configured = isJumpParkConfigured();

  let orders: OperationOrder[] = [];
  let loadError = false;

  if (configured) {
    try {
      orders = await fetchTodayOperations(date);
    } catch {
      loadError = true;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Movimentações de Hoje"
        description="Ordens finalizadas no dia selecionado — dados reais do JumpPark, sem números inventados."
        actions={
          configured && !loadError ? (
            <Badge variant="positive">
              <Wifi className="h-3 w-3" />
              JumpPark
            </Badge>
          ) : undefined
        }
      />

      {!configured ? (
        <Card>
          <CardContent className="pt-4">
            <Unavailable label="JumpPark não configurado — sem dados reais disponíveis nesta tela." />
          </CardContent>
        </Card>
      ) : loadError ? (
        <Card>
          <CardContent className="pt-4">
            <Unavailable label="Não foi possível consultar a API do JumpPark agora. Tente novamente em instantes." />
          </CardContent>
        </Card>
      ) : (
        <OperationsView orders={orders} date={date} />
      )}
    </div>
  );
}
