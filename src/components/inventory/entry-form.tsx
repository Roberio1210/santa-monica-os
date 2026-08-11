"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { recordManualEntryAction, type FormActionState } from "@/app/estoque/actions";
import type { InventoryItemView } from "@/lib/inventory/types";

const fieldClasses = "h-9 rounded-lg border border-border bg-background-elevated px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";

const initialFormState: FormActionState = { error: null, success: null };

export function EntryForm({ items, supplierNames }: { items: InventoryItemView[]; supplierNames: string[] }) {
  const [formState, formAction, isPending] = useActionState(recordManualEntryAction, initialFormState);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [generateExpense, setGenerateExpense] = useState(false);
  const selectedItem = items.find((i) => i.id === selectedItemId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar entrada</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="mb-3 text-xs text-foreground-subtle">Sempre registrada como compra. Informar o valor pago atualiza automaticamente o custo médio do produto.</p>
        <form action={formAction} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <select name="itemId" required value={selectedItemId} onChange={(e) => setSelectedItemId(e.target.value)} className={fieldClasses} aria-label="Produto">
            <option value="">Selecione o produto</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.brand})
              </option>
            ))}
          </select>

          <input name="quantity" type="text" inputMode="decimal" required placeholder="Quantidade" className={fieldClasses} aria-label="Quantidade" />
          <input type="hidden" name="unit" value={selectedItem?.unit ?? ""} />
          <input disabled value={selectedItem ? `Unidade: ${selectedItem.unit}` : "Selecione um produto"} className={cn(fieldClasses, "text-foreground-subtle")} aria-label="Unidade (definida pelo produto selecionado)" />

          <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={fieldClasses} aria-label="Data" />
          <input name="responsible" type="text" required placeholder="Responsável" className={fieldClasses} aria-label="Responsável" />
          <input name="unitPricePaid" type="text" inputMode="decimal" placeholder="Valor pago por unidade (opcional)" className={fieldClasses} aria-label="Valor pago" />
          <input name="supplier" type="text" list="supplier-names" placeholder="Fornecedor (opcional)" className={fieldClasses} aria-label="Fornecedor" />
          <datalist id="supplier-names">
            {supplierNames.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <input name="invoiceNumber" type="text" placeholder="Número da nota (opcional)" className={fieldClasses} aria-label="Número da nota" />
          <input name="notes" type="text" placeholder="Observação (opcional)" className={cn(fieldClasses, "sm:col-span-2 lg:col-span-3")} aria-label="Observação" />

          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
            <input id="ef-generate-expense" type="checkbox" name="generateExpense" checked={generateExpense} onChange={(e) => setGenerateExpense(e.target.checked)} className="h-4 w-4" />
            <label htmlFor="ef-generate-expense" className="text-sm text-foreground-muted">
              Gerar despesa vinculada em Contas a Pagar (categoria &quot;Produtos e insumos&quot;)
            </label>
          </div>

          {generateExpense ? (
            <>
              <input name="expenseDueDate" type="date" required placeholder="Vencimento" className={fieldClasses} aria-label="Vencimento da despesa" />
              <select name="expensePaymentMethod" defaultValue="desconhecido" className={fieldClasses} aria-label="Forma de pagamento da despesa">
                <option value="desconhecido">Forma de pagamento não informada</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="debito">Débito</option>
                <option value="credito">Crédito</option>
                <option value="pix">Pix</option>
                <option value="boleto">Boleto</option>
                <option value="transferencia">Transferência</option>
                <option value="outro">Outro</option>
              </select>
              <p className="text-xs text-foreground-subtle sm:col-span-2 lg:col-span-1">
                Exige fornecedor cadastrado (selecione da lista acima) e valor pago informados — sem eles, a despesa vinculada não pode ser gerada.
              </p>
            </>
          ) : null}

          <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Registrando..." : "Registrar entrada"}
            </Button>
            {formState.error ? <p className="text-sm text-critical">{formState.error}</p> : null}
            {formState.success ? <p className="text-sm text-positive">{formState.success}</p> : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
