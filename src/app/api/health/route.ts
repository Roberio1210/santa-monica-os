import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    service: "santa-monica-os",
    timestamp: new Date().toISOString(),
  });
}
