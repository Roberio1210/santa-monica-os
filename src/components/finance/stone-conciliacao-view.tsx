"use client";

import { useActionState, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type BadgeVariant = "default" | "positive" | "critical" | "warning" | "info" | "outline";
import { Button } from "@/components/ui/button";
import { syncStoneAction, reprocessStoneDayAction, updateDivergenceReviewAction, updateReconciliationReviewAction, confirmReconciliationReceivableAction } from "@/app/financeiro/stone-conciliacao/actions";
import type { StoneConciliacaoPageData } from "@/lib/integrations/stone/pageData";
import type { StoneIntegrationHealth } from "@/lib/integrations/stone/healthStatus";
import type { StoneSyncStatusReport, StoneSyncVisualStatus } from "@/lib/integrations/stone/syncStatus";
import type { StoneDivergenceRow, StoneReconciliationResultRow, StoneReviewStatus } from "@/lib/integrations/stone/persistence/types";

const currency = (value: number) => `R$ ${value.toFixed(2)}`;

const healthLabels: Record<StoneIntegrationHealth, string> = {
  not_configured: "Não configurado",
  credentials_pending: "Aguardando primeira sincronização",
  access_pending: "Aguardando liberação de acesso",
  connected: "Conectado",
  syncing: "Sincronizando",
  healthy: "Saudável",
  degraded: "Degradado",
  auth_error: "Erro de credencial",
  temporary_failure: "Falha temporária",
  stale_data: "Dado desatualizado",
  no_data: "Sem dado disponível",
};

const healthVariants: Record<StoneIntegrationHealth, BadgeVariant> = {
  not_configured: "outline",
  credentials_pending: "info",
  access_pending: "warning",
  connected: "positive",
  syncing: "info",
  healthy: "positive",
  degraded: "warning",
  auth_error: "critical",
  temporary_failure: "warning",
  stale_data: "warning",
  no_data: "outline",
};

const syncStatusVariants: Record<StoneSyncVisualStatus, BadgeVariant> = {
  completed: "positive",
  completed_with_alerts: "warning",
  temporary_failure: "critical",
  action_required: "critical",
  awaiting_first_sync: "outline",
};

const reviewStatusLabels: Record<StoneReviewStatus, string> = {
  open: "Aberto",
  under_review: "Em revisão",
  confirmed_issue: "Problema confirmado",
  resolved: "Resolvido",
  ignored: "Ignorado",
  pending_processing: "Processamento pendente",
};

const matchTypeLabels: Record<string, string> = {
  exact_match: "Correspondência exata",
  probable_match: "Correspondência provável",
  ambiguous: "Ambígua",
  unmatched_jumppark: "Venda JumpPark sem correspondente",
  unmatched_stone: "Venda Stone sem correspondente",
  value_mismatch: "Divergência de valor",
  payment_method_mismatch: "Divergência de forma de pagamento",
  installment_mismatch: "Divergência de parcelamento",
  date_mismatch: "Divergência de data",
  duplicate: "Possível duplicidade",
  reversed: "Estornada",
  pending_processing: "Processamento pendente",
};

const divergenceTypeLabels: Record<string, string> = {
  venda_jumppark_nao_encontrada_na_stone: "Venda JumpPark não encontrada na Stone",
  transacao_stone_nao_encontrada_no_jumppark: "Transação Stone não encontrada no JumpPark",
  diferenca_de_valor: "Diferença de valor",
  diferenca_forma_pagamento: "Diferença de forma de pagamento",
  diferenca_parcelamento: "Diferença de parcelamento",
  possivel_duplicidade: "Possível duplicidade",
  cancelamento_nao_refletido_internamente: "Cancelamento não refletido internamente",
  estorno: "Estorno",
  chargeback: "Chargeback",
  correspondencia_ambigua: "Correspondência ambígua",
  arquivo_stone_ausente_ou_defasado: "Arquivo Stone ausente ou defasado",
};

interface StoneConciliacaoViewProps {
  data: StoneConciliacaoPageData;
  today: string;
}

export function StoneConciliacaoView({ data, today }: StoneConciliacaoViewProps) {
  const [syncState, syncAction, syncPending] = useActionState(syncStoneAction, { error: null });
  const { health, syncStatus, summary, schedule, reconciliationResults, divergences, importRuns } = data;

  return (
    <div className="space-y-6">
      <SyncStatusCard status={syncStatus} today={today} />

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            <span>Status da integração</span>
            <Badge variant={healthVariants[health.health]}>{healthLabels[health.health]}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0 text-sm">
          <Row label="Última importação" value={health.lastImportRun ? `${health.lastImportRun.referenceDate} — ${health.lastImportRun.status}` : "Nenhuma ainda"} />
          <Row label="Último dia com dado real" value={health.lastSuccessfulImportRun?.referenceDate ?? "Nenhum ainda"} />
          {!health.configured ? <p className="text-xs text-foreground-subtle">Configure STONE_API_KEY e STONE_ACCOUNT_ID para habilitar a sincronização.</p> : null}

          <form action={syncAction} className="flex flex-wrap items-end gap-2 border-t border-border-subtle pt-3">
            <div>
              <label className="block text-xs text-foreground-subtle">De</label>
              <input name="fromDate" type="date" className="h-9 rounded-lg border border-border bg-background-elevated px-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-foreground-subtle">Até</label>
              <input name="toDate" type="date" className="h-9 rounded-lg border border-border bg-background-elevated px-2 text-sm" />
            </div>
            <Button type="submit" disabled={syncPending || !health.configured}>
              {syncPending ? "Sincronizando..." : "Sincronizar agora"}
            </Button>
          </form>
          {syncState.error ? <p className="text-xs text-critical">{syncState.error}</p> : null}
          {syncState.success ? <p className="text-xs text-positive">{syncState.success}</p> : null}
        </CardContent>
      </Card>

      {summary && summary.status === "ok" ? (
        <Card>
          <CardHeader>
            <CardTitle>Resumo — {summary.referenceDate}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 pt-0 text-sm sm:grid-cols-4">
            <Metric label="Vendas brutas" value={currency(summary.grossAmountTotal)} />
            <Metric label="Taxas" value={currency(summary.feesTotal)} />
            <Metric label="Valor líquido" value={currency(summary.netAmountTotal)} />
            <Metric label="Transações" value={String(summary.transactionCount)} />
            <Metric label="Cancelamentos" value={String(summary.cancellationCount)} />
            <Metric label="Estornos" value={String(summary.refundCount)} />
            <Metric label="Chargebacks" value={String(summary.chargebackCount)} />
            <Metric label="Antecipações" value={String(summary.advanceCount)} />
          </CardContent>
        </Card>
      ) : null}

      {summary?.financialPosition ? (
        <Card>
          <CardHeader>
            <CardTitle>Última posição financeira processada pela Stone</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm">
            {summary.financialPosition.status === "ok" && summary.financialPosition.amount !== null ? (
              <>
                <p className="text-lg font-medium text-foreground">{currency(summary.financialPosition.amount)}</p>
                <p className="text-xs text-foreground-subtle">Referente a {summary.financialPosition.referenceDate}, processado em {new Date(summary.financialPosition.processedAt).toLocaleString("pt-BR")}.</p>
                <p className="mt-2 rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">Esta informação não representa o saldo atual da Conta Stone.</p>
              </>
            ) : (
              <p className="text-xs text-foreground-subtle">{summary.financialPosition.limitation}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {schedule.status === "ok" && schedule.schedule ? (
        <Card>
          <CardHeader>
            <CardTitle>Agenda Financeira</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {schedule.schedule.curves.map((curve) => (
                <div key={curve.label} className="rounded-lg border border-border-subtle p-3">
                  <p className="text-xs text-foreground-subtle">{curveLabel(curve.label)}</p>
                  <p className="mt-1 font-medium text-foreground">{currency(curve.netAmountExpected)}</p>
                  <p className="text-xs text-foreground-subtle">Liquidado {currency(curve.settledAmount)} · Pendente {currency(curve.pendingAmount)} · Atrasado {currency(curve.overdueAmount)}</p>
                </div>
              ))}
            </div>
            {schedule.limitations.map((l) => (
              <p key={l} className="mt-2 text-xs text-foreground-subtle">{l}</p>
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Agenda Financeira</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-sm text-foreground-subtle">{scheduleUnavailableMessage(schedule.status)}</CardContent>
        </Card>
      )}

      <ReconciliationCard results={reconciliationResults} />
      <DivergencesCard divergences={divergences} />
      <ImportHistoryCard runs={importRuns} today={today} />
    </div>
  );
}

function SyncStatusCard({ status, today }: { status: StoneSyncStatusReport; today: string }) {
  const [state, action, pending] = useActionState(reprocessStoneDayAction, { error: null });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          <span>Última sincronização</span>
          <Badge variant={syncStatusVariants[status.status]}>{status.label}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0 text-sm">
        {status.status === "awaiting_first_sync" ? (
          <p className="text-foreground-subtle">Nenhuma sincronização foi executada ainda.</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Dias com sucesso" value={String(status.daysSucceeded)} />
              <Metric label="Dias com alerta" value={String(status.daysWithAlert)} />
              <Metric label="Dias com falha" value={String(status.daysWithFailure)} />
              <Metric label="Transações atualizadas" value={String(status.transactionsUpdated)} />
            </div>
            <Row label="Último dia com dado real" value={status.lastRealDataDate ?? "Nenhum ainda"} />
            {status.alertReason ? <p className="rounded-lg border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">{status.alertReason}</p> : null}
            {status.failureReason ? <p className="rounded-lg border border-critical/30 bg-critical-bg px-3 py-2 text-xs text-critical">{status.failureReason}</p> : null}

            {status.reprocessableDates.length > 0 ? (
              <div className="space-y-2 border-t border-border-subtle pt-3">
                <p className="text-xs font-medium text-foreground-subtle">Dias afetados — reprocessar individualmente:</p>
                <div className="flex flex-wrap gap-2">
                  {status.reprocessableDates.map((date) => (
                    <form key={date} action={action} className="flex items-center gap-1">
                      <input type="hidden" name="referenceDate" value={date} />
                      <Button type="submit" size="sm" variant="outline" disabled={pending || date > today}>{pending ? "Reprocessando..." : `Reprocessar ${date}`}</Button>
                    </form>
                  ))}
                </div>
                {state.error ? <p className="text-xs text-critical">{state.error}</p> : null}
                {state.success ? <p className="text-xs text-positive">{state.success}</p> : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function curveLabel(label: string): string {
  const labels: Record<string, string> = { hoje: "Hoje", proximos_7_dias: "Próximos 7 dias", proximos_30_dias: "Próximos 30 dias", mes_atual: "Mês atual" };
  return labels[label] ?? label;
}

function scheduleUnavailableMessage(status: string): string {
  if (status === "not_configured") return "Integração não configurada.";
  return "Nenhum arquivo de conciliação disponível na janela consultada ainda.";
}

function ReconciliationCard({ results }: { results: StoneReconciliationResultRow[] }) {
  const reviewable = results.filter((r) => r.matchType === "ambiguous" || r.matchType === "probable_match" || r.matchType === "exact_match" || r.reviewStatus !== "open");
  const counts = results.reduce<Record<string, number>>((acc, r) => { acc[r.matchType] = (acc[r.matchType] ?? 0) + 1; return acc; }, {});

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conciliação Stone × JumpPark</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(counts).map(([type, count]) => (
            <Badge key={type} variant="outline">{matchTypeLabels[type] ?? type}: {count}</Badge>
          ))}
          {results.length === 0 ? <p className="text-foreground-subtle">Nenhum resultado de conciliação no período — sincronize para calcular.</p> : null}
        </div>
        {reviewable.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-foreground-subtle">Pendentes de revisão (correspondências prováveis e ambíguas nunca são tratadas como certeza):</p>
            {reviewable.map((r) => <ReconciliationRow key={r.id} result={r} />)}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

const RECEIVABLE_ELIGIBLE_MATCH_TYPES = new Set(["exact_match", "probable_match"]);

function ReconciliationRow({ result }: { result: StoneReconciliationResultRow }) {
  const [state, action, pending] = useActionState(updateReconciliationReviewAction, { error: null });
  const [receivableState, receivableAction, receivablePending] = useActionState(confirmReconciliationReceivableAction, { error: null });
  const eligibleForReceivable = RECEIVABLE_ELIGIBLE_MATCH_TYPES.has(result.matchType);
  return (
    <div className="rounded-lg border border-border-subtle p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-foreground">{matchTypeLabels[result.matchType] ?? result.matchType}</span>
        <Badge variant="outline">{result.confidence}</Badge>
      </div>
      <p className="mt-1 text-xs text-foreground-subtle">{result.stoneSaleExternalKey ? `Stone: ${result.stoneSaleExternalKey}` : "Sem venda Stone"} · {result.jumpparkOrderExternalId ? `JumpPark: ${result.jumpparkOrderExternalId}` : "Sem pedido JumpPark"}</p>
      <form action={action} className="mt-2 flex items-center gap-2">
        <input type="hidden" name="id" value={result.id} />
        <select name="status" defaultValue={result.reviewStatus} className="h-8 rounded-lg border border-border bg-background-elevated px-2 text-xs">
          {Object.entries(reviewStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Salvando..." : "Atualizar"}</Button>
      </form>
      {state.error ? <p className="mt-1 text-xs text-critical">{state.error}</p> : null}
      {eligibleForReceivable ? (
        <form action={receivableAction} className="mt-2 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-2">
          <input type="hidden" name="id" value={result.id} />
          <input name="performedBy" type="text" placeholder="Seu nome" required className="h-8 w-32 rounded-lg border border-border bg-background-elevated px-2 text-xs" aria-label="Responsável pela confirmação" />
          <Button type="submit" size="sm" disabled={receivablePending}>{receivablePending ? "Confirmando..." : "Confirmar recebimento"}</Button>
          <span className="text-xs text-foreground-subtle">Cria a conta a receber (e a baixa, se a Stone já confirmou a liquidação) — nunca automático.</span>
        </form>
      ) : null}
      {receivableState.error ? <p className="mt-1 text-xs text-critical">{receivableState.error}</p> : null}
      {receivableState.success ? <p className="mt-1 text-xs text-positive">{receivableState.success}</p> : null}
    </div>
  );
}

function DivergencesCard({ divergences }: { divergences: StoneDivergenceRow[] }) {
  const open = divergences.filter((d) => d.status !== "resolved" && d.status !== "ignored");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Divergências</span>
          <Badge variant={open.length > 0 ? "warning" : "positive"}>{open.length} em aberto</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {divergences.length === 0 ? <p className="text-sm text-foreground-subtle">Nenhuma divergência identificada.</p> : null}
        {divergences.map((d) => <DivergenceRow key={d.id} divergence={d} />)}
      </CardContent>
    </Card>
  );
}

function DivergenceRow({ divergence }: { divergence: StoneDivergenceRow }) {
  const [state, action, pending] = useActionState(updateDivergenceReviewAction, { error: null });
  const [expanded, setExpanded] = useState(false);
  const priorityVariant: Record<string, BadgeVariant> = { alta: "critical", media: "warning", baixa: "outline" };

  return (
    <div className="rounded-lg border border-border-subtle p-3 text-sm">
      <button type="button" onClick={() => setExpanded((v) => !v)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
        <span className="font-medium text-foreground">{divergenceTypeLabels[divergence.type] ?? divergence.type}</span>
        <span className="flex items-center gap-2">
          <Badge variant={priorityVariant[divergence.priority] ?? "outline"}>{divergence.priority}</Badge>
          <Badge variant="outline">{reviewStatusLabels[divergence.status]}</Badge>
          {divergence.financialImpact > 0 ? <span className="text-xs text-foreground-subtle">{currency(divergence.financialImpact)}</span> : null}
        </span>
      </button>
      {expanded ? (
        <div className="mt-2 space-y-2 border-t border-border-subtle pt-2">
          <p className="text-xs text-foreground-subtle">{divergence.recommendation}</p>
          <ul className="list-disc pl-4 text-xs text-foreground-subtle">
            {divergence.evidence.map((e) => <li key={e}>{e}</li>)}
          </ul>
          {divergence.resolutionNote ? <p className="text-xs text-foreground-muted">Nota: {divergence.resolutionNote}</p> : null}
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={divergence.id} />
            <select name="status" defaultValue={divergence.status} className="h-8 rounded-lg border border-border bg-background-elevated px-2 text-xs">
              {Object.entries(reviewStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <input name="resolutionNote" type="text" placeholder="Nota (obrigatória para resolver/ignorar)" className="h-8 min-w-[220px] flex-1 rounded-lg border border-border bg-background-elevated px-2 text-xs" />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Salvando..." : "Atualizar"}</Button>
          </form>
          {state.error ? <p className="text-xs text-critical">{state.error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function ImportHistoryCard({ runs, today }: { runs: StoneConciliacaoPageData["importRuns"]; today: string }) {
  const [state, action, pending] = useActionState(reprocessStoneDayAction, { error: null });
  const [confirmDate, setConfirmDate] = useState<string | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Histórico de importações</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {runs.length === 0 ? <p className="text-sm text-foreground-subtle">Nenhuma importação registrada ainda.</p> : null}
        {runs.map((run) => (
          <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle py-2 text-sm last:border-0">
            <div>
              <p className="text-foreground">{run.referenceDate} <span className="text-xs text-foreground-subtle">({run.layout})</span></p>
              <p className="text-xs text-foreground-subtle">{run.recordCount ?? 0} registro(s) · {run.origin} · {new Date(run.startedAt).toLocaleString("pt-BR")}{run.errorSanitized ? ` · ${run.errorSanitized}` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={run.status === "succeeded" ? "positive" : run.status === "failed" ? "critical" : "info"}>{run.status}</Badge>
              {confirmDate === run.referenceDate ? (
                <form action={action} className="flex items-center gap-1">
                  <input type="hidden" name="referenceDate" value={run.referenceDate} />
                  <Button type="submit" size="sm" variant="outline" disabled={pending}>{pending ? "Reprocessando..." : "Confirmar"}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDate(null)}>Cancelar</Button>
                </form>
              ) : (
                <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmDate(run.referenceDate)} disabled={run.referenceDate > today}>Reprocessar</Button>
              )}
            </div>
          </div>
        ))}
        {state.error ? <p className="text-xs text-critical">{state.error}</p> : null}
        {state.success ? <p className="text-xs text-positive">{state.success}</p> : null}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle py-1.5 last:border-0">
      <p className="text-foreground-subtle">{label}</p>
      <p className="text-foreground-muted">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border-subtle p-3">
      <p className="text-xs text-foreground-subtle">{label}</p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
    </div>
  );
}
