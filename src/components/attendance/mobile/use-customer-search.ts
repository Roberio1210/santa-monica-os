"use client";

import { useEffect, useState } from "react";
import { looksLikePhone, looksLikePlate } from "@/lib/attendance/search";
import { searchAttendanceAction, searchAttendanceByTextAction } from "@/app/atendimento/actions";
import type { SearchResult } from "@/lib/attendance/service";

const MIN_TEXT_QUERY_LENGTH = 2;

interface CompletedSearch {
  query: string;
  results: SearchResult[];
}

/**
 * Busca global compartilhada — usada tanto na tela "Buscar" quanto na Etapa 1 do wizard de Novo
 * Atendimento, nunca duplicada. Telefone/placa buscam por correspondência exata (0 ou 1
 * resultado); qualquer outro texto com 2+ caracteres busca por nome/veículo (0 a N resultados).
 * `isCurrent` garante que o resultado mostrado é sempre da query atual, mesmo com debounce em
 * andamento.
 */
export function useCustomerSearch(query: string) {
  const [completed, setCompleted] = useState<CompletedSearch | null>(null);

  const trimmed = query.trim();
  const isExactQuery = looksLikePhone(trimmed) || looksLikePlate(trimmed);
  const isSearchable = isExactQuery || trimmed.length >= MIN_TEXT_QUERY_LENGTH;
  const isCurrent = completed?.query === trimmed;
  const isLoading = isSearchable && !isCurrent;
  const results = isCurrent ? (completed?.results ?? []) : [];
  const isNotFound = isSearchable && isCurrent && results.length === 0;

  useEffect(() => {
    if (!isSearchable) return;
    const timer = setTimeout(() => {
      const search = isExactQuery
        ? searchAttendanceAction(trimmed).then((found) => (found ? [found] : []))
        : searchAttendanceByTextAction(trimmed);
      search.then((results) => {
        setCompleted({ query: trimmed, results });
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [trimmed, isSearchable, isExactQuery]);

  return { isSearchable, isLoading, isNotFound, results };
}
