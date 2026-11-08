// Gera public/videos/<modulo>.vtt a partir das deixas em src/content/videos.ts.
// Uso: npx vite-node scripts/gerar-legendas.ts
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VIDEOS } from "../src/content/videos";

const destino = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "videos");
mkdirSync(destino, { recursive: true });

const tempo = (s: number) => {
  const m = Math.floor(s / 60);
  const seg = s - m * 60;
  return `${String(m).padStart(2, "0")}:${seg.toFixed(3).padStart(6, "0")}`;
};

for (const v of VIDEOS) {
  const linhas = ["WEBVTT", "", `NOTE Legendas do vídeo de abertura do módulo ${v.moduleId} do Git Dojo. Geradas por scripts/gerar-legendas.ts.`, ""];
  v.cues.forEach((c, i) => {
    linhas.push(String(i + 1), `${tempo(c.start)} --> ${tempo(c.end)}`, c.text, "");
  });
  writeFileSync(path.join(destino, `${v.moduleId}.vtt`), linhas.join("\n"), "utf8");
  console.log("ok", `${v.moduleId}.vtt`, v.cues.length, "deixas");
}
