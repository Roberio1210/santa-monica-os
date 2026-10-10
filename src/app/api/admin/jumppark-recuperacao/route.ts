import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getDb } from "@/db/client";
import { isJumpParkConfigured } from "@/lib/config/env";
import { JumpParkRequestError } from "@/lib/integrations/jumppark/client";
import { executeGapRecovery, GAP_RECOVERY_CONFIRM_PHRASE, RecoveryAbortedError, simulateGapRecovery, type RecoveryPlan } from "@/lib/integrations/jumppark/gap-recovery";

/**
 * Recuperação das 46 ordens JumpPark ausentes (saídas 21–25/09/2026) — ferramenta TEMPORÁRIA, só admin.
 *
 *   GET  /api/admin/jumppark-recuperacao               → SIMULAÇÃO (JumpPark só GET; Neon READ ONLY). Nunca grava.
 *   GET  /api/admin/jumppark-recuperacao?formato=html  → a mesma simulação em página, com o formulário de confirmação.
 *   POST /api/admin/jumppark-recuperacao               → GRAVAÇÃO: exige admin, mesma origem, a frase de confirmação
 *                                                         e o hash do plano aprovado na simulação. Só INSERT, numa
 *                                                         transação; qualquer divergência desfaz tudo.
 *
 * Nunca chama sincronização, backfill, recálculo de clientes, consumo de estoque nem nada financeiro
 * (ver `route.test.ts`). Resposta sem dado pessoal nem credencial. Remover depois da recuperação.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

function json(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function html(body: string, status: number): NextResponse {
  return new NextResponse(body, { status, headers: { ...NO_STORE_HEADERS, "Content-Type": "text/html; charset=utf-8" } });
}

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function sanitizeError(error: unknown): string {
  if (error instanceof RecoveryAbortedError) return error.message;
  if (error instanceof JumpParkRequestError) return `A API do JumpPark respondeu com erro (HTTP ${error.status}). Nada foi gravado.`;
  if (error instanceof Error && error.name === "AbortError") return "A API do JumpPark não respondeu a tempo (timeout). Nada foi gravado.";
  return "Falha na recuperação (detalhes omitidos por segurança). Nenhuma gravação parcial: a transação é desfeita por inteiro.";
}

async function requireAdmin(): Promise<{ user: { id: string }; denied: null } | { user: null; denied: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { user: null, denied: json({ error: "Não autorizado." }, 401) };
  if (user.role !== "admin") return { user: null, denied: json({ error: "Acesso restrito a administradores." }, 403) };
  return { user, denied: null };
}

function simulationBody(plan: RecoveryPlan) {
  const money = (c: number) => c / 100;
  return {
    modo: "simulacao",
    gravouAlgo: false,
    janelaDeSaida: plan.window,
    podeGravar: plan.blockers.length === 0,
    bloqueios: plan.blockers,
    planHash: plan.planHash,
    fraseDeConfirmacao: GAP_RECOVERY_CONFIRM_PHRASE,
    totais: {
      ordens: plan.totals.orders,
      itens: plan.totals.items,
      estacionamento: money(plan.totals.parkingAmountCents),
      lavacaoServicos: money(plan.totals.servicesAmountCents),
      total: money(plan.totals.totalAmountCents),
      somaDosItens: money(plan.totals.itemsAmountCents),
    },
    porDiaDeSaida: plan.ordersByExitDate,
    ordens: plan.preview,
  };
}

function simulationHtml(plan: RecoveryPlan): string {
  const b = simulationBody(plan);
  const days = Object.entries(b.porDiaDeSaida).map(([d, v]) => `<tr><td>${escapeHtml(d)}</td><td>${v.orders}</td><td>${v.parkingAmount.toFixed(2)}</td><td>${v.servicesAmount.toFixed(2)}</td><td>${v.totalAmount.toFixed(2)}</td></tr>`).join("");
  const blockers = b.bloqueios.length ? `<h2>Bloqueios (gravação impedida)</h2><ul>${b.bloqueios.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : "<p><strong>Nenhum bloqueio.</strong></p>";
  const form = b.podeGravar
    ? `<form method="post"><input type="hidden" name="planHash" value="${escapeHtml(b.planHash)}"><p>Para gravar, digite exatamente <code>${escapeHtml(GAP_RECOVERY_CONFIRM_PHRASE)}</code>:</p><input name="confirmacao" autocomplete="off" required> <button type="submit">Gravar as ${b.totais.ordens} ordens</button></form>`
    : "";
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recuperação JumpPark 09/2026</title>
<style>body{font-family:system-ui,sans-serif;max-width:860px;margin:24px auto;padding:0 16px}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px;text-align:right}td:first-child,th:first-child{text-align:left}code{background:#eee;padding:1px 4px}</style></head><body>
<h1>Recuperação JumpPark — simulação</h1><p>Nada foi gravado. Hash do plano: <code>${escapeHtml(b.planHash)}</code></p>
<p>Ordens: <strong>${b.totais.ordens}</strong> · itens ${b.totais.itens} · estacionamento R$ ${b.totais.estacionamento.toFixed(2)} · lavação/serviços R$ ${b.totais.lavacaoServicos.toFixed(2)} · <strong>total R$ ${b.totais.total.toFixed(2)}</strong></p>
<table><tr><th>Dia de saída</th><th>Ordens</th><th>Estacionamento</th><th>Serviços</th><th>Total</th></tr>${days}</table>${blockers}${form}</body></html>`;
}

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth.denied) return auth.denied;

  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) if (key !== "formato") return json({ error: `Parâmetro não permitido: "${key}". A janela é fixa (21–25/09/2026).` }, 400);
  const asHtml = params.get("formato") === "html";

  if (!isJumpParkConfigured()) return json({ error: "JumpPark não configurado neste ambiente." }, 503);
  const db = getDb();
  if (!db) return json({ error: "Banco de dados não configurado neste ambiente." }, 503);

  try {
    const plan = await simulateGapRecovery(db);
    return asHtml ? html(simulationHtml(plan), 200) : json(simulationBody(plan), 200);
  } catch (error) {
    return json({ error: sanitizeError(error), gravouAlgo: false }, 502);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAdmin();
  if (auth.denied) return auth.denied;

  // Mesma origem: impede que outro site dispare a gravação usando a sessão do administrador.
  const origin = request.headers.get("origin");
  if (!origin || new URL(origin).host !== new URL(request.url).host) return json({ error: "Origem não permitida." }, 403);

  let planHash = "";
  let confirmacao = "";
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { planHash?: unknown; confirmacao?: unknown };
      planHash = String(body.planHash ?? "");
      confirmacao = String(body.confirmacao ?? "");
    } else {
      const form = await request.formData();
      planHash = String(form.get("planHash") ?? "");
      confirmacao = String(form.get("confirmacao") ?? "");
    }
  } catch {
    return json({ error: "Corpo da requisição inválido." }, 400);
  }
  if (!/^[0-9a-f]{64}$/.test(planHash)) return json({ error: "Informe o planHash da simulação aprovada." }, 400);
  if (confirmacao.trim() !== GAP_RECOVERY_CONFIRM_PHRASE) return json({ error: `Digite exatamente "${GAP_RECOVERY_CONFIRM_PHRASE}" para confirmar.` }, 400);

  if (!isJumpParkConfigured()) return json({ error: "JumpPark não configurado neste ambiente." }, 503);
  const db = getDb();
  if (!db) return json({ error: "Banco de dados não configurado neste ambiente." }, 503);

  try {
    const result = await executeGapRecovery(db, planHash, auth.user.id);
    return json(
      {
        modo: "gravacao",
        gravouAlgo: true,
        ordensInseridas: result.insertedOrders,
        itensInseridos: result.insertedItems,
        totais: {
          estacionamento: result.totals.parkingAmountCents / 100,
          lavacaoServicos: result.totals.servicesAmountCents / 100,
          total: result.totals.totalAmountCents / 100,
          somaDosItens: result.totals.itemsAmountCents / 100,
        },
        planHash: result.planHash,
      },
      200,
    );
  } catch (error) {
    return json({ error: sanitizeError(error), gravouAlgo: false }, error instanceof RecoveryAbortedError ? 409 : 502);
  }
}
