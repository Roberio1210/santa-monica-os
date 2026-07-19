import { NextResponse } from "next/server";
import { fetchJumpParkDiagnostics } from "@/lib/integrations/jumppark/diagnostics";

/**
 * Diagnóstico seguro da integração JumpPark — usado pelo botão "Testar conexão" em
 * /configuracoes/status. Nunca retorna token, userId ou establishmentId.
 */
export async function GET() {
  const diagnostics = await fetchJumpParkDiagnostics();
  return NextResponse.json(diagnostics);
}
