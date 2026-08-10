import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CalculationNote } from "@/components/shared/calculation-note";
import { fetchVehicleById } from "@/lib/integrations/jumppark/vehiclesQuery";
import { fetchVehicleServiceProfileById } from "@/lib/integrations/jumppark/vehicleServiceProfile";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const NOT_INFORMED = "Não informado pela fonte";

const trendLabel: Record<string, string> = {
  aumentando: "Aumentando (voltando mais rápido que o habitual)",
  caindo: "Caindo (demorando mais que o habitual para voltar)",
  estavel: "Estável",
  indefinido: "Indefinido (histórico insuficiente)",
};
const trendVariant: Record<string, "outline" | "positive" | "warning" | "critical"> = {
  aumentando: "positive",
  caindo: "warning",
  estavel: "outline",
  indefinido: "outline",
};

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className={value ? "text-sm text-foreground-muted" : "text-sm italic text-foreground-subtle"}>{value ?? NOT_INFORMED}</p>
    </div>
  );
}

export default async function VeiculoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await fetchVehicleById(id);
  if (!detail) notFound();

  const { vehicle, plateMasked, currentCustomerName, daysSinceLastVisit, totalSpent, averageTicket, averageIntervalDays, frequencyTrend, hasStoppedComing, linkedCustomers, orders, itemsByOrderId, identityReviewItemId } = detail;
  const serviceProfile = await fetchVehicleServiceProfileById(id, vehicle.visitCount ?? orders.length);

  return (
    <div className="space-y-6">
      <PageHeader
        title={vehicle.model ?? NOT_INFORMED}
        description="Perfil calculado automaticamente a partir das ordens sincronizadas da JumpPark — nenhum campo abaixo foi digitado manualmente."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/ordens/veiculos">Voltar à lista</Link>
          </Button>
        }
      />

      {identityReviewItemId ? (
        <Card className="border-critical/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-2 pt-4">
            <p className="text-sm text-critical">
              Esta placa está associada a mais de um nome de cliente distinto nas ordens — identidade classificada como <strong>ambígua</strong>, nunca fundida automaticamente.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/ordens/clientes/revisao">Ver na fila de revisão</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>1. Identidade</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-3">
          <Field label="Modelo (marca + modelo, texto livre da fonte)" value={vehicle.model} />
          <Field label="Placa (mascarada)" value={plateMasked} />
          <Field label="Marca / Placa completa / Ano / Cor" value={null} />
          <Field label="Cliente atual" value={currentCustomerName} />
          <div>
            <p className="text-xs text-foreground-subtle">Status de identidade</p>
            {identityReviewItemId ? <Badge variant="critical">Ambígua — na fila de revisão</Badge> : <Badge variant="positive">Sem ambiguidade detectada</Badge>}
          </div>
          <CalculationNote
            source="vehicles.external_id (= placa mascarada) comparado contra identity_review_items (Missão 28)"
            formula="Ambígua quando a placa mascarada tem um item ATIVO e PENDENTE na fila de revisão (mais de um nome de cliente distinto nas ordens desta placa)"
            period="Sem período — condição estrutural, sempre em relação ao estado atual"
            recordsUsed={`${orders.length} ordem(ns) deste veículo`}
            limitations="Marca, placa completa, ano e cor nunca são fornecidos pela JumpPark nesta integração (sempre nulos) — nunca inferidos a partir do modelo."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>2. Relacionamento e recorrência</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-3">
          <Field label="Quantidade de visitas" value={String(vehicle.visitCount ?? orders.length)} />
          <Field label="Primeira visita" value={vehicle.firstSeenAt ? formatDateBR(vehicle.firstSeenAt) : null} />
          <Field label="Última visita" value={vehicle.lastSeenAt ? formatDateBR(vehicle.lastSeenAt) : null} />
          <Field label="Dias sem retornar" value={daysSinceLastVisit !== null ? String(daysSinceLastVisit) : null} />
          <Field label="Intervalo médio entre visitas" value={averageIntervalDays !== null ? `${averageIntervalDays} dia(s)` : null} />
          <div>
            <p className="text-xs text-foreground-subtle">Tendência de frequência</p>
            <Badge variant={trendVariant[frequencyTrend.direction]}>{trendLabel[frequencyTrend.direction]}</Badge>
          </div>
          {hasStoppedComing ? (
            <div className="sm:col-span-3">
              <Badge variant="warning">Costumava vir e parou</Badge>
              <p className="mt-1 text-xs text-foreground-subtle">
                Dias sem retornar ({daysSinceLastVisit}) já passa de 2x o intervalo médio histórico deste veículo ({averageIntervalDays} dia(s)) — régua própria do veículo, não um limiar global.
              </p>
            </div>
          ) : null}
          <div className="sm:col-span-3">
            <CalculationNote
              source="Todas as ordens deste veículo (jumppark_service_orders), ordenadas por data"
              formula="Intervalo médio: média dos intervalos, em dias, entre visitas consecutivas em datas distintas. Tendência: gap entre as 2 últimas visitas comparado à média histórica anterior — 'aumentando' se < 70% da média, 'caindo' se > 130%."
              period="Histórico completo do veículo"
              recordsUsed={`${orders.length} ordem(ns)`}
              limitations="Tendência e 'costumava vir e parou' exigem pelo menos 3 visitas distintas — sem isso, ficam 'indefinido'/false, nunca um palpite."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Valores</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-2">
          <Field label="Valor total gasto" value={formatCurrency(totalSpent)} />
          <Field label="Ticket médio (valor por visita)" value={formatCurrency(averageTicket)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>4. Clientes associados ({linkedCustomers.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {linkedCustomers.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhum cliente identificável nas ordens deste veículo.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Nome</th>
                    <th className="pb-2 pr-3 font-medium">Visitas com este veículo</th>
                    <th className="pb-2 pr-3 font-medium">Primeira vez</th>
                    <th className="pb-2 font-medium">Última vez</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedCustomers.map((c) => (
                    <tr key={c.customerId} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/ordens/clientes/${c.customerId}`} className="text-foreground hover:text-accent">
                          {c.name ?? NOT_INFORMED}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{c.visitCount}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{formatDateBR(c.firstVisit)}</td>
                      <td className="py-2 text-foreground-muted">{formatDateBR(c.lastVisit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {linkedCustomers.length > 1 ? (
            <p className="mt-3 text-xs text-warning">
              Este veículo tem ordens associadas a mais de um cliente — pode ser legítimo (carro emprestado/segunda pessoa) ou um homônimo. Ver &quot;Identidade&quot; acima.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>5. Serviços</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 pt-0 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-foreground-subtle">Mais realizados (serviço mais realizado é o primeiro)</p>
            {serviceProfile.topServices.length === 0 ? (
              <p className="text-sm text-foreground-subtle">Nenhum item de serviço identificado nas ordens deste veículo.</p>
            ) : (
              <ul className="space-y-1.5">
                {serviceProfile.topServices.slice(0, 8).map((s) => (
                  <li key={s.category} className="flex items-center justify-between text-sm">
                    <span className="text-foreground-muted">{s.category}</span>
                    <span className="font-medium text-foreground">
                      {s.count}x — {formatCurrency(s.totalAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-foreground-subtle">{serviceProfile.multiServiceOrderCount} ordem(ns) com 2 ou mais serviços na mesma visita.</p>
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-foreground-subtle">Combinações de serviços mais frequentes</p>
            {serviceProfile.topCombinations.length === 0 ? (
              <p className="text-sm text-foreground-subtle">Nenhuma combinação identificada (precisa de ordens com 2+ serviços).</p>
            ) : (
              <ul className="space-y-1.5">
                {serviceProfile.topCombinations.map((c) => (
                  <li key={c.categories.join("+")} className="flex items-center justify-between text-sm">
                    <span className="text-foreground-muted">
                      {c.categories[0]} + {c.categories[1]}
                    </span>
                    <span className="font-medium text-foreground">{c.count}x</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {serviceProfile.neverDoneOpportunities.length > 0 ? (
            <div className="sm:col-span-2">
              <p className="mb-2 text-xs font-medium text-foreground-subtle">
                Nunca realizados — oportunidade (veículo com {vehicle.visitCount ?? orders.length} visitas, evidência suficiente)
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {serviceProfile.neverDoneOpportunities.map((c) => (
                  <li key={c}>
                    <Badge variant="warning">{c}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <CalculationNote
              source="jumppark_service_order_items, ligados às ordens deste veículo"
              formula="Categoria derivada da descrição real do serviço (texto antes de ' - '). 'Nunca realizado' só aparece com 3+ visitas — evidência insuficiente antes disso."
              period="Histórico completo do veículo"
              recordsUsed={`${orders.length} ordem(ns)`}
              limitations="Nomes de serviço inconsistentes na fonte podem gerar categorias parecidas mas distintas — nunca inferimos serviço a partir do valor da ordem."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>6. Histórico cronológico ({orders.length} ordem(ns))</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {orders.length === 0 ? (
            <p className="text-sm text-foreground-subtle">Nenhuma ordem vinculada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle text-left text-xs text-foreground-subtle">
                    <th className="pb-2 pr-3 font-medium">Data</th>
                    <th className="pb-2 pr-3 font-medium">Entrada</th>
                    <th className="pb-2 pr-3 font-medium">Saída</th>
                    <th className="pb-2 pr-3 font-medium">Cliente</th>
                    <th className="pb-2 pr-3 font-medium">Serviço(s)</th>
                    <th className="pb-2 pr-3 font-medium">Valor</th>
                    <th className="pb-2 pr-3 font-medium">Situação</th>
                    <th className="pb-2 font-medium">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-border-subtle last:border-0 hover:bg-background-elevated">
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <Link href={`/ordens/${o.id}`} className="text-foreground hover:text-accent">
                          {formatDateBR(o.orderDate)}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 text-foreground-muted">{o.entryTime ?? "—"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{o.exitTime ?? "—"}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{o.clientName ?? NOT_INFORMED}</td>
                      <td className="py-2 pr-3 text-foreground-muted">{(itemsByOrderId.get(o.id) ?? []).map((i) => i.description).join(", ") || "—"}</td>
                      <td className="py-2 pr-3 font-medium text-foreground">{formatCurrency(Number(o.totalAmount))}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline">{o.situation ?? NOT_INFORMED}</Badge>
                      </td>
                      <td className="py-2 text-foreground-subtle">{o.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>7. Origem e sincronização</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 pt-0 sm:grid-cols-2">
          <Field label="Origem" value="JumpPark → Neon (recálculo automático a cada sincronização)" />
          <Field label="Última atualização deste registro" value={new Date(vehicle.updatedAt).toLocaleString("pt-BR")} />
        </CardContent>
      </Card>
    </div>
  );
}
