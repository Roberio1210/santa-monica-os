import { NextResponse } from "next/server";
import { fetchAdminDiagnostics } from "@/lib/admin/diagnostics";

/**
 * Usado pelo botão "Testar integrações agora" em /admin/diagnostico. Mesma verificação ao vivo
 * da renderização inicial da página — nunca cacheado, nunca retorna segredo nenhum.
 */
export async function GET() {
  const snapshot = await fetchAdminDiagnostics();
  return NextResponse.json(snapshot);
}
