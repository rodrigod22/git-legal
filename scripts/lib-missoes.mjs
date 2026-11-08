// Lista os ids das missões sem depender do servidor de desenvolvimento.
// No `npm run dev`, `import("/src/content/index.ts")` funciona dentro da página; no build
// servido de `dist/` não existe `/src`, então os ids são lidos do código-fonte dos módulos.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "content", "modules");

export function idsDasMissoes() {
  const ids = [];
  for (const arquivo of fs.readdirSync(pasta).filter((f) => f.endsWith(".ts"))) {
    const texto = fs.readFileSync(path.join(pasta, arquivo), "utf8");
    // Missões ficam com seis espaços de recuo dentro de `missions: [ { id: "...", ... } ]`.
    for (const m of texto.matchAll(/^ {6}id: "([^"]+)",\s*$/gm)) ids.push(m[1]);
  }
  if (ids.length !== 23) throw new Error(`esperava 23 missões, encontrei ${ids.length}: ${ids.join(", ")}`);
  return ids;
}

export function progressoCompleto(ids) {
  return Object.fromEntries(ids.map((id) => [id, { completedAt: 1, stars: 3, xp: 1, hintsUsed: 0, errors: 0, commands: 1, seconds: 1 }]));
}
