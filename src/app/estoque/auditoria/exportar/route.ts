import { NextResponse } from "next/server";
import { exportAuditReportCsv } from "@/lib/inventory/audit-service";

export const dynamic = "force-dynamic";

/** Seção 11 — exportação CSV da auditoria. Recalculado a cada download, nunca cacheado. */
export async function GET() {
  const csv = await exportAuditReportCsv();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="auditoria-estoque-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
