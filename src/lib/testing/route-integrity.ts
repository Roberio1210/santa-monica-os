import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Guarda de regressão (Missão de estabilização, 04/08/2026) — varre o código-fonte em busca de
 * `href` internos que não apontam para nenhuma rota real, e de marcadores clássicos de link
 * morto (`href="#"`). Não substitui um teste de navegação real em navegador, mas impede que um
 * link/botão sem destino volte a ser publicado sem que ninguém perceba (ver route-integrity.test.ts).
 *
 * Limitação honesta: só enxerga hrefs como STRING LITERAL (`href="/x"` ou `href={"/x"}`) — hrefs
 * montados dinamicamente (`href={\`/x/${id}\`}` ou uma variável) não são verificados aqui.
 */

const APP_DIR = join(process.cwd(), "src/app");
const SCAN_DIRS = [join(process.cwd(), "src/app"), join(process.cwd(), "src/components")];

export interface RoutePattern {
  /** Segmentos da rota, já sem route groups `(x)` — um segmento `null` representa um parâmetro dinâmico `[x]`/`[...x]`. */
  segments: (string | null)[];
  isCatchAll: boolean;
}

function walk(dir: string, onFile: (path: string) => void) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, onFile);
    else onFile(full);
  }
}

/** Coleta todas as rotas reais do App Router — toda pasta com `page.tsx` OU `route.ts` conta como uma rota navegável. */
export function collectRoutePatterns(): RoutePattern[] {
  const patterns: RoutePattern[] = [];

  walk(APP_DIR, (filePath) => {
    const filename = filePath.split("/").pop() ?? "";
    if (filename !== "page.tsx" && filename !== "route.ts") return;

    const relPath = relative(APP_DIR, filePath).replace(/\\/g, "/");
    const dirPath = relPath.slice(0, relPath.length - filename.length - 1);
    const rawSegments = dirPath.length > 0 ? dirPath.split("/") : [];

    const segments: (string | null)[] = [];
    let isCatchAll = false;
    for (const seg of rawSegments) {
      if (seg.startsWith("(") && seg.endsWith(")")) continue; // route group — não aparece na URL
      if (seg.startsWith("[...") || seg.startsWith("[[...")) {
        isCatchAll = true;
        continue;
      }
      if (seg.startsWith("[") && seg.endsWith("]")) {
        segments.push(null);
        continue;
      }
      segments.push(seg);
    }

    patterns.push({ segments, isCatchAll });
  });

  return patterns;
}

/** Compara um caminho de URL (sem query string/hash) contra o conjunto de rotas reais. */
export function routeExists(pathname: string, patterns: RoutePattern[]): boolean {
  const clean = pathname.split("?")[0].split("#")[0];
  const targetSegments = clean.split("/").filter(Boolean);

  for (const pattern of patterns) {
    if (pattern.isCatchAll) {
      const prefixLen = pattern.segments.length;
      if (targetSegments.length < prefixLen) continue;
      const matches = pattern.segments.every((seg, i) => seg === null || seg === targetSegments[i]);
      if (matches) return true;
      continue;
    }
    if (pattern.segments.length !== targetSegments.length) continue;
    const matches = pattern.segments.every((seg, i) => seg === null || seg === targetSegments[i]);
    if (matches) return true;
  }
  return false;
}

export interface HrefFinding {
  file: string;
  href: string;
}

const HREF_LITERAL_PATTERN = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`$]*)`\}|\{"([^"]*)"\}|\{'([^']*)'\})/g;

function isInternalPath(href: string): boolean {
  if (href.length === 0) return false;
  if (!href.startsWith("/")) return false;
  return true;
}

/** Extrai todos os `href` literais internos de um arquivo .tsx/.ts — nunca de arquivos de teste. */
export function extractInternalHrefs(filePath: string): string[] {
  const content = readFileSync(filePath, "utf-8");
  const hrefs: string[] = [];
  for (const match of content.matchAll(HREF_LITERAL_PATTERN)) {
    const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? "";
    if (isInternalPath(value)) hrefs.push(value);
  }
  return hrefs;
}

export function collectAllInternalHrefs(): HrefFinding[] {
  const findings: HrefFinding[] = [];
  for (const dir of SCAN_DIRS) {
    walk(dir, (filePath) => {
      if (!filePath.endsWith(".tsx") && !filePath.endsWith(".ts")) return;
      if (filePath.endsWith(".test.ts") || filePath.endsWith(".test.tsx")) return;
      for (const href of extractInternalHrefs(filePath)) {
        findings.push({ file: relative(process.cwd(), filePath), href });
      }
    });
  }
  return findings;
}
