"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Search, Camera, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";
import { recommendationCategoryLabel } from "@/lib/attendance/catalog";
import { looksLikePhone, looksLikePlate } from "@/lib/attendance/search";
import { quickStartAttendanceAction, searchAttendanceAction, startAttendanceForExistingAction } from "@/app/atendimento/actions";
import type { SearchResult } from "@/lib/attendance/service";

const fieldClasses = "h-11 w-full rounded-lg border border-border bg-background-elevated px-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-accent/50";
const labelClasses = "mb-1 block text-xs font-medium text-foreground-muted";

/** Resultado da última busca concluída, sempre marcado com a query que o gerou — evita mostrar dado de uma busca anterior enquanto a nova ainda está em andamento. */
interface CompletedSearch {
  query: string;
  result: SearchResult | null;
}

export function NewAttendanceFlow() {
  const [query, setQuery] = useState("");
  const [completed, setCompleted] = useState<CompletedSearch | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [mileage, setMileage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  const isSearchable = looksLikePhone(query) || looksLikePlate(query);
  const isCurrent = completed?.query === query;
  const isFound = isSearchable && isCurrent && completed?.result !== null;
  const isNotFound = isSearchable && isCurrent && completed?.result === null;
  const isLoading = isSearchable && !isCurrent;

  useEffect(() => {
    if (!isSearchable) return;
    const timer = setTimeout(() => {
      searchAttendanceAction(query).then((found) => {
        setCompleted({ query, result: found });
        if (found) setSelectedVehicleId(found.matchedVehicleId ?? found.vehicles[0]?.id ?? null);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [query, isSearchable]);

  const result = isFound ? completed?.result ?? null : null;

  function handleStartExisting() {
    if (!result || !selectedVehicleId) return;
    setFormError(null);
    startTransition(async () => {
      try {
        await startAttendanceForExistingAction(result.customer.id, selectedVehicleId, mileage ? Number(mileage) : null);
      } catch (err) {
        if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
        setFormError("Não foi possível iniciar o atendimento. Tente novamente.");
      }
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-4">
          <label className={labelClasses} htmlFor="attendance-search">
            Telefone ou placa do veículo
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-foreground-subtle" />
            <input
              id="attendance-search"
              autoFocus
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Digite o telefone ou a placa..."
              className={`${fieldClasses} h-14 pl-11 text-lg`}
              autoComplete="off"
            />
          </div>
          {isLoading ? <p className="mt-2 text-sm text-foreground-subtle">Buscando...</p> : null}
        </CardContent>
      </Card>

      {result ? (
        <ExistingCustomerPanel
          result={result}
          selectedVehicleId={selectedVehicleId}
          onSelectVehicle={setSelectedVehicleId}
          mileage={mileage}
          onMileageChange={setMileage}
          onStart={handleStartExisting}
          isPending={isPending}
          error={formError}
        />
      ) : null}

      {isNotFound ? <QuickRegisterPanel query={query} mileage={mileage} onMileageChange={setMileage} /> : null}
    </div>
  );
}

function ExistingCustomerPanel({
  result,
  selectedVehicleId,
  onSelectVehicle,
  mileage,
  onMileageChange,
  onStart,
  isPending,
  error,
}: {
  result: SearchResult;
  selectedVehicleId: string | null;
  onSelectVehicle: (id: string) => void;
  mileage: string;
  onMileageChange: (v: string) => void;
  onStart: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const { customer, vehicles, history } = result;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {customer.name ?? "Cliente"} — {customer.phone ?? "Sem telefone"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div>
            <label className={labelClasses}>Veículo</label>
            <div className="flex flex-wrap gap-2">
              {vehicles.map((v) => (
                <Button key={v.id} type="button" variant={selectedVehicleId === v.id ? "default" : "outline"} onClick={() => onSelectVehicle(v.id)}>
                  {v.plate ?? "Placa não informada"} {v.model ? `— ${v.model}` : ""}
                </Button>
              ))}
            </div>
          </div>

          <div className="max-w-xs">
            <label className={labelClasses} htmlFor="mileage">
              Quilometragem (opcional)
            </label>
            <input id="mileage" type="number" min={0} value={mileage} onChange={(e) => onMileageChange(e.target.value)} className={fieldClasses} placeholder="Ex.: 42000" />
          </div>

          {error ? <p className="text-sm text-critical">{error}</p> : null}

          <Button type="button" onClick={onStart} disabled={!selectedVehicleId || isPending} className="h-12 w-full text-base sm:w-auto sm:px-8">
            {isPending ? "Iniciando..." : "Iniciar Diagnóstico"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico do cliente</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 pt-0 sm:grid-cols-2">
          <HistoryField label="Última visita" value={history.lastVisitAt ? formatDateBR(history.lastVisitAt.slice(0, 10)) : "Nunca visitou"} />
          <HistoryField label="Valor gasto" value={formatCurrency(history.totalSpent)} />
          <HistoryField label="Últimos serviços" value={history.lastServices.length > 0 ? history.lastServices.join(", ") : "Nenhum registrado"} />
          <div>
            <p className="text-xs font-medium text-foreground-muted">Recomendações pendentes</p>
            {history.pendingRecommendations.length === 0 ? (
              <p className="mt-1 text-sm text-foreground-subtle">Nenhuma</p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1">
                {history.pendingRecommendations.map((r) => (
                  <Badge key={r.id} variant="warning">
                    {recommendationCategoryLabel(r.category)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-medium text-foreground-muted">Observações registradas</p>
            {history.observations.length === 0 ? (
              <p className="mt-1 text-sm text-foreground-subtle">Nenhuma</p>
            ) : (
              <ul className="mt-1 list-inside list-disc text-sm text-foreground-muted">
                {history.observations.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <ShieldCheck className="h-4 w-4 text-foreground-subtle" />
            <p className="text-sm text-foreground-subtle">
              {history.activeProtections.length === 0 ? "Nenhuma proteção vigente registrada." : `${history.activeProtections.length} proteção(ões) vigente(s).`}
            </p>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Camera className="h-4 w-4 text-foreground-subtle" />
            <p className="text-sm text-foreground-subtle">Fotos da última visita — estrutura preparada, sem upload nesta versão.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HistoryField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-foreground-muted">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

function QuickRegisterPanel({ query, mileage, onMileageChange }: { query: string; mileage: string; onMileageChange: (v: string) => void }) {
  const isPhoneQuery = looksLikePhone(query);
  const isPlateQuery = looksLikePlate(query);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState(isPhoneQuery ? query : "");
  const [cpf, setCpf] = useState("");
  const [plate, setPlate] = useState(isPlateQuery ? query.toUpperCase() : "");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const canSubmit = useMemo(() => name.trim().length > 0 && phone.trim().length > 0 && plate.trim().length > 0, [name, phone, plate]);

  function handleSubmit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        await quickStartAttendanceAction(
          {
            customerName: name.trim(),
            customerPhone: phone.trim(),
            customerCpf: cpf.trim() || null,
            vehiclePlate: plate.trim().toUpperCase(),
            vehicleBrand: brand.trim() || null,
            vehicleModel: model.trim() || null,
            vehicleYear: year ? Number(year) : null,
            vehicleColor: color.trim() || null,
          },
          mileage ? Number(mileage) : null,
        );
      } catch (err) {
        if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
        setError("Não foi possível cadastrar. Verifique os dados e tente novamente.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cliente não encontrado — cadastro rápido</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <EmptyState title="Nenhum cadastro encontrado para essa busca." description="Preencha os dados abaixo para cadastrar e já iniciar o atendimento." />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Cliente" required>
            <input value={name} onChange={(e) => setName(e.target.value)} className={fieldClasses} placeholder="Nome completo" />
          </Field>
          <Field label="Telefone" required>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClasses} placeholder="(48) 99999-9999" />
          </Field>
          <Field label="CPF (opcional)">
            <input value={cpf} onChange={(e) => setCpf(e.target.value)} className={fieldClasses} placeholder="000.000.000-00" />
          </Field>
          <Field label="Placa" required>
            <input value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} className={fieldClasses} placeholder="ABC1D23" />
          </Field>
          <Field label="Marca">
            <input value={brand} onChange={(e) => setBrand(e.target.value)} className={fieldClasses} placeholder="Toyota" />
          </Field>
          <Field label="Modelo">
            <input value={model} onChange={(e) => setModel(e.target.value)} className={fieldClasses} placeholder="Corolla Cross" />
          </Field>
          <Field label="Ano">
            <input value={year} onChange={(e) => setYear(e.target.value)} type="number" className={fieldClasses} placeholder="2023" />
          </Field>
          <Field label="Cor">
            <input value={color} onChange={(e) => setColor(e.target.value)} className={fieldClasses} placeholder="Branco" />
          </Field>
          <Field label="Quilometragem (opcional)">
            <input value={mileage} onChange={(e) => onMileageChange(e.target.value)} type="number" min={0} className={fieldClasses} placeholder="Ex.: 42000" />
          </Field>
        </div>

        {error ? <p className="text-sm text-critical">{error}</p> : null}

        <Button type="button" onClick={handleSubmit} disabled={!canSubmit || isPending} className="h-12 w-full text-base sm:w-auto sm:px-8">
          {isPending ? "Cadastrando..." : "Cadastrar e Iniciar Diagnóstico"}
        </Button>
      </CardContent>
    </Card>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClasses}>
        {label}
        {required ? <span className="text-critical"> *</span> : null}
      </label>
      {children}
    </div>
  );
}
