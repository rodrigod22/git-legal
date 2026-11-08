// Item 1 da Etapa 1F: auditoria automática de acessibilidade com o axe-core em todas as telas.
// Uso: node scripts/check-1f-acessibilidade.mjs <pasta-de-saida> [url]  (padrão: http://127.0.0.1:5199/)
// Roda em desktop e no perfil Pixel 7, grava <pasta>/axe-<perfil>-<tela>.json e um resumo por gravidade e por tela.
import { chromium, devices } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { idsDasMissoes, progressoCompleto } from "./lib-missoes.mjs";

const [outDir, url = "http://127.0.0.1:5199/"] = process.argv.slice(2);
if (!outDir) {
  console.error("uso: node scripts/check-1f-acessibilidade.mjs <pasta-de-saida> [url]");
  process.exit(2);
}
fs.mkdirSync(outDir, { recursive: true });
const axePath = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
// O antivírus da máquina (Kaspersky) injeta um script em páginas HTTP; não é do Dojo e fica fora da conta.
const ambiente = /kaspersky-labs\.com/;
const GRAVIDADES = ["critical", "serious", "moderate", "minor"];

const PERFIS = {
  desktop: { viewport: { width: 1440, height: 900 } },
  celular: devices["Pixel 7"],
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const resumo = {}; // perfil -> tela -> { critical, serious, moderate, minor, regras: [] }
const errosPagina = [];

async function auditar(page, perfil, tela) {
  if (!(await page.evaluate(() => typeof window.axe !== "undefined"))) await page.addScriptTag({ path: axePath });
  const r = await page.evaluate(async () => {
    const res = await window.axe.run(document, { resultTypes: ["violations", "incomplete"] });
    return { violations: res.violations, incomplete: res.incomplete, url: location.href };
  });
  // Nós injetados pelo ambiente não contam.
  for (const v of r.violations) v.nodes = v.nodes.filter((n) => !ambiente.test(n.html));
  r.violations = r.violations.filter((v) => v.nodes.length > 0);
  fs.writeFileSync(path.join(outDir, `axe-${perfil}-${tela}.json`), JSON.stringify(r, null, 2));
  await page.screenshot({ path: path.join(outDir, `axe-${perfil}-${tela}.png`) });
  const contagem = Object.fromEntries(GRAVIDADES.map((g) => [g, 0]));
  const regras = [];
  for (const v of r.violations) {
    contagem[v.impact] += v.nodes.length;
    regras.push(`${v.impact}: ${v.id} ×${v.nodes.length} — ${v.help} (${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join("; ")}${v.nodes.length > 3 ? "; …" : ""})`);
  }
  resumo[perfil] ??= {};
  resumo[perfil][tela] = { ...contagem, regras, incompletos: r.incomplete.length };
}

for (const [perfil, opcoes] of Object.entries(PERFIS)) {
  const context = await browser.newContext(opcoes);
  const page = await context.newPage();
  page.on("pageerror", (e) => errosPagina.push(`${perfil}: pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !ambiente.test(m.location()?.url ?? "") && !/ERR_/.test(m.text())) errosPagina.push(`${perfil}: console: ${m.text()}`);
  });
  const input = page.locator("input[aria-label='Linha de comando']");
  const type = async (cmd) => {
    await input.fill(cmd);
    await input.press("Enter");
    await page.waitForTimeout(180);
  };

  // 1. início
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // a demonstração do terminal entra linha a linha por uns 3 s; auditar antes acusaria contraste em texto ainda transparente
  await page.waitForTimeout(3800);
  await auditar(page, perfil, "1-inicio");

  // 2. trilha
  await page.fill("input[aria-label='Seu nome']", "Teste A11y");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(700);
  await auditar(page, perfil, "2-trilha");

  // 3. missão (a primeira), com alguma saída no terminal
  await page.locator(".mission-row:not([disabled])").first().click();
  await page.waitForTimeout(700);
  await type("git status");
  await auditar(page, perfil, "3-missao");

  // 4. tela de conclusão: resolve a missão 1
  for (const c of ["git init", 'echo "# Portal RPA" > README.md', "git add README.md", 'git commit -m "primeiro commit"']) await type(c);
  await page.waitForTimeout(1200);
  await auditar(page, perfil, "4-conclusao");
  await page.getByText("Voltar à trilha").click();
  await page.waitForTimeout(500);

  // 5. Playground
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Playground/.test(b.textContent) || b.title === "Playground" || b.getAttribute("aria-label") === "Playground")?.click());
  await page.waitForTimeout(700);
  await type("git log --oneline --all");
  await auditar(page, perfil, "5-playground");

  // 6. editor de conflito
  for (const c of ["git switch feature/relatorio", 'echo "<?php echo 1;" > index.php', "git add .", 'git commit -m "muda index"', "git switch main", "git merge feature/relatorio", "edit index.php"]) await type(c);
  await page.waitForTimeout(600);
  await auditar(page, perfil, "6-editor-conflito");
  await page.getByText("Manter ambos").first().click();
  await page.getByText("Salvar e fechar").click();
  await page.waitForTimeout(300);

  // 7. Conquistas
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Conquistas/.test(b.textContent) || b.title === "Conquistas" || b.getAttribute("aria-label") === "Conquistas")?.click());
  await page.waitForTimeout(700);
  await auditar(page, perfil, "7-conquistas");

  // 8. Cola
  await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^\s*Cola\s*$/.test(b.textContent) || b.title === "Cola de comandos" || b.getAttribute("aria-label") === "Cola de comandos")?.click());
  await page.waitForTimeout(700);
  await auditar(page, perfil, "8-cola");

  // 9. certificado, com progresso completo
  await page.evaluate((progress) => {
    const salvo = JSON.parse(localStorage.getItem("git-dojo-v1"));
    salvo.state.progress = progress;
    salvo.state.xp = 2931;
    localStorage.setItem("git-dojo-v1", JSON.stringify(salvo));
  }, progressoCompleto(idsDasMissoes()));
  await page.reload();
  await page.waitForTimeout(900);
  await page.getByRole("button", { name: /Continuar|Começar/ }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Ver certificado/ }).click();
  await page.waitForTimeout(900);
  await auditar(page, perfil, "9-certificado");

  await context.close();
}
await browser.close();

// Resumo
const linhas = [];
const total = Object.fromEntries(GRAVIDADES.map((g) => [g, 0]));
for (const [perfil, telas] of Object.entries(resumo)) {
  linhas.push(`== ${perfil}`);
  for (const [tela, r] of Object.entries(telas)) {
    for (const g of GRAVIDADES) total[g] += r[g];
    const soma = GRAVIDADES.map((g) => `${g} ${r[g]}`).join(" · ");
    linhas.push(`${r.critical + r.serious > 0 ? "FALHA" : "OK   "} ${tela}: ${soma} · incompletos ${r.incompletos}`);
    for (const regra of r.regras) linhas.push(`        ${regra}`);
  }
}
linhas.push(`== total: ${GRAVIDADES.map((g) => `${g} ${total[g]}`).join(" · ")}`);
linhas.push(`${errosPagina.length ? "FALHA" : "OK   "} sem erros na página${errosPagina.length ? " — " + errosPagina.join(" | ") : ""}`);
const texto = linhas.join("\n");
fs.writeFileSync(path.join(outDir, "resumo.txt"), texto);
console.log(texto);
process.exitCode = total.critical + total.serious > 0 || errosPagina.length ? 1 : 0;
