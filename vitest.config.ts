import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Fora do runtime do Next.js, o pacote real "server-only" lança erro ao ser importado.
      // Substituído por um stub só para os testes — ver src/test/stubs/server-only.ts.
      "server-only": path.resolve(__dirname, "./src/test/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Alguns testes fazem `vi.resetModules()` + `await import(...)` para pegar uma instância nova
    // do módulo (ex.: `generative/orchestrator.test.ts`) — sob contenção de CPU na suíte completa
    // (muitos arquivos em paralelo), o custo do reimport pode passar do padrão de 5s do vitest
    // mesmo sem nada estar realmente travado. 15s dá folga sem mascarar um teste que trava de verdade.
    testTimeout: 15000,
  },
});
