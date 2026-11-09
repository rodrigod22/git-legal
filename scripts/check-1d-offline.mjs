// Itens 6 e 7 da Etapa 1D: o Dojo servido de uma subpasta, sem acesso à internet.
// Bloqueia toda requisição fora do host do Dojo, percorre as telas, confere as fontes e o localStorage.
// Uso: node scripts/check-1d-offline.mjs <pasta-de-saida> [url]  (padrão: http://127.0.0.1:5198/git-dojo/)
import { chromium } from "playwright-core";
import path from "node:path";
import { idsDasMissoes, progressoCompleto, dispensaVideo, entraNoSite, argsDoChrome } from "./lib-missoes.mjs";

const [outDir, url = "http://127.0.0.1:5198/git-dojo/"] = process.argv.slice(2);
const base = new URL(url);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: argsDoChrome() });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const bloqueadas = [];
const foraDaBase = [];
const falhas = [];
const errors = [];
// O antivírus da máquina (Kaspersky) injeta um script em páginas HTTP; não é do Dojo e fica fora da conta.
const ambiente = /kaspersky-labs\.com/;
await page.route("**/*", (route) => {
  const u = new URL(route.request().url());
  if (u.host !== base.host) {
    if (!ambiente.test(u.href)) bloqueadas.push(u.href);
    return route.abort("internetdisconnected");
  }
  if (!u.pathname.startsWith(base.pathname)) foraDaBase.push(u.href);
  return route.continue();
});
page.on("requestfailed", (r) => {
  if (!ambiente.test(r.url())) falhas.push(`${r.url()} — ${r.failure()?.errorText}`);
});
// O Dojo pergunta em _auth/me se há sessão do site publicado (botão "Sair"); um servidor estático sem
// login responde 404, o que é esperado e não conta como falha.
const semLogin = (u, status) => status === 404 && /\/_auth\/me$/.test(new URL(u).pathname);
page.on("response", (r) => {
  if (r.status() >= 400 && !semLogin(r.url(), r.status())) falhas.push(`${r.url()} — HTTP ${r.status()}`);
});
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  const origem = m.location()?.url ?? "";
  if (m.type() === "error" && !ambiente.test(origem) && !ambiente.test(m.text()) && !(origem && semLogin(origem, 404) && /404/.test(m.text()))) errors.push("console: " + m.text());
});

const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "OK   " : "FALHA"} ${name}${detail ? " — " + detail : ""}`);
const shot = (n) => page.screenshot({ path: path.join(outDir, `offline-${n}.png`) });
const fontes = () =>
  page.evaluate(async () => {
    await document.fonts.ready;
    // O navegador só baixa uma face quando algum texto a usa; forçar o load prova que todos os arquivos são servidos.
    await Promise.all([...document.fonts].map((f) => f.load().catch(() => null)));
    const faces = [...document.fonts].map((f) => `${f.family.replace(/"/g, "")} ${f.weight} ${f.status}`);
    const carregada = (familia, peso) => document.fonts.check(`${peso} 16px "${familia}"`) && faces.some((f) => f.startsWith(`${familia} ${peso} loaded`));
    return {
      faces,
      inter: [400, 500, 600, 700, 800].map((p) => [p, carregada("Inter", p)]),
      mono: [400, 500, 700].map((p) => [p, carregada("JetBrains Mono", p)]),
      body: getComputedStyle(document.body).fontFamily,
    };
  });

// Tela inicial
await entraNoSite(page, url);
await page.waitForTimeout(1200);
check("tela inicial abre na subpasta", (await page.locator(".home").count()) === 1, page.url());
await shot("1-home");

// Mapa
await page.fill("input[aria-label='Seu nome']", "Teste Offline");
await page.keyboard.press("Enter");
await page.waitForTimeout(600);
check("mapa abre", (await page.locator(".map-head").count()) === 1);
await shot("2-mapa");

// Missão
await page.locator(".mission-row:not([disabled])").first().click();
await dispensaVideo(page);
await page.waitForTimeout(600);
check("missão abre com terminal", (await page.locator("input[aria-label='Linha de comando']").count()) === 1);
await page.fill("input[aria-label='Linha de comando']", "git status");
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
await shot("3-missao");

// Cola
await page.getByRole("button", { name: "Cola", exact: true }).click();
await page.waitForTimeout(500);
check("Cola abre", /Cola|cola/.test(await page.locator("body").innerText()));
await shot("4-cola");

// Fontes, com a página já cheia de texto normal e mono
const f = await fontes();
check("Inter carregada nos pesos 400 a 800", f.inter.every(([, ok]) => ok), f.inter.map(([p, ok]) => `${p}:${ok ? "sim" : "não"}`).join(" "));
check("JetBrains Mono carregada nos pesos 400, 500 e 700", f.mono.every(([, ok]) => ok), f.mono.map(([p, ok]) => `${p}:${ok ? "sim" : "não"}`).join(" "));
check("body usa Inter", /^"?Inter"?/.test(f.body), f.body);
results.push(`       faces registradas: ${f.faces.length ? f.faces.join("; ") : "nenhuma"}`);

// localStorage sobrevive ao reload na subpasta; certificado com progresso completo
await page.evaluate((progress) => {
  const salvo = JSON.parse(localStorage.getItem("git-dojo-v1"));
  salvo.state.progress = progress;
  salvo.state.xp = 2931;
  localStorage.setItem("git-dojo-v1", JSON.stringify(salvo));
}, progressoCompleto(idsDasMissoes()));
await page.reload();
await page.waitForTimeout(800);
const nomeSalvo = await page.inputValue("input[aria-label='Seu nome']");
const storage = await page.evaluate(() => JSON.parse(localStorage.getItem("git-dojo-v1") ?? "{}").state?.playerName);
check("nome sobrevive ao reload (localStorage na subpasta)", nomeSalvo === "Teste Offline", `campo: "${nomeSalvo}" · storage: "${storage}"`);
await page.getByRole("button", { name: /Continuar|Começar/ }).click();
await dispensaVideo(page);
await page.waitForTimeout(600);
check("progresso sobrevive ao reload: mapa oferece o certificado", (await page.getByRole("button", { name: /Ver certificado/ }).count()) === 1);
await page.getByRole("button", { name: /Ver certificado/ }).click();
await page.waitForTimeout(800);
check("certificado abre", /Teste Offline/.test(await page.locator("body").innerText()));
await shot("5-certificado");

check(`nenhuma requisição fora de ${base.host}`, bloqueadas.length === 0, bloqueadas.join(" | "));
check("todas as requisições ficaram dentro da subpasta", foraDaBase.length === 0, foraDaBase.join(" | "));
check("nenhuma requisição falhou", falhas.length === 0, falhas.join(" | "));
check("sem erros na página", errors.length === 0, errors.join(" | "));
console.log(results.join("\n"));
await browser.close();
process.exitCode = results.some((r) => r.startsWith("FALHA")) ? 1 : 0;
