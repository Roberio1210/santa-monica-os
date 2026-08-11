"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { confirmServiceMappingAction, unmapServiceMappingAction } from "@/app/estoque/mapeamentos-servicos/actions";
import type { ServiceMapping } from "@/lib/jumppark-orders/types";
import type { ServiceCatalogEntry } from "@/lib/inventory/services-catalog";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

function ConfirmForm({ mappingId, services }: { mappingId: string; services: ServiceCatalogEntry[] }) {
  return (
    <form action={confirmServiceMappingAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={mappingId} />
      <select name="canonicalServiceId" required className={fieldClasses} aria-label="Serviço do catálogo">
        <option value="">Selecione o serviço correspondente</option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.category ? ` (${s.category})` : ""}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm">
        Confirmar mapeamento
      </Button>
    </form>
  );
}

export function ServiceMappingReviewView({ mappings, services }: { mappings: ServiceMapping[]; services: ServiceCatalogEntry[] }) {
  const [search, setSearch] = useState("");

  const { pending, confirmed } = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query ? mappings.filter((m) => m.jumpparkServiceName.toLowerCase().includes(query)) : mappings;
    return {
      pending: filtered.filter((m) => m.status === "nao_mapeado").sort((a, b) => a.jumpparkServiceName.localeCompare(b.jumpparkServiceName, "pt-BR")),
      confirmed: filtered.filter((m) => m.status === "mapeado").sort((a, b) => a.jumpparkServiceName.localeCompare(b.jumpparkServiceName, "pt-BR")),
    };
  }, [mappings, search]);

  return (
    <div className="space-y-6">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar texto do JumpPark"
        className={`${fieldClasses} w-full max-w-md`}
        aria-label="Buscar texto do JumpPark"
      />

      <Card>
        <CardHeader>
          <CardTitle>Pendentes de revisão — {pending.length}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {pending.length === 0 ? (
            <EmptyState title="Nenhum texto pendente." description="Todos os textos reais observados já foram revisados." />
          ) : (
            pending.map((m) => (
              <div key={m.id} className="rounded-lg border border-border-subtle p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">&quot;{m.jumpparkServiceName}&quot;</span>
                  <Badge variant="warning">Não mapeado</Badge>
                </div>
                {m.notes ? <p className="mt-1 text-xs text-foreground-subtle">{m.notes}</p> : null}
                <div className="mt-2">
                  <ConfirmForm mappingId={m.id} services={services} />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Confirmados — {confirmed.length}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          {confirmed.length === 0 ? (
            <EmptyState title="Nenhum mapeamento confirmado ainda." description="Confirme os textos pendentes acima para habilitar o cálculo de consumo desses serviços." />
          ) : (
            confirmed.map((m) => (
              <div key={m.id} className="rounded-lg border border-border-subtle p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-foreground-muted">
                    &quot;{m.jumpparkServiceName}&quot; <span className="text-foreground-subtle">→</span> <span className="font-medium text-foreground">{m.canonicalServiceName}</span>
                  </span>
                  <Badge variant="positive">Mapeado</Badge>
                </div>
                {m.notes ? <p className="mt-1 text-xs text-foreground-subtle">{m.notes}</p> : null}
                <form action={unmapServiceMappingAction} className="mt-2">
                  <input type="hidden" name="id" value={m.id} />
                  <Button type="submit" variant="outline" size="sm">
                    Desfazer mapeamento
                  </Button>
                </form>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
