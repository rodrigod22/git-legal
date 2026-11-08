// Item 2 da Etapa 1G: reflow (WCAG 1.4.10) e zoom de 200% (WCAG 1.4.4) nas nove telas da auditoria da 1F.
// Uso: node scripts/check-1g-reflow.mjs <pasta-de-saida> [url]  (padrão: http://127.0.0.1:5199/)
// Viewports: 320×640 (celular estreito) e 720×450 (1440×900 com zoom de 200%, que o Chrome trata como viewport pela metade).
// Em cada tela mede: rolagem horizontal da página e elementos que vazam (como `semVazamento` do check-1b-fluxo.mjs),
// texto cortado por overflow escondido sem reticências, e controles focáveis que não cabem na tela nem depois de rolar.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { idsDasMissoes, progressoCompleto, dispensaVideo, entraNoSite, argsDoChrome, abreTelaDeLogin } from "./lib-missoes.mjs";

let telaDeLogin = "";

const [outDir, url = "http://127.0.0.1:5199/"] = process.argv.slice(2);
if (!outDir) {
  console.error("uso: node scripts/check-1g-reflow.mjs <pasta-de-saida> [url]");
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });
// O antivírus da máquina (Kaspersky) injeta um script em páginas HTTP; não é do Dojo e fica fora da conta.
const ambiente = /kaspersky-labs\.com/;

const PERFIS = {
  "320px": { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  "zoom200": { viewport: { width: 720, height: 450 }, deviceScaleFactor: 2 },
};

const browser = await chromium.launch({ channel: "chrome", headless: true, args: argsDoChrome() });
const resultados = [];
const errosPagina = [];
const check = (perfil, tela, nome, ok, detalhe = "") => resultados.push({ perfil, tela, nome, ok, detalhe });

async function medir(page, perfil, tela) {
  await page.waitForTimeout(250);
  // um toast entra deslizando da direita; mede só depois que ele assentou, senão o deslize conta como vazamento
  await page.waitForFunction(() => [...document.querySelectorAll(".toast")].every((t) => t.getBoundingClientRect().right <= innerWidth + 1), null, { timeout: 3000 }).catch(() => {});
  const m = await page.evaluate(() => {
    const w = innerWidth;
    const nome = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === "string" ? "." + e.className.split(" ").filter(Boolean).slice(0, 2).join(".") : "") + (e.getAttribute("aria-label") ? `[${e.getAttribute("aria-label").slice(0, 25)}]` : "");
    const visivel = (e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    const escondido = (e) => e.closest(".sr-only") || e.classList.contains("sr-only") || e.classList.contains("nav-label");
    // 1. vazamento horizontal: elemento que passa da borda direita sem nenhum ancestral que o recorte
    const vazam = [...document.querySelectorAll("body *")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height || r.right <= w + 1) return false;
        if (escondido(e)) return false;
        for (let p = e.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o !== "visible" && p !== document.documentElement && p !== document.body) return false;
        }
        return true;
      })
      .map(nome);
    // 2. texto cortado: elemento com texto direto, mais largo ou mais alto do que o espaço, recortado sem reticências e sem rolagem
    const cortados = [];
    for (const e of document.querySelectorAll("body *")) {
      if (escondido(e) || !visivel(e)) continue;
      const temTexto = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!temTexto) continue;
      const cs = getComputedStyle(e);
      const recorta = (o) => o === "hidden" || o === "clip";
      const largo = e.scrollWidth > e.clientWidth + 1 && recorta(cs.overflowX) && cs.textOverflow !== "ellipsis";
      const alto = e.scrollHeight > e.clientHeight + 1 && recorta(cs.overflowY) && cs.webkitLineClamp === "none";
      if (largo || alto) cortados.push(`${nome(e)}(${largo ? `${e.scrollWidth}>${e.clientWidth}w` : ""}${alto ? `${e.scrollHeight}>${e.clientHeight}h` : ""})`);
    }
    // 3. controles: cada focável visível precisa caber na tela depois de rolar até ele
    const foraAlcance = [];
    const controles = [...document.querySelectorAll("button, a[href], input, textarea, select, [tabindex]:not([tabindex='-1'])")].filter((e) => visivel(e) && !e.disabled && !escondido(e));
    for (const e of controles) {
      e.scrollIntoView({ block: "nearest", inline: "nearest" });
      const r = e.getBoundingClientRect();
      if (r.left < -1 || r.right > w + 1 || r.top < -1 || r.bottom > innerHeight + 1) foraAlcance.push(`${nome(e)}@${Math.round(r.left)},${Math.round(r.top)}-${Math.round(r.right)},${Math.round(r.bottom)}`);
    }
    scrollTo(0, 0);
    return { w, scroll: document.documentElement.scrollWidth, vazam: [...new Set(vazam)].slice(0, 6), cortados: [...new Set(cortados)].slice(0, 6), foraAlcance: foraAlcance.slice(0, 6), controles: controles.length };
  });
  await page.screenshot({ path: path.join(outDir, `reflow-${perfil}-${tela}.png`), fullPage: false });
  check(perfil, tela, "sem rolagem horizontal", m.scroll <= m.w && !m.vazam.length, `${m.scroll}/${m.w}px ${m.vazam.join(" ")}`);
  check(perfil, tela, "sem texto cortado", !m.cortados.length, m.cortados.join(" "));
  check(perfil, tela, `controles alcançáveis (${m.controles})`, !m.foraAlcance.length, m.foraAlcance.join(" "));
}

for (const [perfil, opcoes] of Object.entries(PERFIS)) {
  const context = await browser.newContext(opcoes);
  const page = await context.newPage();
  page.on("pageerror", (e) => errosPagina.push(`${perfil}: pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !ambiente.test(msg.location()?.url ?? "") && !/ERR_/.test(msg.text())) errosPagina.push(`${perfil}: console: ${msg.text()}`);
  });
  const input = page.locator("input[aria-label='Linha de comando']");
  const type = async (cmd) => {
    await input.fill(cmd);
    await input.press("Enter");
    await page.waitForTimeout(180);
  };
  const nav = (re) => page.evaluate((src) => [...document.querySelectorAll("button")].find((b) => new RegExp(src).test(b.textContent) || new RegExp(src).test(b.getAttribute("aria-label") ?? ""))?.click(), re);

  // 0. tela de login (Etapa 1H): a do site publicado, ou a cópia de deploy/login/ no Vite local
  const paginaLogin = await context.newPage();
  telaDeLogin = await abreTelaDeLogin(paginaLogin, url);
  await medir(paginaLogin, perfil, "0-login");
  await paginaLogin.close();

  // 1. início
  await entraNoSite(page, url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(3800);
  await medir(page, perfil, "1-inicio");

  // 2. trilha
  await page.fill("input[aria-label='Seu nome']", "Teste Reflow");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  await medir(page, perfil, "2-trilha");

  // 3. missão, com saída no terminal
  await page.locator(".mission-row:not([disabled])").first().click();
  await dispensaVideo(page);
  await page.waitForTimeout(700);
  await type("git status");
  await medir(page, perfil, "3-missao");

  // 4. conclusão
  for (const c of ["git init", 'echo "# Portal RPA" > README.md', "git add README.md", 'git commit -m "primeiro commit"']) await type(c);
  await page.waitForTimeout(1200);
  await medir(page, perfil, "4-conclusao");
  await page.getByText("Voltar à trilha").click();
  await page.waitForTimeout(500);

  // 5. Playground
  await nav("^\\s*Playground\\s*$");
  await page.waitForTimeout(700);
  await type("git log --oneline --all");
  await medir(page, perfil, "5-playground");

  // 6. editor de conflito
  for (const c of ["git switch feature/relatorio", 'echo "<?php echo 1;" > index.php', "git add .", 'git commit -m "muda index"', "git switch main", "git merge feature/relatorio", "edit index.php"]) await type(c);
  await page.waitForTimeout(600);
  await medir(page, perfil, "6-editor-conflito");
  await page.getByText("Manter ambos").first().click();
  await page.getByText("Salvar e fechar").click();
  await page.waitForTimeout(300);

  // 7. Conquistas
  await nav("^\\s*Conquistas\\s*$");
  await page.waitForTimeout(700);
  await medir(page, perfil, "7-conquistas");

  // 8. Cola
  await nav("^\\s*Cola( de comandos)?\\s*$");
  await page.waitForTimeout(700);
  await medir(page, perfil, "8-cola");

  // 9. certificado
  await page.evaluate((progress) => {
    const salvo = JSON.parse(localStorage.getItem("git-dojo-v1"));
    salvo.state.progress = progress;
    salvo.state.xp = 2931;
    localStorage.setItem("git-dojo-v1", JSON.stringify(salvo));
  }, progressoCompleto(idsDasMissoes()));
  await page.reload();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /Continuar|Começar/ }).click();
  await dispensaVideo(page);
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Ver certificado/ }).click();
  await page.waitForTimeout(900);
  await medir(page, perfil, "9-certificado");

  await context.close();
}
await browser.close();

const linhas = [];
let falhas = 0;
for (const perfil of Object.keys(PERFIS)) {
  linhas.push(`== ${perfil} (${PERFIS[perfil].viewport.width}×${PERFIS[perfil].viewport.height})`);
  for (const r of resultados.filter((r) => r.perfil === perfil)) {
    if (!r.ok) falhas++;
    linhas.push(`${r.ok ? "OK   " : "FALHA"} ${r.tela}: ${r.nome}${r.ok ? "" : " — " + r.detalhe}`);
  }
}
linhas.push(`       tela de login auditada: ${telaDeLogin}`);
linhas.push(`${errosPagina.length ? "FALHA" : "OK   "} sem erros na página${errosPagina.length ? " — " + errosPagina.join(" | ") : ""}`);
linhas.push(`== ${resultados.length - falhas} OK · ${falhas} FALHA`);
const texto = linhas.join("\n");
fs.writeFileSync(path.join(outDir, "resumo.txt"), texto);
console.log(texto);
process.exitCode = falhas || errosPagina.length ? 1 : 0;
