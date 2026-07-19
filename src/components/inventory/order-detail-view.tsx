"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { orderConsumptionStatusLabels, classifyOrderStatus, type OrderConsumptionStatus } from "@/lib/orders/status";
import { orderVehicleCategories } from "@/lib/orders/types";
import type { OrderVehicleCategory } from "@/lib/orders/types";
import type { OrderDetail } from "@/lib/orders/order-detail";
import type { InventoryConsumptionMode } from "@/lib/config/env";
import {
  confirmConsumptionAction,
  confirmVehicleCategoryAction,
  mapJumpparkServiceAction,
  reverseConsumptionAction,
  type ConfirmConsumptionFormState,
  type FormActionState,
  type ReverseFormState,
} from "@/app/estoque/ordens/actions";

const initialFormActionState: FormActionState = { error: null, success: null };
const initialConfirmConsumptionState: ConfirmConsumptionFormState = { error: null, success: null };
const initialReverseFormState: ReverseFormState = { error: null, success: null };

const fieldClasses =
  "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const statusVariant: Record<OrderConsumptionStatus, "outline" | "warning" | "positive" | "critical"> = {
  bloqueado: "critical",
  previa_disponivel: "warning",
  aguardando_confirmacao: "warning",
  confirmado: "positive",
  parcialmente_confirmado: "warning",
  estornado: "outline",
};

interface EditableLine {
  itemId: string;
  itemName: string;
  recipeId: string | null;
  processStep: string | null;
  expectedQuantity: number | null;
  unit: string;
  confirmedQuantity: string;
  justification: string;
  removed: boolean;
  removeReason: string;
}

function VehicleCategoryForm({ externalId, plate, currentCategory }: { externalId: string; plate: string | null; currentCategory: OrderVehicleCategory }) {
  const [state, formAction, isPending] = useActionState(confirmVehicleCategoryAction, initialFormActionState);
  if (!plate) return <Unavailable label="Placa não informada — não é possível classificar." />;

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="externalId" value={externalId} />
      <input type="hidden" name="plate" value={plate} />
      <div>
        <label className="mb-1 block text-xs text-foreground-subtle">Categoria</label>
        <select name="category" required defaultValue="" className={fieldClasses} aria-label="Categoria do veículo">
          <option value="" disabled>
            Selecione
          </option>
          {orderVehicleCategories
            .filter((c) => c !== "desconhecido")
            .map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
        </select>
      </div>
      <input name="responsibleName" required placeholder="Responsável" className={fieldClasses} aria-label="Responsável" />
      <input name="reason" required placeholder="Motivo (ex.: confirmado visualmente)" className={cn(fieldClasses, "min-w-[220px]")} aria-label="Motivo" />
      <Button type="submit" size="sm" disabled={isPending}>
        {isPending ? "Salvando..." : `Confirmar categoria${currentCategory !== "desconhecido" ? " (alterar)" : ""}`}
      </Button>
      {state.error ? <p className="w-full text-xs text-critical">{state.error}</p> : null}
    </form>
  );
}

function MapServiceForm({ externalId, mappingId, services }: { externalId: string; mappingId: string; services: OrderDetail["services"] }) {
  const [state, formAction, isPending] = useActionState(mapJumpparkServiceAction, initialFormActionState);
  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="externalId" value={externalId} />
      <input type="hidden" name="mappingId" value={mappingId} />
      <select name="canonicalServiceId" required defaultValue="" className={fieldClasses} aria-label="Mapear para serviço canônico">
        <option value="" disabled>
          Selecione o serviço canônico
        </option>
        {services.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" disabled={isPending}>
        {isPending ? "Mapeando..." : "Mapear"}
      </Button>
      {state.error ? <p className="text-xs text-critical">{state.error}</p> : null}
    </form>
  );
}

function Unavailable({ label }: { label: string }) {
  return <span className="text-sm italic text-foreground-subtle">{label}</span>;
}

export function OrderDetailView({ detail, mode }: { detail: OrderDetail; mode: InventoryConsumptionMode }) {
  const router = useRouter();
  const { order, vehicleCategory, preview, confirmations, serviceMappings, services, items } = detail;

  const activeConfirmation = confirmations.find((c) => c.status !== "estornada");
  const displayStatus = classifyOrderStatus(preview, confirmations[0]?.status ?? null);

  const [lines, setLines] = useState<EditableLine[]>(() =>
    preview.lines.map((l) => ({
      itemId: l.itemId,
      itemName: l.itemName,
      recipeId: l.recipeId,
      processStep: l.processStep,
      expectedQuantity: l.expectedQuantity,
      unit: l.unit,
      confirmedQuantity: String(l.expectedQuantity),
      justification: "",
      removed: false,
      removeReason: "",
    })),
  );
  const [extraItemId, setExtraItemId] = useState("");
  const [extraQuantity, setExtraQuantity] = useState("");
  const [extraJustification, setExtraJustification] = useState("");
  const [extras, setExtras] = useState<EditableLine[]>([]);
  const [responsibleName, setResponsibleName] = useState("");
  const [generalJustification, setGeneralJustification] = useState("");

  const [confirmState, confirmFormAction, isConfirming] = useActionState(confirmConsumptionAction, initialConfirmConsumptionState);
  const [reverseState, reverseFormAction, isReversing] = useActionState(reverseConsumptionAction, initialReverseFormState);

  const activeLines = lines.filter((l) => !l.removed);
  const removedLines = lines.filter((l) => l.removed);
  const isPartial = removedLines.length > 0 || activeLines.length < preview.lines.length;

  const payloadLines = useMemo(
    () =>
      [...activeLines, ...extras].map((l) => ({
        itemId: l.itemId,
        recipeId: l.recipeId,
        processStep: l.processStep,
        expectedQuantity: l.expectedQuantity,
        confirmedQuantity: Number(l.confirmedQuantity.replace(",", ".")) || 0,
        justification: l.justification.trim() || null,
        isExtra: extras.some((e) => e.itemId === l.itemId),
      })),
    [activeLines, extras],
  );

  const removedItemsLog = removedLines.map((l) => ({ itemName: l.itemName, recipeId: l.recipeId, reason: l.removeReason }));

  const canConfirm = mode === "preview_and_confirm" && (preview.state === "pronta" || preview.state === "parcial") && !activeConfirmation && payloadLines.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={statusVariant[displayStatus]}>{orderConsumptionStatusLabels[displayStatus]}</Badge>
        <span className="text-xs text-foreground-subtle">Modo: {mode}</span>
        <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
          Atualizar prévia
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ordem</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 pt-0 text-sm sm:grid-cols-3">
          <Row label="Data" value={`${formatDateBR(order.date)} ${order.time ?? ""}`} />
          <Row label="Cliente" value={order.clientName ?? "Não informado"} />
          <Row label="Veículo" value={order.vehicleModel} />
          <Row label="Placa" value={order.plateMasked} />
          <Row label="Valor" value={formatCurrency(order.totalAmount)} />
          <Row label="Situação JumpPark" value={order.situation} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categoria do veículo</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="mb-2 flex items-center gap-2">
            <span className="text-sm text-foreground-muted">Atual:</span>
            <Badge variant={vehicleCategory === "desconhecido" ? "warning" : "positive"}>{vehicleCategory}</Badge>
          </div>
          <VehicleCategoryForm externalId={order.externalId} plate={order.plateNormalized} currentCategory={vehicleCategory} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Serviços da ordem</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {order.services.map((s) => {
            const mapping = serviceMappings.find((m) => m.jumpparkServiceName === s.description);
            return (
              <div key={s.description} className="rounded-lg border border-border-subtle p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{s.description}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-foreground-subtle">{formatCurrency(s.amount)}</span>
                    <Badge variant={mapping?.status === "mapeado" ? "positive" : "warning"}>{mapping?.status === "mapeado" ? mapping.canonicalServiceName : "Não mapeado"}</Badge>
                  </span>
                </div>
                {mapping && mapping.status === "nao_mapeado" ? <MapServiceForm externalId={order.externalId} mappingId={mapping.id} services={services} /> : null}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prévia de consumo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {preview.blockingReasons.length > 0 ? (
            <ul className="space-y-1 text-xs text-critical">
              {preview.blockingReasons.map((r, i) => (
                <li key={i}>• {r}</li>
              ))}
            </ul>
          ) : null}

          {preview.servicesWithoutApprovedRecipe.map((s) => (
            <div key={s.serviceLineDescription} className="rounded-lg border border-warning/30 bg-warning-bg/30 p-2 text-xs text-foreground-muted">
              <strong>{s.serviceLineDescription}</strong> ({s.canonicalServiceName}): {s.reason}{" "}
              <Link href="/estoque/calibracao" className="text-accent hover:underline">
                Usar esta ordem para calibração
              </Link>
              {" · "}
              <Link href="/estoque/receitas/nova" className="text-accent hover:underline">
                Criar receita
              </Link>
            </div>
          ))}

          {preview.itemsWithoutProduct.map((i, idx) => (
            <p key={idx} className="text-xs text-critical">
              {i.description}
            </p>
          ))}
          {preview.unitMismatches.map((i, idx) => (
            <p key={idx} className="text-xs text-critical">
              {i.description}
            </p>
          ))}
          {preview.itemsWithInsufficientBalance.map((i, idx) => (
            <p key={idx} className="text-xs text-warning">
              Saldo insuficiente — {i.description}
            </p>
          ))}

          {preview.lines.length === 0 ? (
            <EmptyState title="Nenhum produto na prévia." description="Nenhum serviço desta ordem tem receita aprovada ainda." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Produto</th>
                    <th className="pb-2 pr-3 font-medium">Esperado</th>
                    <th className="pb-2 pr-3 font-medium">Saldo atual → projetado</th>
                    <th className="pb-2 pr-3 font-medium">Custo conhecido</th>
                    {!activeConfirmation ? (
                      <>
                        <th className="pb-2 pr-3 font-medium">Consumo confirmado</th>
                        <th className="pb-2 pr-3 font-medium">Justificativa</th>
                        <th className="pb-2 font-medium">Remover</th>
                      </>
                    ) : null}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={line.itemId} className={cn("border-b border-border-subtle last:border-0", line.removed && "opacity-50")}>
                      <td className="py-2 pr-3 font-medium text-foreground">{line.itemName}</td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {line.expectedQuantity} {line.unit}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {preview.lines[idx]?.currentBalance} → {preview.lines[idx]?.projectedBalance} {line.unit}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{preview.lines[idx]?.knownCost !== null ? formatCurrency(preview.lines[idx]!.knownCost!) : "Não informado"}</td>
                      {!activeConfirmation ? (
                        <>
                          <td className="py-2 pr-3">
                            <input
                              type="text"
                              inputMode="decimal"
                              disabled={line.removed}
                              value={line.confirmedQuantity}
                              onChange={(e) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, confirmedQuantity: e.target.value } : l)))}
                              className={cn(fieldClasses, "w-24")}
                              aria-label={`Consumo confirmado de ${line.itemName}`}
                            />
                          </td>
                          <td className="py-2 pr-3">
                            <input
                              type="text"
                              disabled={line.removed}
                              value={line.justification}
                              onChange={(e) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, justification: e.target.value } : l)))}
                              placeholder="Se ajustar a quantidade"
                              className={cn(fieldClasses, "w-full")}
                              aria-label={`Justificativa de ${line.itemName}`}
                            />
                          </td>
                          <td className="py-2">
                            {line.removed ? (
                              <input
                                type="text"
                                value={line.removeReason}
                                onChange={(e) => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, removeReason: e.target.value } : l)))}
                                placeholder="Motivo da remoção"
                                className={cn(fieldClasses, "w-full")}
                                aria-label={`Motivo de remover ${line.itemName}`}
                              />
                            ) : (
                              <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, removed: true } : l)))}>
                                Remover
                              </Button>
                            )}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  ))}
                  {extras.map((line, idx) => (
                    <tr key={`extra-${line.itemId}`} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 font-medium text-foreground">{line.itemName} (extra)</td>
                      <td className="py-2 pr-3 text-foreground-subtle">—</td>
                      <td className="py-2 pr-3 text-foreground-subtle">—</td>
                      <td className="py-2 pr-3 text-foreground-subtle">—</td>
                      <td className="py-2 pr-3 text-foreground-muted">
                        {line.confirmedQuantity} {line.unit}
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{line.justification}</td>
                      <td className="py-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setExtras((prev) => prev.filter((_, i) => i !== idx))}>
                          Remover
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {preview.knownCostTotal !== null ? (
            <p className="text-sm text-foreground-muted">
              Custo total conhecido: {formatCurrency(preview.knownCostTotal)}
              {preview.costIncomplete ? " (parcial — alguns itens sem custo cadastrado)" : ""}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!activeConfirmation && preview.state !== "bloqueada" ? (
        <Card>
          <CardHeader>
            <CardTitle>Adicionar item extra</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-2 pt-0">
            <select value={extraItemId} onChange={(e) => setExtraItemId(e.target.value)} className={fieldClasses} aria-label="Produto extra">
              <option value="">Selecione o produto</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit})
                </option>
              ))}
            </select>
            <input value={extraQuantity} onChange={(e) => setExtraQuantity(e.target.value)} placeholder="Quantidade" className={cn(fieldClasses, "w-28")} aria-label="Quantidade extra" />
            <input
              value={extraJustification}
              onChange={(e) => setExtraJustification(e.target.value)}
              placeholder="Justificativa (obrigatória)"
              className={cn(fieldClasses, "min-w-[200px]")}
              aria-label="Justificativa do item extra"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const item = items.find((i) => i.id === extraItemId);
                if (!item || !extraQuantity || !extraJustification.trim()) return;
                setExtras((prev) => [
                  ...prev,
                  { itemId: item.id, itemName: item.name, recipeId: null, processStep: null, expectedQuantity: null, unit: item.unit, confirmedQuantity: extraQuantity, justification: extraJustification, removed: false, removeReason: "" },
                ]);
                setExtraItemId("");
                setExtraQuantity("");
                setExtraJustification("");
              }}
            >
              Adicionar
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {!activeConfirmation ? (
        <form action={confirmFormAction}>
          <input type="hidden" name="externalId" value={order.externalId} />
          <input type="hidden" name="vehicleCategory" value={vehicleCategory} />
          <input type="hidden" name="isPartial" value={isPartial ? "on" : ""} />
          <input type="hidden" name="lines" value={JSON.stringify(payloadLines)} />
          <input type="hidden" name="removedItemsLog" value={JSON.stringify(removedItemsLog)} />
          <Card>
            <CardHeader>
              <CardTitle>Confirmar consumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <input
                name="responsibleName"
                required
                value={responsibleName}
                onChange={(e) => setResponsibleName(e.target.value)}
                placeholder="Responsável pela confirmação"
                className={cn(fieldClasses, "w-full sm:w-64")}
                aria-label="Responsável"
              />
              <textarea
                name="justification"
                value={generalJustification}
                onChange={(e) => setGeneralJustification(e.target.value)}
                placeholder={isPartial ? "Justificativa geral (obrigatória — há itens removidos ou faltando)" : "Observações (opcional)"}
                className={cn(fieldClasses, "h-16 w-full")}
                aria-label="Justificativa geral"
              />
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={!canConfirm || isConfirming}>
                  {isConfirming ? "Confirmando..." : isPartial ? "Confirmar consumo parcial" : "Confirmar consumo"}
                </Button>
                {mode !== "preview_and_confirm" ? <p className="text-xs text-warning">Modo atual ({mode}) não permite confirmar — só visualizar a prévia.</p> : null}
                {confirmState.error ? <p className="text-sm text-critical">{confirmState.error}</p> : null}
                {confirmState.success ? <p className="text-sm text-positive">{confirmState.success}</p> : null}
              </div>
            </CardContent>
          </Card>
        </form>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Histórico de confirmações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          {confirmations.length === 0 ? (
            <EmptyState title="Nenhuma confirmação registrada." />
          ) : (
            confirmations.map((c) => (
              <div key={c.id} className="rounded-lg border border-border-subtle p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    v{c.version} — {formatDateBR(c.confirmedAt.slice(0, 10))} — {c.responsibleName}
                  </span>
                  <Badge variant={c.status === "estornada" ? "outline" : c.status === "parcial" ? "warning" : "positive"}>{c.status}</Badge>
                </div>
                <ul className="mt-1 space-y-0.5 text-xs text-foreground-muted">
                  {c.lines.map((l) => (
                    <li key={l.id}>
                      {l.itemName}: {l.confirmedQuantity} {l.unit} {l.difference !== null && l.difference !== 0 ? `(esperado ${l.expectedQuantity}, dif. ${l.difference})` : ""}
                    </li>
                  ))}
                </ul>
                {c.status !== "estornada" ? (
                  <form action={reverseFormAction} className="mt-2 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="externalId" value={order.externalId} />
                    <input type="hidden" name="confirmationId" value={c.id} />
                    <input name="responsibleName" required placeholder="Responsável pelo estorno" className={fieldClasses} aria-label="Responsável pelo estorno" />
                    <input name="reason" required placeholder="Motivo do estorno" className={cn(fieldClasses, "min-w-[200px]")} aria-label="Motivo do estorno" />
                    <Button type="submit" variant="outline" size="sm" disabled={isReversing}>
                      {isReversing ? "Estornando..." : "Estornar"}
                    </Button>
                  </form>
                ) : (
                  <p className="mt-1 text-xs text-foreground-subtle">
                    Estornado por {c.reversedBy} em {c.reversedAt ? formatDateBR(c.reversedAt.slice(0, 10)) : ""} — {c.reversalReason}
                  </p>
                )}
              </div>
            ))
          )}
          {reverseState.error ? <p className="text-sm text-critical">{reverseState.error}</p> : null}
          {reverseState.success ? <p className="text-sm text-positive">{reverseState.success}</p> : null}
        </CardContent>
      </Card>
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
