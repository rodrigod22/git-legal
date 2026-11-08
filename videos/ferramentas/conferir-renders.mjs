// Confere os MP4 em public/videos/: duração, resolução, codecs, tamanho e, no Chrome (playwright-core do Dojo),
// que cada um toca com áudio. Uso: node ferramentas/conferir-renders.mjs
import { spawnSync } from "node:child_process";
import { statSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dojo = path.resolve(raiz, "..");
const pasta = path.join(dojo, "public", "videos");
const ffprobe = process.env.FFPROBE || "C:/ffmpeg/bin/ffprobe.exe";
const MODULOS = ["fundamentos", "branches", "merge", "conflitos", "trunk", "perigo"];
let falhas = 0;
const check = (nome, ok, extra = "") => { console.log((ok ? "OK   " : "FALHA") + " " + nome + (extra ? " — " + extra : "")); if (!ok) falhas++; };

const linhas = ["| Módulo | Duração | Resolução | Vídeo | Áudio | Tamanho |", "|---|---|---|---|---|---|"];
for (const m of MODULOS) {
  const f = path.join(pasta, m + ".mp4");
  if (!existsSync(f)) { check(m + ": arquivo existe", false); continue; }
  const r = spawnSync(ffprobe, ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate:format=duration", "-of", "json", f], { encoding: "utf8" });
  const info = JSON.parse(r.stdout);
  const v = info.streams.find((s) => s.codec_type === "video");
  const a = info.streams.find((s) => s.codec_type === "audio");
  const dur = parseFloat(info.format.duration);
  const kb = statSync(f).size / 1024;
  check(m + ": 60 s, 1280×720, H.264 + AAC, abaixo de 4 MB", Math.abs(dur - 60) < 0.2 && v?.width === 1280 && v?.height === 720 && v?.codec_name === "h264" && a?.codec_name === "aac" && kb < 4096, `${dur.toFixed(2)} s, ${v?.width}×${v?.height}, ${v?.codec_name}/${a?.codec_name ?? "sem áudio"}, ${(kb / 1024).toFixed(2)} MB`);
  linhas.push(`| ${m} | ${dur.toFixed(1)} s | ${v?.width}×${v?.height} @ ${v?.r_frame_rate} | ${v?.codec_name} | ${a?.codec_name ?? "—"} | ${(kb / 1024).toFixed(2)} MB |`);
  check(m + ": poster e legenda ao lado", existsSync(path.join(pasta, m + ".jpg")) && existsSync(path.join(pasta, m + ".vtt")));
}
console.log("\n" + linhas.join("\n") + "\n");

// Reprodução no Chrome: página ao lado dos vídeos, aberta por file:// (setContent em about:blank não carrega file://)
const require = createRequire(path.join(dojo, "package.json"));
const { chromium } = require("playwright-core");
const html = path.join(pasta, "_teste-reproducao.html");
writeFileSync(html, "<!doctype html><meta charset=utf-8>" + MODULOS.map((m) => `<video id="${m}" src="${m}.mp4" muted></video>`).join(""));
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
await page.goto("file:///" + html.replace(/\\/g, "/"));
for (const m of MODULOS) {
  const res = await page.evaluate(async (id) => {
    const v = document.getElementById(id);
    await v.play().catch((e) => ({ erro: String(e) }));
    await new Promise((r) => setTimeout(r, 1500));
    const trilhas = v.audioTracks ? v.audioTracks.length : (v.mozHasAudio ? 1 : (v.webkitAudioDecodedByteCount > 0 ? 1 : -1));
    return { t: v.currentTime, w: v.videoWidth, h: v.videoHeight, dur: v.duration, erro: v.error?.code ?? 0, audioBytes: v.webkitAudioDecodedByteCount ?? -1, trilhas };
  }, m);
  check(m + ": toca no Chrome com áudio decodificado", res.t > 1 && res.erro === 0 && res.w === 1280 && (res.audioBytes > 0 || res.trilhas > 0), JSON.stringify(res));
}
await browser.close();
spawnSync(process.platform === "win32" ? "cmd" : "rm", process.platform === "win32" ? ["/c", "del", html] : [html]);
console.log(falhas ? "== " + falhas + " FALHA(S)" : "== tudo OK");
process.exit(falhas ? 1 : 0);
