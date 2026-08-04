import { describe, expect, it } from "vitest";
import { collectAllInternalHrefs, collectRoutePatterns, routeExists } from "./route-integrity";

/**
 * Missão de estabilização (04/08/2026), seção 7 — "criar teste automatizado de navegação para
 * impedir que botões sem ação voltem a ser publicados". Varre TODO o código-fonte real (não uma
 * lista fixa de rotas) e falha o build se algum `href` interno apontar para uma rota que não
 * existe, ou se algum link ainda tiver o marcador clássico de link morto (`href="#"`).
 */
describe("integridade de rotas internas (guarda contra link morto)", () => {
  it("existem rotas reais suficientes para o teste fazer sentido (sanity check)", () => {
    const patterns = collectRoutePatterns();
    expect(patterns.length).toBeGreaterThan(30);
  });

  it("nenhum href aponta literalmente para '#' (marcador clássico de link morto/decorativo)", () => {
    const hrefs = collectAllInternalHrefs();
    const dead = hrefs.filter((h) => h.href === "#");
    expect(dead, `Links decorativos encontrados: ${JSON.stringify(dead)}`).toEqual([]);
  });

  it("todo href interno literal aponta para uma rota que realmente existe em src/app", () => {
    const patterns = collectRoutePatterns();
    const hrefs = collectAllInternalHrefs();

    const broken = hrefs.filter((h) => h.href !== "#" && !routeExists(h.href, patterns));
    expect(broken, `Links quebrados encontrados (rota não existe em src/app): ${JSON.stringify(broken, null, 2)}`).toEqual([]);
  });
});
