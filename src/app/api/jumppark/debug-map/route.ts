import { NextResponse } from "next/server";
import { isJumpParkConfigured } from "@/lib/config/env";
import { jumpParkClient, JumpParkRequestError } from "@/lib/integrations/jumppark";

/**
 * Rota de diagnóstico TEMPORÁRIA para mapear os campos reais da API JumpPark
 * (docs/jumppark-data-map.md). Nunca retorna token, e mascara placa, telefone,
 * nome de cliente, documento e texto livre antes de responder. Remover após uso.
 */
const DEBUG_KEY = "029829a4efb267160a7ad6366743715b";

type JsonRecord = Record<string, unknown>;

const SENSITIVE_RULES: { test: RegExp; mask: (value: unknown) => unknown }[] = [
  { test: /plate|placa/i, mask: (v) => maskEdges(v, 2, 2) },
  { test: /phone|telefone|celular|whatsapp/i, mask: (v) => maskEdges(v, 0, 2, "*******") },
  { test: /(client|customer|driver|owner|responsavel).*name/i, mask: maskName },
  { test: /cpf|cnpj|documento/i, mask: () => "[REDACTED]" },
  { test: /chassi|chassis|\bvin\b/i, mask: (v) => maskEdges(v, 2, 2) },
  { test: /email/i, mask: () => "[REDACTED]" },
  { test: /address|endereco/i, mask: () => "[REDACTED]" },
  { test: /observ|note|comment/i, mask: (v) => (typeof v === "string" ? `[texto livre, ${v.length} caracteres]` : v) },
];

function maskEdges(value: unknown, head: number, tail: number, prefixOverride?: string): unknown {
  if (typeof value !== "string" || value.length < head + tail + 1) return value ? "[REDACTED]" : value;
  const prefix = prefixOverride ?? `${value.slice(0, head)}***`;
  return `${prefix}${value.slice(-tail)}`;
}

function maskName(value: unknown): unknown {
  if (typeof value !== "string" || value.trim().length === 0) return value;
  const first = value.trim().split(/\s+/)[0];
  return `${first} ***`;
}

function sanitizeValue(key: string, value: unknown): unknown {
  for (const rule of SENSITIVE_RULES) {
    if (rule.test.test(key)) return rule.mask(value);
  }
  if (typeof value === "string" && value.length > 60) {
    return `${value.slice(0, 40)}… [${value.length} chars]`;
  }
  return value;
}

function sanitizeObject(obj: JsonRecord): JsonRecord {
  const out: JsonRecord = {};
  for (const [k, v] of Object.entries(obj)) {
    if (Array.isArray(v)) {
      out[k] = v
        .slice(0, 1)
        .map((item) => (item && typeof item === "object" ? sanitizeObject(item as JsonRecord) : sanitizeValue(k, item)));
    } else if (v && typeof v === "object") {
      out[k] = sanitizeObject(v as JsonRecord);
    } else {
      out[k] = sanitizeValue(k, v);
    }
  }
  return out;
}

function collectKeys(obj: unknown, prefix: string, set: Set<string>) {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) collectKeys(item, prefix, set);
    return;
  }
  for (const [k, v] of Object.entries(obj as JsonRecord)) {
    const path = prefix ? `${prefix}.${k}` : k;
    set.add(path);
    if (v && typeof v === "object") collectKeys(v, path, set);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  if (searchParams.get("key") !== DEBUG_KEY) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (!isJumpParkConfigured()) {
    return NextResponse.json({ configured: false }, { status: 200 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const wideStart = "2026-01-01";
  const financialDate = searchParams.get("date") ?? today;

  try {
    const [financial, orders] = await Promise.all([
      jumpParkClient.request<JsonRecord>("/reports/financial", { startDate: financialDate, endDate: financialDate }),
      jumpParkClient.request<{ data: { content: JsonRecord[] } }>("/serviceorders/export/json", {
        startDate: wideStart,
        endDate: today,
      }),
    ]);

    const orderList = (orders as { data?: { content?: JsonRecord[] } }).data?.content ?? [];
    const orderKeys = new Set<string>();
    for (const o of orderList) collectKeys(o, "", orderKeys);

    const hasServices = (o: JsonRecord) => Array.isArray(o.services) && (o.services as unknown[]).length > 0;
    const withServices = orderList.filter(hasServices);
    const withoutServices = orderList.filter((o) => !hasServices(o));
    const stillOpen = orderList.filter((o) => !o.exitDateTime);
    const closed = orderList.filter((o) => !!o.exitDateTime);

    return NextResponse.json({
      configured: true,
      financialDate,
      totalOrdersInRange: orderList.length,
      financialReportSanitized: sanitizeObject(financial),
      orderFieldsObserved: Array.from(orderKeys).sort(),
      counts: {
        withServices: withServices.length,
        withoutServices: withoutServices.length,
        stillOpen: stillOpen.length,
        closed: closed.length,
      },
      sampleWithServices: withServices.slice(0, 2).map(sanitizeObject),
      sampleWithoutServices: withoutServices.slice(0, 2).map(sanitizeObject),
      sampleStillOpen: stillOpen.slice(0, 2).map(sanitizeObject),
    });
  } catch (error) {
    const message = error instanceof JumpParkRequestError ? `HTTP ${error.status}` : "erro desconhecido";
    return NextResponse.json({ configured: true, error: message }, { status: 200 });
  }
}
