"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { formatDateBR } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import { MIN_SAMPLES_FOR_PROVISIONAL, PREFERRED_SAMPLES_FOR_APPROVAL } from "@/lib/recipes/types";
import type { RecipeStatus } from "@/lib/recipes/types";
import type { RecipeDetail } from "@/lib/recipes/catalog";
import {
  addSampleAction,
  approveRecipeAction,
  createNewVersionAction,
  editRecipeAction,
  excludeSampleAction,
  suspendRecipeAction,
  type FormActionState,
} from "@/app/estoque/receitas/actions";

const statusMeta: Record<RecipeStatus, { label: string; variant: "outline" | "warning" | "positive" | "critical" }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  em_calibracao: { label: "Em calibração", variant: "warning" },
  aprovada: { label: "Aprovada", variant: "positive" },
  suspensa: { label: "Suspensa", variant: "critical" },
};

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const initialState: FormActionState = { error: null, success: null };

function IndicatorCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-foreground-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </Card>
  );
}

function ExcludeSampleForm({ sampleId, recipeId }: { sampleId: string; recipeId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(excludeSampleAction, initialState);

  if (!open) {
    return (
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="h-7 px-2 text-xs">
        Excluir do cálculo
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-background-elevated p-2">
      <input type="hidden" name="sampleId" value={sampleId} />
      <input type="hidden" name="recipeId" value={recipeId} />
      <input name="reason" required placeholder="Justificativa da exclusão (obrigatória)" className={cn(fieldClasses, "text-xs")} aria-label="Justificativa da exclusão" />
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Excluindo..." : "Confirmar exclusão"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
      {state.error ? <p className="text-xs text-critical">{state.error}</p> : null}
    </form>
  );
}

export function RecipeDetailView({ detail }: { detail: RecipeDetail }) {
  const { recipe, samples, itemName, itemBrand, itemUnit, serviceName, versionHistory } = detail;
  const [editState, editAction, editPending] = useActionState(editRecipeAction, initialState);
  const [sampleState, sampleAction, samplePending] = useActionState(addSampleAction, initialState);

  const canApprove = recipe.status !== "suspensa" && recipe.sampleCount >= MIN_SAMPLES_FOR_PROVISIONAL;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusMeta[recipe.status].variant}>{statusMeta[recipe.status].label}</Badge>
        <span className="text-xs text-foreground-subtle">Versão {recipe.version}</span>
        <form action={approveRecipeAction}>
          <input type="hidden" name="id" value={recipe.id} />
          <Button type="submit" size="sm" disabled={!canApprove} title={!canApprove ? `Requer ao menos ${MIN_SAMPLES_FOR_PROVISIONAL} amostras válidas` : undefined}>
            Aprovar
          </Button>
        </form>
        <form action={suspendRecipeAction}>
          <input type="hidden" name="id" value={recipe.id} />
          <Button type="submit" size="sm" variant="outline" disabled={recipe.status === "suspensa"}>
            Suspender
          </Button>
        </form>
        <form action={createNewVersionAction}>
          <input type="hidden" name="id" value={recipe.id} />
          <Button type="submit" size="sm" variant="outline">
            Criar nova versão
          </Button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <IndicatorCard label="Consumo esperado (mediana)" value={recipe.quantityPerService !== null ? `${recipe.quantityPerService} ${itemUnit}` : "Aguardando calibração"} />
        <IndicatorCard label="Mín. / Máx. observados" value={recipe.minObserved !== null && recipe.maxObserved !== null ? `${recipe.minObserved} – ${recipe.maxObserved} ${itemUnit}` : "Sem dados suficientes"} />
        <IndicatorCard label="Amostras válidas" value={`${recipe.sampleCount} (mínimo ${MIN_SAMPLES_FOR_PROVISIONAL}, preferido ${PREFERRED_SAMPLES_FOR_APPROVAL})`} />
        <IndicatorCard label="Última calibração" value={recipe.lastCalibratedAt ? formatDateBR(recipe.lastCalibratedAt) : "Nunca calibrada"} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Combinação</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 pt-0 text-sm sm:grid-cols-3">
          <Row label="Serviço" value={serviceName} />
          <Row label="Categoria de veículo" value={recipe.vehicleCategory} />
          <Row label="Etapa" value={recipe.processStep} />
          <Row label="Produto" value={`${itemName} (${itemBrand})`} />
          <Row label="Unidade" value={itemUnit} />
          <Row label="Diluição" value={recipe.dilutionRatio !== null ? `1:${recipe.dilutionRatio}` : "Produto puro"} />
        </CardContent>
      </Card>

      {recipe.status === "rascunho" ? (
        <Card>
          <CardHeader>
            <CardTitle>Editar receita (rascunho)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <form action={editAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input type="hidden" name="id" value={recipe.id} />
              <input name="dilutionRatio" type="text" inputMode="decimal" defaultValue={recipe.dilutionRatio ?? ""} placeholder="Diluição (vazio = puro)" className={fieldClasses} aria-label="Diluição" />
              <textarea name="notes" defaultValue={recipe.notes ?? ""} placeholder="Observações" className={cn(fieldClasses, "h-9 sm:col-span-2")} aria-label="Observações" />
              <div className="flex items-center gap-2 sm:col-span-3">
                <Button type="submit" size="sm" disabled={editPending}>
                  {editPending ? "Salvando..." : "Salvar alterações"}
                </Button>
                {editState.success ? <p className="text-xs text-positive">{editState.success}</p> : null}
                {editState.error ? <p className="text-xs text-critical">{editState.error}</p> : null}
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Adicionar amostra de calibração</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recipe.status === "suspensa" ? (
            <p className="text-sm text-foreground-subtle">Receita suspensa não aceita novas amostras — crie uma nova versão primeiro.</p>
          ) : (
            <form action={sampleAction} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input type="hidden" name="recipeId" value={recipe.id} />
              <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClasses} aria-label="Data" />
              <input name="quantityBefore" type="text" inputMode="decimal" required placeholder={`Quantidade antes (${itemUnit})`} className={fieldClasses} aria-label="Quantidade antes" />
              <input name="quantityAfter" type="text" inputMode="decimal" required placeholder={`Quantidade depois (${itemUnit})`} className={fieldClasses} aria-label="Quantidade depois" />
              <input name="preparedQuantity" type="text" inputMode="decimal" placeholder="Quantidade preparada (opcional)" className={fieldClasses} aria-label="Quantidade preparada" />
              <input name="dilutionRatio" type="text" inputMode="decimal" placeholder="Diluição desta amostra (opcional)" className={fieldClasses} aria-label="Diluição da amostra" />
              <input name="leftoverReused" type="text" inputMode="decimal" placeholder="Sobra reaproveitada (opcional)" className={fieldClasses} aria-label="Sobra reaproveitada" />
              <input name="discarded" type="text" inputMode="decimal" placeholder="Descarte (opcional)" className={fieldClasses} aria-label="Descarte" />
              <input name="responsibleName" type="text" placeholder="Responsável" className={fieldClasses} aria-label="Responsável" />
              <input name="serviceOrderExternalId" type="text" placeholder="Ordem JumpPark (opcional)" className={fieldClasses} aria-label="Ordem JumpPark" />
              <textarea name="notes" placeholder="Observações" className={cn(fieldClasses, "h-9 sm:col-span-3")} aria-label="Observações da amostra" />
              <div className="flex items-center gap-2 sm:col-span-3">
                <Button type="submit" size="sm" disabled={samplePending}>
                  {samplePending ? "Registrando..." : "Registrar amostra"}
                </Button>
                {sampleState.success ? <p className="text-xs text-positive">{sampleState.success}</p> : null}
                {sampleState.error ? <p className="text-xs text-critical">{sampleState.error}</p> : null}
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Amostras — {samples.length}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {samples.length === 0 ? (
            <EmptyState title="Nenhuma amostra registrada ainda." />
          ) : (
            <ul className="space-y-2">
              {samples.map((s) => (
                <li key={s.id} className={cn("rounded-lg border p-3 text-sm", s.status === "excluida" ? "border-critical/30 bg-critical-bg/30" : "border-border-subtle")}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-foreground-muted">{formatDateBR(s.date)}</span>
                    <span className="font-medium text-foreground">
                      Concentrado: {s.concentrateConsumed} {itemUnit}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground-subtle">
                    <span>
                      Antes/depois: {s.quantityBefore} → {s.quantityAfter}
                    </span>
                    {s.preparedQuantity !== null ? <span>Preparado: {s.preparedQuantity}</span> : null}
                    {s.dilutionRatio !== null ? <span>Diluição: 1:{s.dilutionRatio}</span> : null}
                    {s.responsibleName ? <span>Responsável: {s.responsibleName}</span> : null}
                    {s.serviceOrderExternalId ? <span>Ordem: {s.serviceOrderExternalId}</span> : null}
                  </div>
                  {s.status === "excluida" ? (
                    <p className="mt-1 text-xs text-critical">Excluída do cálculo — motivo: {s.exclusionReason}</p>
                  ) : (
                    <div className="mt-2">
                      <ExcludeSampleForm sampleId={s.id} recipeId={recipe.id} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {versionHistory.length > 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>Histórico de versões</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="space-y-1">
              {versionHistory.map((v) => (
                <li key={v.id}>
                  <Link
                    href={`/estoque/receitas/${v.id}`}
                    className={cn("flex items-center justify-between rounded-lg border p-2 text-sm hover:border-accent/50 hover:bg-background-elevated", v.id === recipe.id ? "border-accent/50 bg-background-elevated" : "border-border-subtle")}
                  >
                    <span>
                      v{v.version} {v.id === recipe.id ? "(atual)" : ""}
                    </span>
                    <Badge variant={statusMeta[v.status].variant}>{statusMeta[v.status].label}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border-subtle pb-1.5">
      <span className="text-foreground-subtle">{label}</span>
      <span className="text-foreground-muted">{value}</span>
    </div>
  );
}
