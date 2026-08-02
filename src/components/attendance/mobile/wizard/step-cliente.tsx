"use client";

import { useState } from "react";
import { Search, UserPlus } from "lucide-react";
import { useCustomerSearch } from "@/components/attendance/mobile/use-customer-search";
import { fieldClasses, labelClasses } from "@/components/attendance/mobile/wizard/field-styles";
import type { CustomerSelection } from "@/components/attendance/mobile/wizard/types";
import type { SearchResult } from "@/lib/attendance/service";

export function StepCliente({ initialCustomer, onSelect }: { initialCustomer: SearchResult | null; onSelect: (selection: CustomerSelection) => void }) {
  const [query, setQuery] = useState("");
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const { isSearchable, isLoading, isNotFound, results } = useCustomerSearch(query);

  if (initialCustomer) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-foreground-subtle">Cliente selecionado na busca:</p>
        <CustomerCard result={initialCustomer} onSelect={() => onSelect({ kind: "existing", result: initialCustomer })} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className={labelClasses} htmlFor="wizard-cliente-search">
          Telefone, placa ou nome do cliente
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground-subtle" />
          <input
            id="wizard-cliente-search"
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowRegisterForm(false);
            }}
            placeholder="Digite para buscar..."
            className={`${fieldClasses} h-14 pl-11 text-base`}
            autoComplete="off"
          />
        </div>
        {isLoading ? <p className="mt-2 text-sm text-foreground-subtle">Buscando...</p> : null}
      </div>

      {!isLoading && results.length > 0 ? (
        <div className="space-y-2.5">
          {results.map((result) => (
            <CustomerCard key={result.customer.id} result={result} onSelect={() => onSelect({ kind: "existing", result })} />
          ))}
        </div>
      ) : null}

      {!isLoading && (isNotFound || showRegisterForm) ? (
        <QuickRegisterForm initialPhone={isSearchable ? query : ""} onSubmit={(data) => onSelect({ kind: "new", ...data })} />
      ) : null}

      {!isLoading && !isNotFound && results.length === 0 && !showRegisterForm ? (
        <button
          type="button"
          onClick={() => setShowRegisterForm(true)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-subtle text-sm font-medium text-foreground-muted active:scale-[0.98]"
        >
          <UserPlus className="h-5 w-5" />
          Cadastrar cliente novo
        </button>
      ) : null}
    </div>
  );
}

function CustomerCard({ result, onSelect }: { result: SearchResult; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-2xl border border-border-subtle bg-background-panel p-4 text-left transition-transform active:scale-[0.98]"
    >
      <p className="text-base font-semibold text-foreground">{result.customer.name ?? "Cliente sem nome cadastrado"}</p>
      <p className="text-sm text-foreground-subtle">{result.customer.phone ?? "Sem telefone cadastrado"}</p>
      {result.vehicles.length > 0 ? (
        <p className="mt-1 text-xs text-foreground-subtle">
          {result.vehicles.length} veículo{result.vehicles.length > 1 ? "s" : ""} cadastrado{result.vehicles.length > 1 ? "s" : ""}
        </p>
      ) : null}
    </button>
  );
}

function QuickRegisterForm({ initialPhone, onSubmit }: { initialPhone: string; onSubmit: (data: { name: string; phone: string; cpf: string }) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(initialPhone);
  const [cpf, setCpf] = useState("");

  const canSubmit = name.trim().length > 0 && phone.trim().length > 0;

  return (
    <div className="space-y-3 rounded-2xl border border-border-subtle bg-background-panel p-4">
      <p className="text-sm font-medium text-foreground">Cadastro rápido</p>
      <div>
        <label className={labelClasses} htmlFor="wizard-cliente-nome">
          Nome completo
        </label>
        <input id="wizard-cliente-nome" value={name} onChange={(e) => setName(e.target.value)} className={fieldClasses} placeholder="Nome do cliente" />
      </div>
      <div>
        <label className={labelClasses} htmlFor="wizard-cliente-telefone">
          Telefone
        </label>
        <input id="wizard-cliente-telefone" value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClasses} placeholder="(48) 99999-9999" />
      </div>
      <div>
        <label className={labelClasses} htmlFor="wizard-cliente-cpf">
          CPF (opcional)
        </label>
        <input id="wizard-cliente-cpf" value={cpf} onChange={(e) => setCpf(e.target.value)} className={fieldClasses} placeholder="000.000.000-00" />
      </div>
      <button
        type="button"
        disabled={!canSubmit}
        onClick={() => onSubmit({ name: name.trim(), phone: phone.trim(), cpf: cpf.trim() })}
        className="flex h-12 w-full items-center justify-center rounded-xl bg-accent text-sm font-medium text-accent-foreground transition-transform active:scale-[0.98] disabled:opacity-50"
      >
        Continuar
      </button>
    </div>
  );
}
