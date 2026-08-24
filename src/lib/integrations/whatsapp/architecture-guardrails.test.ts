import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Missão Z6.2 (testes obrigatórios 18, 19) — decisão de arquitetura da Missão Z6.1: WhatsApp
 * Cloud API oficial da Meta, nunca Evolution API, nunca n8n. Estes testes travam essa decisão
 * como regressão: se algum código futuro reintroduzir uma dependência dessas nesta pasta ou no
 * `package.json`, o teste quebra.
 */

const WHATSAPP_DIR = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN = [/evolution[-_]?api/i, /\bn8n\b/i, /cloudfy/i];

/** Exclui `.test.ts` de propósito — este próprio arquivo de guarda PRECISA mencionar os nomes proibidos para documentar o que rejeita; o alvo real da checagem é só código de implementação. */
function allSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return allSourceFiles(full);
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) return [];
    if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) return [full];
    return [];
  });
}

describe("Nenhuma dependência de Evolution API ou n8n no canal WhatsApp (Missão Z6.1 -> Z6.2)", () => {
  it("teste obrigatório 18/19 — nenhum arquivo de src/lib/integrations/whatsapp/ menciona Evolution, n8n ou Cloudfy", () => {
    for (const file of allSourceFiles(WHATSAPP_DIR)) {
      const content = readFileSync(file, "utf-8");
      for (const pattern of FORBIDDEN) {
        expect(content, `${file} não deveria mencionar ${pattern}`).not.toMatch(pattern);
      }
    }
  });

  it("package.json não lista Evolution/n8n/Cloudfy como dependência", () => {
    const packageJsonPath = join(WHATSAPP_DIR, "../../../../package.json");
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const allDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const dep of allDeps) {
      for (const pattern of FORBIDDEN) {
        expect(dep, `dependência "${dep}" corresponde a um provedor descartado`).not.toMatch(pattern);
      }
    }
  });
});
