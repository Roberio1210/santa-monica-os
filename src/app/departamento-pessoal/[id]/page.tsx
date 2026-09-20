import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Wallet, TrendingUp, Gift, CalendarClock, HandCoins, Heart, Landmark, MoreHorizontal } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PeriodSelector } from "@/components/operations/period-selector";
import { StatCard } from "@/components/cards/stat-card";
import { getCollaboratorProfile } from "@/lib/hr/service";
import { CATEGORY_LABELS, outrosTotal } from "@/lib/hr/costSummary";
import { computeAdvanceOutstanding, type EmployeeAdvanceStatus } from "@/lib/hr/advances";
import { parsePeriodParams } from "@/lib/utils/timezone";
import { formatCurrency, formatDateBR } from "@/lib/utils/format";

// Ficha individual (Fase 1, 20/09/2026) — mesmo padrão de /departamento-pessoal: consulta dados
// reais a cada acesso, nunca cacheada (a folha muda a qualquer momento).
export const dynamic = "force-dynamic";

const ADVANCE_STATUS_LABEL: Record<EmployeeAdvanceStatus, string> = {
  aberto: "Aberto",
  parcialmente_compensado: "Parcialmente compensado",
  compensado: "Compensado",
};

const ADVANCE_STATUS_VARIANT: Record<EmployeeAdvanceStatus, "warning" | "info" | "positive"> = {
  aberto: "warning",
  parcialmente_compensado: "info",
  compensado: "positive",
};

export default async function ColaboradorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ period?: string; from?: string; to?: string }> }) {
  const { id } = await params;
  const searchParamsValue = await searchParams;
  const period = parsePeriodParams(searchParamsValue);
  const profile = await getCollaboratorProfile(id, { from: period.from, to: period.to });

  if (!profile) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={profile.name}
        description={`${profile.type === "employee" ? "CLT" : "PJ"} — ${profile.role ?? "função não informada"}`}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/departamento-pessoal" className="flex items-center gap-1 text-xs text-foreground-muted hover:text-foreground">
              <ArrowLeft className="h-3 w-3" />
              Voltar
            </Link>
            <Badge variant={profile.active ? "outline" : "critical"}>{profile.active ? "Ativo" : "Desligado"}</Badge>
          </div>
        }
      />

      <div className="flex flex-col gap-2">
        <PeriodSelector period={period} />
        <p className="text-sm text-foreground-muted">{period.label}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total no período" icon={Wallet} value={formatCurrency(profile.costSummary.totalGeral)} hint="Soma de todas as categorias abaixo — nunca um único 'salário'" />
        <StatCard label="Salários/fixos" icon={Wallet} value={formatCurrency(profile.costSummary.porCategoria.salario_fixo)} />
        <StatCard label="Comissões" icon={TrendingUp} value={formatCurrency(profile.costSummary.porCategoria.comissao)} />
        <StatCard label="Bônus/meta" icon={Gift} value={formatCurrency(profile.costSummary.porCategoria.bonus)} />
        <StatCard label="Diárias/freelas" icon={CalendarClock} value={formatCurrency(profile.costSummary.porCategoria.diaria_freelancer)} />
        <StatCard label="Benefícios/auxílios" icon={Heart} value={formatCurrency(profile.costSummary.porCategoria.beneficio_auxilio)} />
        <StatCard label="Adiantamentos" icon={HandCoins} value={formatCurrency(profile.costSummary.porCategoria.adiantamento)} />
        <StatCard label="Encargos/impostos" icon={Landmark} value={formatCurrency(profile.costSummary.porCategoria.encargo)} hint="Só aparece aqui quando o encargo está vinculado diretamente a esta pessoa" />
        <StatCard label="Outros pagamentos" icon={MoreHorizontal} value={formatCurrency(outrosTotal(profile.costSummary.porCategoria))} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados cadastrais</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-xs text-foreground-muted">Nome</dt>
              <dd className="font-medium text-foreground">{profile.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Vínculo</dt>
              <dd>{profile.type === "employee" ? "CLT" : "PJ"}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">CPF/CNPJ</dt>
              <dd>{profile.type === "employee" ? <span className="italic text-foreground-subtle">Não aplicável (CLT)</span> : (profile.taxId ?? <span className="italic text-foreground-subtle">Não informado</span>)}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Função/escopo</dt>
              <dd>{profile.role ?? <span className="italic text-foreground-subtle">Não informado</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Data de admissão/início</dt>
              <dd>{profile.admissionOrStart ? formatDateBR(profile.admissionOrStart) : <span className="italic text-foreground-subtle">Não informado</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Jornada</dt>
              <dd>{profile.type === "contractor" ? <span className="italic text-foreground-subtle">Não aplicável (PJ)</span> : (profile.workSchedule ?? <span className="italic text-foreground-subtle">Não informado</span>)}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Valor combinado</dt>
              <dd>{profile.agreedValueOrBaseSalary !== null ? formatCurrency(profile.agreedValueOrBaseSalary) : <span className="italic text-foreground-subtle">Não informado</span>}</dd>
            </div>
            <div>
              <dt className="text-xs text-foreground-muted">Status</dt>
              <dd><Badge variant={profile.active ? "outline" : "critical"}>{profile.active ? "Ativo" : "Desligado"}</Badge></dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de pagamentos</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {profile.payments.length === 0 ? (
            <EmptyState title="Nenhum pagamento neste período" description="Troque o período acima para ver o histórico completo deste colaborador." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-background-elevated text-xs text-foreground-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Data</th>
                    <th className="px-3 py-2 text-left font-medium">Competência</th>
                    <th className="px-3 py-2 text-left font-medium">Categoria</th>
                    <th className="px-3 py-2 text-left font-medium">Descrição</th>
                    <th className="px-3 py-2 text-left font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {profile.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2">{formatDateBR(p.date)}</td>
                      <td className="px-3 py-2">{p.competenceDate ? formatDateBR(p.competenceDate) : <span className="italic text-foreground-subtle">= data do pagamento</span>}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{CATEGORY_LABELS[p.category]}</Badge></td>
                      <td className="px-3 py-2">{p.description}</td>
                      <td className="px-3 py-2">{formatCurrency(Number(p.amount))}</td>
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
          <CardTitle>Adiantamentos</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {profile.advances.length === 0 ? (
            <EmptyState title="Nenhum adiantamento registrado" description="Este colaborador não tem nenhum adiantamento no histórico." />
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-background-elevated text-xs text-foreground-muted">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Data</th>
                    <th className="px-3 py-2 text-left font-medium">Valor</th>
                    <th className="px-3 py-2 text-left font-medium">Motivo</th>
                    <th className="px-3 py-2 text-left font-medium">Situação</th>
                    <th className="px-3 py-2 text-left font-medium">Compensado</th>
                    <th className="px-3 py-2 text-left font-medium">Saldo em aberto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {profile.advances.map((a) => (
                    <tr key={a.id}>
                      <td className="px-3 py-2">{formatDateBR(a.date)}</td>
                      <td className="px-3 py-2">{formatCurrency(Number(a.amount))}</td>
                      <td className="px-3 py-2">{a.reason ?? <span className="italic text-foreground-subtle">Não informado</span>}</td>
                      <td className="px-3 py-2"><Badge variant={ADVANCE_STATUS_VARIANT[a.status]}>{ADVANCE_STATUS_LABEL[a.status]}</Badge></td>
                      <td className="px-3 py-2">{formatCurrency(Number(a.compensatedAmount))}</td>
                      <td className="px-3 py-2">{formatCurrency(computeAdvanceOutstanding({ amount: Number(a.amount), compensatedAmount: Number(a.compensatedAmount) }))}</td>
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
          <CardTitle>Documentos</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {profile.documents.length === 0 ? (
            <EmptyState title="Nenhum documento cadastrado." />
          ) : (
            <ul className="space-y-2 text-sm">
              {profile.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between">
                  <span>{d.documentType}</span>
                  <span className="text-xs text-foreground-subtle">{d.issueDate ? formatDateBR(d.issueDate) : "Sem data"}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
