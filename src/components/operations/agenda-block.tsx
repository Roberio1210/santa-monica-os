import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Unavailable } from "@/components/shared/unavailable";

/**
 * A agenda ainda não tem fonte real integrada (a tela /agenda hoje exibe dados demonstrativos).
 * Nunca mostramos compromissos inventados aqui — apenas o aviso honesto e o link para a tela
 * existente.
 */
export function AgendaBlock() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4" />
          Agenda de hoje
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <Unavailable label="Agenda real ainda não integrada." />
        <div>
          <Button asChild variant="outline">
            <Link href="/agenda">Ver agenda</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
