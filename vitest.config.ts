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
  },
});
