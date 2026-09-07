"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { deferPlateConflictReviewAction, resolvePlateConflictDifferentVehiclesAction, resolvePlateConflictSameVehicleAction } from "@/app/ordens/clientes/revisao/actions";
import type { PlateConflictActionState } from "@/lib/integrations/jumppark/plateConflictResolution";

/**
 * Missão 28 (Etapa E6) — as três ações humanas do conflito de placa, isoladas num Client
 * Component pequeno (o card em volta, `PlateConflictReviewCard`, continua Server Component).
 * "É o mesmo veículo" exige um passo de confirmação explícita antes de submeter (ação mais
 * sensível, Missão 24/28) — as outras duas são de um clique só, mesmo padrão de risco das ações
 * já existentes na fila legada (`keepSeparateAction`/`deferReviewAction`).
 *
 * Sucesso/erro nunca é escondido: cada `useActionState` devolve `{error, success}` (mesmo padrão
 * de `reverseConsumptionAction`, `src/app/estoque/ordens/actions.ts`), renderizados diretamente.
 * `revalidatePath` (dentro das actions) atualiza a lista da página no sucesso — o item resolvido
 * sai da lista de pendentes na atualização seguinte do Server Component pai.
 */

const initialState: PlateConflictActionState = { error: null, success: null };

export function PlateConflictActions({ reviewItemId }: { reviewItemId: string }) {
  const [sameVehicleState, sameVehicleFormAction, isResolvingSameVehicle] = useActionState(resolvePlateConflictSameVehicleAction, initialState);
  const [differentState, differentFormAction, isResolvingDifferent] = useActionState(resolvePlateConflictDifferentVehiclesAction, initialState);
  const [deferState, deferFormAction, isDeferring] = useActionState(deferPlateConflictReviewAction, initialState);
  const [confirmingSameVehicle, setConfirmingSameVehicle] = useState(false);

  const successMessage = sameVehicleState.success ?? differentState.success ?? deferState.success;
  const errorMessage = sameVehicleState.error ?? differentState.error ?? deferState.error;

  if (successMessage) {
    return (
      <div className="border-t border-border-subtle pt-3">
        <p className="text-sm text-positive">{successMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t border-border-subtle pt-3">
      {confirmingSameVehicle ? (
        <div className="space-y-2 rounded-lg border border-warning/40 bg-warning-bg p-3">
          <p className="text-sm font-medium text-foreground">Confirma que estes dois registros representam o mesmo veículo?</p>
          <p className="text-xs text-foreground-muted">
            O veículo já cadastrado passa a receber automaticamente as próximas atualizações desta placa vindas da JumpPark. Nada é apagado; a decisão
            fica registrada e pode ser revertida manualmente depois, se necessário.
          </p>
          <form action={sameVehicleFormAction} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="reviewItemId" value={reviewItemId} />
            <Button type="submit" size="sm" disabled={isResolvingSameVehicle}>
              {isResolvingSameVehicle ? "Confirmando..." : "Confirmar vínculo"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setConfirmingSameVehicle(false)} disabled={isResolvingSameVehicle}>
              Cancelar
            </Button>
          </form>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setConfirmingSameVehicle(true)}>
            É o mesmo veículo
          </Button>

          <form action={differentFormAction}>
            <input type="hidden" name="reviewItemId" value={reviewItemId} />
            <Button type="submit" size="sm" variant="outline" disabled={isResolvingDifferent}>
              {isResolvingDifferent ? "Registrando..." : "São veículos diferentes"}
            </Button>
          </form>

          <form action={deferFormAction}>
            <input type="hidden" name="reviewItemId" value={reviewItemId} />
            <Button type="submit" size="sm" variant="outline" disabled={isDeferring}>
              {isDeferring ? "Adiando..." : "Não tenho certeza"}
            </Button>
          </form>
        </div>
      )}

      {errorMessage ? <p className="text-sm text-critical">{errorMessage}</p> : null}
    </div>
  );
}
