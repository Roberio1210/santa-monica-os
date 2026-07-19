import "server-only";
import { isJumpParkConfigured } from "@/lib/config/env";
import { fetchServiceOrders } from "./service";
import { JumpParkNotConfiguredError, JumpParkRequestError } from "./client";
import { SAO_PAULO_TZ, saoPauloDateISO } from "@/lib/utils/timezone";

export interface JumpParkDiagnostics {
  configured: boolean;
  reachable: boolean | null;
  message: string;
  checkedAt: string;
  periodQueried: { from: string; to: string } | null;
  recordCount: number | null;
  timezone: string;
}

/**
 * Diagnóstico seguro e reutilizável da integração JumpPark — usado tanto por
 * `/api/jumppark/status` (botão "Testar conexão") quanto pela renderização inicial de
 * `/configuracoes/status`. Nunca retorna token, userId ou establishmentId.
 */
export async function fetchJumpParkDiagnostics(): Promise<JumpParkDiagnostics> {
  const checkedAt = new Date().toISOString();
  const today = saoPauloDateISO();

  if (!isJumpParkConfigured()) {
    return { configured: false, reachable: null, message: "JumpPark não configurado neste ambiente.", checkedAt, periodQueried: null, recordCount: null, timezone: SAO_PAULO_TZ };
  }

  try {
    const orders = await fetchServiceOrders(today, today);
    return {
      configured: true,
      reachable: true,
      message: orders.length > 0 ? "Integração respondendo normalmente." : "Integração respondendo — nenhum atendimento encontrado hoje.",
      checkedAt,
      periodQueried: { from: today, to: today },
      recordCount: orders.length,
      timezone: SAO_PAULO_TZ,
    };
  } catch (error) {
    let message = "Falha ao conectar com a API do JumpPark.";
    if (error instanceof JumpParkNotConfiguredError) {
      message = "JumpPark não configurado neste ambiente.";
    } else if (error instanceof JumpParkRequestError) {
      message = error.status === 401 || error.status === 403 ? "As credenciais do JumpPark foram rejeitadas." : `A API do JumpPark respondeu com erro (HTTP ${error.status}).`;
    } else if (error instanceof Error && error.name === "AbortError") {
      message = "A API do JumpPark não respondeu a tempo (timeout).";
    }
    return { configured: true, reachable: false, message, checkedAt, periodQueried: { from: today, to: today }, recordCount: null, timezone: SAO_PAULO_TZ };
  }
}
