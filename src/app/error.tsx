"use client";

import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/**
 * Error boundary genérico do App Router. Nunca exibe `error.message`/stack ao usuário — apenas
 * `error.digest` (identificador opaco do Next.js, seguro para logs/suporte). Detalhes reais
 * ficam nos logs de servidor da Vercel, não no cliente.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
          <AlertTriangle className="h-6 w-6 text-critical" />
          <p className="text-sm font-medium text-foreground">Ocorreu um erro inesperado.</p>
          {error.digest ? (
            <p className="text-xs text-foreground-subtle">Referência: {error.digest}</p>
          ) : null}
          <Button onClick={() => reset()}>Tentar novamente</Button>
        </CardContent>
      </Card>
    </div>
  );
}
