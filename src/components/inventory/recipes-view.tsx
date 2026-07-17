"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateBR } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { MIN_SAMPLES_FOR_PROVISIONAL, processSteps, vehicleCategories } from "@/lib/recipes/types";
import type { RecipeStatus, VehicleCategory } from "@/lib/recipes/types";
import type { RecipeWithNames } from "@/lib/recipes/catalog";

const statusMeta: Record<RecipeStatus, { label: string; variant: "outline" | "warning" | "positive" | "critical" }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  em_calibracao: { label: "Em calibração", variant: "warning" },
  aprovada: { label: "Aprovada", variant: "positive" },
  suspensa: { label: "Suspensa", variant: "critical" },
};

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

interface RecipesViewProps {
  recipes: RecipeWithNames[];
  initialStatus?: RecipeStatus;
}

export function RecipesView({ recipes, initialStatus }: RecipesViewProps) {
  const [search, setSearch] = useState("");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | VehicleCategory>("all");
  const [stepFilter, setStepFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | RecipeStatus>(initialStatus ?? "all");
  const [fewSamplesOnly, setFewSamplesOnly] = useState(false);
  const [noSamplesOnly, setNoSamplesOnly] = useState(false);

  const serviceOptions = useMemo(() => Array.from(new Set(recipes.map((r) => r.serviceName))).sort((a, b) => a.localeCompare(b, "pt-BR")), [recipes]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return recipes.filter(({ recipe, serviceName, itemName, itemBrand }) => {
      if (serviceFilter !== "all" && serviceName !== serviceFilter) return false;
      if (categoryFilter !== "all" && recipe.vehicleCategory !== categoryFilter) return false;
      if (stepFilter !== "all" && recipe.processStep !== stepFilter) return false;
      if (statusFilter !== "all" && recipe.status !== statusFilter) return false;
      if (fewSamplesOnly && !(recipe.sampleCount > 0 && recipe.sampleCount < MIN_SAMPLES_FOR_PROVISIONAL)) return false;
      if (noSamplesOnly && recipe.sampleCount !== 0) return false;
      if (query && !`${itemName} ${itemBrand}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [recipes, search, serviceFilter, categoryFilter, stepFilter, statusFilter, fewSamplesOnly, noSamplesOnly]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto"
              className={cn(fieldClasses, "min-w-[200px] flex-1")}
              aria-label="Buscar produto"
            />
            <select value={serviceFilter} onChange={(e) => setServiceFilter(e.target.value)} className={fieldClasses} aria-label="Filtrar por serviço">
              <option value="all">Todos os serviços</option>
              {serviceOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as "all" | VehicleCategory)} className={fieldClasses} aria-label="Filtrar por categoria de veículo">
              <option value="all">Todas as categorias</option>
              {vehicleCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={stepFilter} onChange={(e) => setStepFilter(e.target.value)} className={fieldClasses} aria-label="Filtrar por etapa">
              <option value="all">Todas as etapas</option>
              {processSteps.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | RecipeStatus)} className={fieldClasses} aria-label="Filtrar por status">
              <option value="all">Todos os status</option>
              {(Object.keys(statusMeta) as RecipeStatus[]).map((s) => (
                <option key={s} value={s}>
                  {statusMeta[s].label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-foreground-muted">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={fewSamplesOnly} onChange={(e) => setFewSamplesOnly(e.target.checked)} />
              Com poucas amostras (menos de {MIN_SAMPLES_FOR_PROVISIONAL})
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={noSamplesOnly} onChange={(e) => setNoSamplesOnly(e.target.checked)} />
              Sem amostras
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Receitas — {filtered.length} de {recipes.length}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {filtered.length === 0 ? (
            <EmptyState title="Nenhuma receita encontrada" description="Não há receitas para os filtros selecionados." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Serviço</th>
                    <th className="pb-2 pr-3 font-medium">Categoria</th>
                    <th className="pb-2 pr-3 font-medium">Etapa</th>
                    <th className="pb-2 pr-3 font-medium">Produto</th>
                    <th className="pb-2 pr-3 font-medium">Status</th>
                    <th className="pb-2 pr-3 font-medium">Versão</th>
                    <th className="pb-2 pr-3 font-medium">Amostras</th>
                    <th className="pb-2 pr-3 font-medium">Consumo esperado</th>
                    <th className="pb-2 pr-3 font-medium">Mín. / Máx.</th>
                    <th className="pb-2 font-medium">Última calibração</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(({ recipe, serviceName, itemName, itemBrand }) => (
                    <tr key={recipe.id} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated/50">
                      <td className="py-2 pr-3">
                        <Link href={`/estoque/receitas/${recipe.id}`} className="font-medium text-foreground hover:text-accent hover:underline">
                          {serviceName}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{recipe.vehicleCategory}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{recipe.processStep}</td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {itemName} <span className="text-xs text-foreground-subtle">({itemBrand})</span>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant={statusMeta[recipe.status].variant}>{statusMeta[recipe.status].label}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">v{recipe.version}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{recipe.sampleCount}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{recipe.quantityPerService !== null ? `${recipe.quantityPerService} ${recipe.unit}` : "Aguardando calibração"}</td>
                      <td className="py-2 pr-3 text-foreground-subtle">
                        {recipe.minObserved !== null && recipe.maxObserved !== null ? `${recipe.minObserved} – ${recipe.maxObserved}` : "—"}
                      </td>
                      <td className="py-2 text-foreground-muted">{recipe.lastCalibratedAt ? formatDateBR(recipe.lastCalibratedAt) : "Nunca calibrada"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
