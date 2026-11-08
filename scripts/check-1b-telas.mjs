// Valida na tela os itens 4, 5, 6, 7, 9 e 10 da Etapa 1B.
// Uso: node scripts/check-1b-telas.mjs <pasta-de-saida> [url]
import { chromium } from "playwright-core";
import path from "node:path";

const outDir = process.argv[2];
const url = process.argv[3] ?? "http://127.0.0.1:5199/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/fonts\.g/.test(m.text())) errors.push("console: " + m.text());
});

const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "OK  " : "FALHA"} ${name}${detail ? " — " + detail : ""}`);
const type = async (cmd) => {
  await page.fill("input[aria-label='Linha de comando']", cmd);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
};
const term = () => page.locator(".terminal-out").innerText();

await page.goto(url);
await page.waitForTimeout(1200);
const home = await page.locator(".home").innerText();
check("home com 'Treinamento oficial' (conteúdo validado na Etapa 1C)", /Treinamento oficial/i.test(home));
check("home sem 'terminal de verdade' e 'Terminal real'", !/terminal de verdade|terminal real/i.test(home));
check("home diz terminal simulado", /terminal simulado/i.test(home));
await page.screenshot({ path: path.join(outDir, "home.png") });

await page.fill("input[aria-label='Seu nome']", "Teste");
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
const map = await page.locator(".map-head").innerText();
check("trilha mostra 2931 XP", /0\/2931 XP/.test(map), map.split("\n").find((l) => /XP/.test(l)));

await page.click("text=Playground");
await page.waitForTimeout(400);
await type('git add . && git commit -m "x"');
await type("git status -s");
await type('git commit --amend -m "y"');
await type('git config --global user.name "Ana"');
await type("git log --oneline");
const hashes = (await term()).match(/\b[0-9a-f]{7}\b/g) ?? [];
await type(`git show ${hashes[hashes.length - 1]}`);
const t = await term();
check("aviso de && no terminal", /não entende '&&'/.test(t));
check("aviso de -s com saída padrão", /não suporta a opção '-s'/.test(t) && /On branch/.test(t));
check("aviso de --amend", /não suporta a opção '--amend'. Nada foi alterado/.test(t));
check("aviso de git config", /não tem efeito no Dojo/.test(t));
check("git show do primeiro commit com conteúdo", /--- \/dev\/null/.test(t) && /\+# Portal RPA/.test(t));
const counter = await page.locator(".panel .mono").last().innerText();
check("avisos não contam como erro", /0 erro/.test(counter), counter);
await page.screenshot({ path: path.join(outDir, "avisos.png") });

check("sem erros na página", errors.length === 0, errors.join(" | "));
console.log(results.join("\n"));
await browser.close();
