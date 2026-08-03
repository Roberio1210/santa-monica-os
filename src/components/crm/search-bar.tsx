"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { fieldClasses } from "@/components/attendance/mobile/wizard/field-styles";

export function CrmSearchBar({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);

  function submit(value: string) {
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      router.push("/crm");
      return;
    }
    router.push(`/crm?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" />
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          submit(e.target.value);
        }}
        placeholder="Nome, telefone ou placa..."
        className={`${fieldClasses} pl-9`}
        autoComplete="off"
      />
    </div>
  );
}
