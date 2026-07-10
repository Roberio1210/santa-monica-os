import { NextResponse } from "next/server";
import { isJumpParkConfigured } from "@/lib/config/env";
import { fetchDailyFinancial, JumpParkRequestError } from "@/lib/integrations/jumppark";

/**
 * Diagnóstico seguro da integração JumpPark.
 * Nunca retorna token, userId ou establishmentId.
 */
export async function GET() {
  if (!isJumpParkConfigured()) {
    return NextResponse.json({
      configured: false,
      reachable: null,
      message: "Não configurado",
      checkedAt: new Date().toISOString(),
    });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    await fetchDailyFinancial(today);
    return NextResponse.json({
      configured: true,
      reachable: true,
      message: "Integração respondendo normalmente",
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof JumpParkRequestError
        ? `Falha na requisição (HTTP ${error.status})`
        : "Falha ao conectar com a API do JumpPark";
    return NextResponse.json({
      configured: true,
      reachable: false,
      message,
      checkedAt: new Date().toISOString(),
    });
  }
}
