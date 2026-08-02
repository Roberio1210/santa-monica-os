"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, UserPlus } from "lucide-react";
import { MobileTopBar } from "@/components/attendance/mobile/top-bar";
import { CustomerResultCard } from "@/components/attendance/mobile/customer-result-card";
import { useCustomerSearch } from "@/components/attendance/mobile/use-customer-search";

export default function BuscarClientePage() {
  const [query, setQuery] = useState("");
  const { isSearchable, isLoading, isNotFound, results } = useCustomerSearch(query);

  return (
    <div>
      <MobileTopBar title="Pesquisar Cliente" showBack />

      <div className="space-y-4 px-4 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground-subtle" />
          <input
            type="text"
            inputMode="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Telefone, placa, nome ou veículo"
            className="h-12 w-full rounded-xl border border-border bg-background-panel pl-10 pr-3 text-base text-foreground placeholder:text-foreground-subtle focus:border-accent focus:outline-none"
          />
        </div>

        {isLoading ? <p className="py-8 text-center text-sm text-foreground-subtle">Buscando...</p> : null}

        {!isLoading && isSearchable && results.length > 0 ? (
          <div className="space-y-3 pb-4">
            {results.map((result) => (
              <CustomerResultCard key={result.customer.id} result={result} />
            ))}
          </div>
        ) : null}

        {!isLoading && isNotFound ? (
          <div className="space-y-3 rounded-2xl border border-dashed border-border-subtle p-6 text-center">
            <p className="text-sm text-foreground-subtle">Nenhum cliente encontrado para &quot;{query}&quot;.</p>
            <Link
              href="/atendimento/novo"
              className="mx-auto flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-xl bg-accent text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98]"
            >
              <UserPlus className="h-5 w-5" />
              Cadastrar Novo Cliente
            </Link>
          </div>
        ) : null}

        {!isSearchable && query.trim().length === 0 ? (
          <p className="py-8 text-center text-sm text-foreground-subtle">Digite telefone, placa, nome ou veículo para buscar.</p>
        ) : null}
      </div>
    </div>
  );
}
