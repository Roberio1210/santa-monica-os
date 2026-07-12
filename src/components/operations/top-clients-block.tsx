import Link from "next/link";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Unavailable } from "@/components/shared/unavailable";

/**
 * O sistema ainda não tem um CRM real (histórico de visitas, ticket por cliente, recorrência) —
 * só o cadastro demonstrativo em /clientes. Nunca inventamos "top clientes" sem essa fonte.
 */
export function TopClientsBlock() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          Top clientes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <Unavailable label="CRM ainda não disponível." />
        <div>
          <Button asChild variant="outline">
            <Link href="/clientes">Ver clientes</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
