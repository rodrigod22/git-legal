// Fase 2, item 4: vídeo de abertura do módulo no Dojo.
// Confere que a janela abre antes da primeira missão do módulo, não toca sozinha, tem legendas e transcrição,
// passa no axe-core, fecha pelo botão "Pular" e pelo Escape, não volta depois de vista, pode ser revista pela
// trilha, e que o vídeo de verdade toca quando a pessoa aperta "Assistir" (arquivo servido pelo Vite ou pelo build).
// Uso: node scripts/check-2-video.mjs <pasta-de-saida> [url]  (padrão: http://127.0.0.1:5199/)
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const [outDir, url = "http://127.0.0.1:5199/"] = process.argv.slice(2);
const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error" && !/kaspersky/i.test(m.text())) errors.push("console: " + m.text()); });
let falhas = 0;
const check = (nome, ok, extra = "") => { console.log((ok ? "OK   " : "FALHA") + " " + nome + (extra ? " — " + extra : "")); if (!ok) falhas++; };
const shot = (n) => page.screenshot({ path: path.join(outDir, n + ".png") });
const dialog = () => page.locator(".intro[role=dialog]");

await page.goto(url);
await page.getByPlaceholder(/chamad/i).fill("Teste Vídeo");
await page.getByRole("button", { name: /Começar/ }).click();
await page.waitForSelector(".module");

// 1) botão na trilha, antes de qualquer missão
const botoesRever = page.getByRole("button", { name: /Vídeo de abertura/ });
check("trilha: um botão de vídeo por módulo", (await botoesRever.count()) === 6, String(await botoesRever.count()));

// 2) abrir a primeira missão mostra a janela
await page.locator(".mission-row:not([disabled])").first().click();
await page.waitForTimeout(500);
check("missão: janela do vídeo aparece na primeira missão do módulo", (await dialog().count()) === 1);
await shot("1-janela");
const video = page.locator(".intro video");
check("vídeo: preload=none (não baixa sem pedir)", (await video.getAttribute("preload")) === "none");
check("vídeo: não toca sozinho", await video.evaluate((v) => v.paused && v.currentTime === 0));
check("vídeo: tem poster", !!(await video.getAttribute("poster")));
check("vídeo: faixa de legendas em pt-BR", (await page.locator(".intro video track[kind=captions][srclang=pt-BR]").count()) === 1);
check("vídeo: transcrição em texto", (await page.locator(".intro-transcript li").count()) >= 7);
const foco = await page.evaluate(() => document.activeElement?.textContent ?? "");
check("teclado: foco inicial no botão de pular", /Pular vídeo/.test(foco), foco);

// 3) axe na janela
await page.addScriptTag({ content: axeSource });
const axe = await page.evaluate(async () => {
  const r = await window.axe.run(document, { resultTypes: ["violations"] });
  return r.violations.filter((v) => !v.nodes.every((n) => /kaspersky/i.test(n.html))).map((v) => v.id + " (" + v.impact + ") " + v.nodes.length);
});
check("axe: janela do vídeo sem violações", axe.length === 0, axe.join("; "));

// 4) "Assistir" toca o arquivo de verdade
await page.getByRole("button", { name: /Assistir/ }).click();
await page.waitForTimeout(2500);
const estado = await video.evaluate((v) => ({ paused: v.paused, t: v.currentTime, w: v.videoWidth, h: v.videoHeight, dur: v.duration, erro: v.error?.code ?? 0 }));
check("vídeo: toca depois de Assistir", !estado.paused && estado.t > 0.5, JSON.stringify(estado));
check("vídeo: 1280×720, 60 s", estado.w === 1280 && estado.h === 720 && Math.round(estado.dur) === 60, JSON.stringify(estado));
await shot("2-tocando");

// 5) Pular fecha, marca como visto e devolve o foco à missão
await page.getByRole("button", { name: /Pular vídeo/ }).last().click();
await page.waitForTimeout(400);
check("pular: janela fecha", (await dialog().count()) === 0);
check("pular: missão continua aberta por baixo", (await page.locator(".mission-title").count()) === 1);
const vistos = await page.evaluate(() => JSON.parse(localStorage.getItem("git-dojo-v1") ?? "{}").state?.introsSeen ?? []);
check("pular: módulo registrado em introsSeen", vistos.includes("fundamentos"), JSON.stringify(vistos));

// 6) voltar à trilha e abrir de novo: não repete
await page.getByRole("button", { name: /Trilha/ }).first().click();
await page.waitForSelector(".module");
await page.locator(".mission-row:not([disabled])").first().click();
await page.waitForTimeout(500);
check("repetição: segunda vez não mostra o vídeo", (await dialog().count()) === 0);

// 7) rever pela trilha e fechar com Escape
await page.getByRole("button", { name: /Trilha/ }).first().click();
await page.waitForSelector(".module");
const rever = page.getByRole("button", { name: /Rever o vídeo de abertura/ });
check("trilha: botão vira 'Rever' no módulo visto", (await rever.count()) === 1);
await rever.first().click();
await page.waitForTimeout(400);
check("rever: janela abre pela trilha", (await dialog().count()) === 1);
await shot("3-rever");
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
check("rever: Escape fecha", (await dialog().count()) === 0);
const focoDepois = await page.evaluate(() => document.activeElement?.textContent ?? "");
check("rever: foco volta ao botão da trilha", /Rever o vídeo/.test(focoDepois), focoDepois);

// 8) movimento reduzido: idem, continua sem tocar sozinho
await page.emulateMedia({ reducedMotion: "reduce" });
await page.getByRole("button", { name: /Vídeo de abertura/ }).nth(1).click();
await page.waitForTimeout(500);
check("movimento reduzido: janela abre pelo botão do segundo módulo e o vídeo fica parado", (await dialog().count()) === 1 && (await video.evaluate((v) => v.paused)));
await page.keyboard.press("Escape");

// 9) segundo módulo também servido: todos os seis arquivos respondem
const faltando = [];
for (const m of ["fundamentos", "branches", "merge", "conflitos", "trunk", "perigo"]) {
  for (const ext of ["mp4", "vtt", "jpg"]) {
    const r = await page.request.get(new URL("videos/" + m + "." + ext, url).toString());
    if (!r.ok()) faltando.push(m + "." + ext + " " + r.status());
  }
}
check("arquivos: 18 arquivos de vídeo, legenda e poster servidos", faltando.length === 0, faltando.join(", "));

check("sem erros na página", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(falhas ? "== " + falhas + " FALHA(S)" : "== tudo OK");
process.exit(falhas ? 1 : 0);
