import { NextResponse } from "next/server";
import { getStoneIntegrationHealth } from "@/lib/integrations/stone/healthStatus";

/**
 * Diagnóstico seguro da integração Stone Conciliação — usado pelo botão "Testar conexão" em
 * Configurações > Integrações. Nunca retorna a API key nem o StoneCode.
 */
export async function GET() {
  const report = await getStoneIntegrationHealth();
  return NextResponse.json({
    health: report.health,
    configured: report.configured,
    lastImportRun: report.lastImportRun,
    lastSuccessfulImportRun: report.lastSuccessfulImportRun,
  });
}
