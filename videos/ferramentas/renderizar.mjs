// Verifica e renderiza os vídeos de abertura e copia o resultado para public/videos/ do Dojo.
// Uso: node ferramentas/renderizar.mjs [modulo ...] [--crf 24] [--sem-copia] [--so-checar] [--sem-check]
//   sem módulo: todos (fundamentos branches merge conflitos trunk perigo)
//
// Antes de renderizar, confere que a narração assets/audio/voz-<modulo>.m4a existe (gere com `npm run voz`;
// só o .m4a entra no Git). Os vídeos não têm música desde 08/11/2026: só voz e efeitos.
//
// `hyperframes check` e `snapshot` só olham o index.html do projeto, e uma composição montada com
// data-start diferente de zero não ativa as cenas internas. Por isso este script reescreve o index.html
// com UMA composição montada em 0 s, roda check e snapshot, e restaura o index.html original no fim.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, statSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODULOS = ["fundamentos", "branches", "merge", "conflitos", "trunk", "perigo"];
const args = process.argv.slice(2);
const crf = args.includes("--crf") ? args[args.indexOf("--crf") + 1] : "24";
const semCopia = args.includes("--sem-copia");
const soChecar = args.includes("--so-checar");
const semCheck = args.includes("--sem-check");
const pedidos = args.filter((a) => MODULOS.includes(a));
const lista = pedidos.length ? pedidos : MODULOS;
const hf = path.join(raiz, "node_modules", "hyperframes", "bin", "hyperframes.mjs");
const ffmpeg = process.env.FFMPEG || "C:/ffmpeg/bin/ffmpeg.exe";
const destino = path.resolve(raiz, "..", "public", "videos");
const indexPath = path.join(raiz, "index.html");
const indexOriginal = readFileSync(indexPath, "utf8");

function roda(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { cwd: raiz, stdio: "inherit", shell: false, ...opts });
  return r.status ?? 1;
}
function indexPara(m) {
  return indexOriginal.replace('data-duration="360"', 'data-duration="60"').replace(/<div id="m-[a-z]+" class="clip" data-composition-id="[a-z]+" data-composition-src="compositions\/[a-z]+\.html"[^>]*><\/div>\s*/g, "").replace(
    /(<div id="root"[^>]*>)/,
    '$1\n      <div class="clip" data-composition-id="' + m + '" data-composition-src="compositions/' + m + '.html" data-start="0" data-duration="60" data-track-index="0"></div>',
  );
}
function restaura() {
  writeFileSync(indexPath, indexOriginal);
}
process.on("exit", restaura);

for (const m of lista) {
  const voz = path.join(raiz, "assets", "audio", "voz-" + m + ".m4a");
  if (!existsSync(voz)) { console.error("falta " + voz + " (rode npm run voz -- " + m + ")"); process.exit(1); }
}

const t0 = Date.now();
for (const m of lista) {
  const comp = "compositions/" + m + ".html";
  console.log("\n== " + m + ": lint");
  if (roda("node", [hf, "lint", comp])) process.exit(1);
  if (!semCheck) {
    writeFileSync(indexPath, indexPara(m));
    console.log("== " + m + ": check");
    if (roda("node", [hf, "check", "--samples", "12", "--budget", "4m", "."])) process.exit(1);
    const snaps = path.join(raiz, "renders", "quadros", m);
    rmSync(snaps, { recursive: true, force: true });
    console.log("== " + m + ": snapshot");
    roda("node", [hf, "snapshot", "--at", "3,10,14,21,30,36,39,45,49,56", "-o", snaps, "."]);
    restaura();
  }
  if (soChecar) continue;
  const saida = path.join("renders", m + ".mp4");
  console.log("== " + m + ": render (CRF " + crf + ")");
  const ini = Date.now();
  if (roda("node", [hf, "render", "-c", comp, "-o", saida, "--crf", crf, "--quiet", "."])) process.exit(1);
  const seg = ((Date.now() - ini) / 1000).toFixed(0);
  const kb = (statSync(path.join(raiz, saida)).size / 1024).toFixed(0);
  console.log("== " + m + ": " + seg + " s, " + kb + " KB");
  if (!semCopia) {
    mkdirSync(destino, { recursive: true });
    copyFileSync(path.join(raiz, saida), path.join(destino, m + ".mp4"));
    // pôster: um quadro da abertura, para o player mostrar algo antes de carregar o vídeo
    roda(ffmpeg, ["-y", "-v", "error", "-ss", "3", "-i", path.join(raiz, saida), "-frames:v", "1", "-q:v", "4", path.join(destino, m + ".jpg")]);
    console.log("== " + m + ": copiado para public/videos/" + m + ".mp4 (+ .jpg)");
  }
}
console.log("\ntotal " + ((Date.now() - t0) / 1000).toFixed(0) + " s");
