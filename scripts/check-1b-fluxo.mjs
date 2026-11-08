// Itens 14 e 15 da Etapa 1B: percorre a tela de missão em um navegador e formato de tela.
// Uso: node scripts/check-1b-fluxo.mjs <pasta-de-saida> <chrome|msedge> <desktop|celular|celular-deitado> [url]
import { chromium, devices } from "playwright-core";
import path from "node:path";
import { dispensaVideo } from "./lib-missoes.mjs";

const [outDir, channel = "chrome", formato = "desktop", url = "http://127.0.0.1:5199/"] = process.argv.slice(2);
const browser = await chromium.launch({ channel, headless: true });
const perfil = {
  desktop: { viewport: { width: 1440, height: 900 } },
  celular: devices["Pixel 7"],
  "celular-deitado": devices["Pixel 7 landscape"],
}[formato];
const context = await browser.newContext(perfil);
const page = await context.newPage();
const prefixo = `${channel}-${formato}`;
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/fonts\.g|ERR_/.test(m.text())) errors.push("console: " + m.text());
});

const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "OK   " : "FALHA"} ${name}${detail ? " — " + detail : ""}`);
const shot = (n, fullPage = false) => page.screenshot({ path: path.join(outDir, `${prefixo}-${n}.png`), fullPage });
const input = page.locator("input[aria-label='Linha de comando']");
const type = async (cmd) => {
  await input.fill(cmd);
  await input.press("Enter");
  await page.waitForTimeout(180);
};
const semVazamento = async (nome) => {
  const m = await page.evaluate((w) => {
    const fora = [...document.querySelectorAll("body *")]
      .filter((e) => {
        const r = e.getBoundingClientRect();
        if (!r.width || !r.height || r.right <= w + 1) return false;
        for (let p = e.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p).overflowX;
          if (o !== "visible" && p !== document.documentElement && p !== document.body) return false;
        }
        return true;
      })
      .slice(0, 4)
      .map((e) => e.tagName.toLowerCase() + "." + String(e.className.baseVal ?? e.className).split(" ")[0]);
    return { w, scroll: Math.max(document.documentElement.scrollWidth, innerWidth), fora };
  }, perfil.viewport.width);
  check(`${nome}: sem rolagem horizontal`, m.scroll <= m.w && !m.fora.length, `${m.scroll}/${m.w}px ${m.fora.join(" ")}`);
};
const noViewport = (loc) =>
  loc.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1;
  });

await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(800);
await semVazamento("início");
await page.fill("input[aria-label='Seu nome']", "Teste");
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
await semVazamento("trilha");

// missão 1 do começo ao fim
await page.locator(".mission-row", { hasText: "Primeiro dia na Iron Systems" }).click();
await dispensaVideo(page);
await page.waitForTimeout(600);
await shot("1-missao");
await semVazamento("missão");
check("missão abre mostrando o título", await noViewport(page.locator(".mission-title")));
await input.scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
await shot("2-terminal");
check("linha de comando alcançável", await noViewport(input));
const alturas = await page.evaluate(() => {
  const q = (s) => document.querySelector(s)?.getBoundingClientRect();
  const v = (s) => {
    const r = q(s);
    return r ? `${Math.round(r.width)}x${Math.round(r.height)}` : "—";
  };
  return { painel: v(".panel"), centro: v(".center-col"), terminal: v(".terminal"), direita: v(".panel-right"), pagina: document.documentElement.scrollHeight, tela: innerHeight };
});
results.push("INFO  medidas: " + JSON.stringify(alturas));
for (const c of ["git init", 'echo "# Portal RPA" > README.md', "git status", "git add README.md"]) await type(c);
await shot("3-comandos");
await semVazamento("terminal com saída");
await type('git commit -m "primeiro commit"');
await page.waitForTimeout(1000);
await shot("4-concluida");
const fim = page.getByText("Voltar à trilha");
check("tela de conclusão aparece", await fim.isVisible());
if (await fim.isVisible()) {
  await fim.scrollIntoViewIfNeeded();
  check("botão da conclusão alcançável", await noViewport(fim));
}
await semVazamento("conclusão");
await fim.click();
await page.waitForTimeout(500);

// conflito no Playground: editor e arquivos
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Playground/.test(b.textContent) || b.title === "Playground")?.click());
await page.waitForTimeout(500);
for (const c of ["git switch feature/relatorio", 'echo "<?php echo 1;" > index.php', "git add .", 'git commit -m "muda index"', "git switch main", "git merge feature/relatorio"]) await type(c);
await shot("5-conflito");
await type("edit index.php");
await page.waitForTimeout(500);
await shot("6-editor");
await semVazamento("editor");
const ambos = page.getByText("Manter ambos").first();
check("editor mostra a resolução", await ambos.isVisible());
await ambos.click({ timeout: 5000 });
await page.getByText("Salvar e fechar").click({ timeout: 5000 });
await page.waitForTimeout(300);
await type("git add index.php");
await type('git commit -m "merge resolvido"');
const t = await page.locator(".terminal-out").innerText();
check("conflito resolvido pelo editor", /merge resolvido/.test(t) && !/erro:/.test(t));
await shot("7-resolvido");

check("sem erros na página", errors.length === 0, errors.join(" | "));
console.log(`== ${prefixo} (${await browser.version()})\n` + results.join("\n"));
await browser.close();
