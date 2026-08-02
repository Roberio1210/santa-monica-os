"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerResultCard } from "@/components/attendance/mobile/customer-result-card";
import { useCustomerSearch } from "@/components/attendance/mobile/use-customer-search";

/** Consulta rápida — mesma busca global do módulo Atendimento (cliente/telefone/placa/veículo), reaproveitada aqui para abrir o atendimento correspondente sem sair da Central. */
export function QuickSearch() {
  const [query, setQuery] = useState("");
  const { isSearchable, isLoading, isNotFound, results } = useCustomerSearch(query);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consulta Rápida</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
          <input
            type="text"
            inputMode="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cliente, telefone, placa ou veículo"
            className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-foreground-subtle focus:border-accent focus:outline-none"
          />
        </div>

        {isLoading ? <p className="text-sm text-foreground-subtle">Buscando...</p> : null}
        {!isLoading && isNotFound ? <p className="text-sm text-foreground-subtle">Nenhum resultado para &quot;{query}&quot;.</p> : null}
        {!isLoading && isSearchable && results.length > 0 ? (
          <div className="space-y-3">
            {results.map((result) => (
              <CustomerResultCard key={result.customer.id} result={result} />
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
