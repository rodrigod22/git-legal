import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

// As fontes embutidas (Inter e JetBrains Mono) usam a SIL Open Font License, que pede o texto da
// licença junto com os arquivos distribuídos. Este plugin copia os LICENSE dos pacotes para dist/licencas/.
function licencasDasFontes(): Plugin {
  const pacotes = { "Inter-OFL.txt": "@fontsource/inter", "JetBrainsMono-OFL.txt": "@fontsource/jetbrains-mono" };
  return {
    name: "licencas-das-fontes",
    apply: "build",
    generateBundle() {
      for (const [arquivo, pacote] of Object.entries(pacotes)) {
        const origem = fileURLToPath(new URL(`./node_modules/${pacote}/LICENSE`, import.meta.url));
        this.emitFile({ type: "asset", fileName: `licencas/${arquivo}`, source: readFileSync(origem, "utf8") });
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), licencasDasFontes()],
  base: "./",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
