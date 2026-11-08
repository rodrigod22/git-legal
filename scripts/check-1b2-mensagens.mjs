// Etapa 1B2 na tela: mensagens novas no Playground.
// Uso: node scripts/check-1b2-mensagens.mjs <pasta-de-saida> [url]  (padrão: http://127.0.0.1:5199/)
import path from "node:path";
import { chromium } from "playwright-core";
import { entraNoSite, argsDoChrome } from "./lib-missoes.mjs";

const outDir = process.argv[2];
const url = process.argv[3] ?? "http://127.0.0.1:5199/";
const browser = await chromium.launch({ channel: "chrome", headless: true, args: argsDoChrome() });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/fonts\.g|ERR_/.test(m.text())) errors.push("console: " + m.text());
});
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "OK   " : "FALHA"} ${name}${detail ? " — " + detail : ""}`);
const type = async (cmd) => {
  await page.fill("input[aria-label='Linha de comando']", cmd);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(120);
};
const term = () => page.locator(".terminal-out").innerText();
const clear = () => type("clear");

await entraNoSite(page, url);
await page.waitForTimeout(800);
await page.fill("input[aria-label='Seu nome']", "Teste");
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
await page.click("text=Playground");
await page.waitForTimeout(400);

await type("git status");
const inicio = await term();
if (/não é um repositório/.test(inicio)) await type("git init");
for (const c of ["echo a > a.txt", "git add .", 'git commit -m "um"', "git switch -c f", "echo U > u.txt", "git add .", 'git commit -m "cria u"', "rm u.txt", "git add .", 'git commit -m "tira u"', "git switch main", "echo m > m.txt", "git add .", 'git commit -m "m"', "git switch f", "echo meu > u.txt"]) await type(c);
await clear();

await type("git rebase main");
let t = await term();
check("colisão no meio: nomeia o arquivo", /u\.txt/.test(t) && /não rastreados seriam sobrescritos/.test(t), t.split("\n").slice(1, 3).join(" | "));
check("colisão no meio: orienta o --continue", /git rebase --continue/.test(t));
await page.screenshot({ path: path.join(outDir, "1b2-rebase-parado.png") });
const prompt = await page.locator(".terminal").innerText();
check("prompt mostra REBASE", /REBASE/.test(prompt));
await type("cat u.txt");
check("arquivo intacto", /meu/.test(await term()));
await type("git status");
check("status lista como não rastreado", /Untracked files/.test(await term()));
await clear();
await type("rm u.txt");
await type("git rebase --continue");
t = await term();
check("--continue conclui", /Successfully rebased/.test(t), t.split("\n").pop());

await clear();
await type("git switch HEAD~1");
t = await term();
check("switch recusado com dica", /git switch --detach HEAD~1/.test(t), t.split("\n").slice(1).join(" | "));
await type("git switch --detach HEAD~1");
check("--detach funciona", /detached HEAD/.test(await term()));
await type("git switch f");

await clear();
for (const c of ["echo y >> a.txt", "echo y >> m.txt", "git add ."]) await type(c);
await clear();
await type("git reset --hard HEAD a.txt");
t = await term();
check("reset --hard com arquivo é fatal", /fatal: não é possível usar --hard com arquivos/.test(t), t.split("\n").slice(1).join(" | "));
await type("git reset HEAD -- a.txt");
await type("git status");
t = await term();
check("reset tira só o arquivo", /Changes to be committed:[\s\S]*m\.txt[\s\S]*Changes not staged[\s\S]*a\.txt/.test(t) && !/não suporta/.test(t));

await clear();
await type("git diff -- a.txt");
t = await term();
check("diff com --, sem aviso", /diff --git a\/a\.txt/.test(t) && !/não suporta/.test(t));
await clear();
await type("git diff nada.txt");
t = await term();
check("diff de nome desconhecido", /nada\.txt/.test(t) && /git diff -- nada\.txt/.test(t), t.split("\n").slice(1).join(" | "));
await page.screenshot({ path: path.join(outDir, "1b2-diff.png") });
await clear();
await type("git help");
t = await term();
check("ajuda atualizada", /diff \[--staged\] \[arquivo\]/.test(t) && /reset \[--soft --hard \| arquivo\]/.test(t));

// painel de arquivos durante um conflito: o arquivo não pode aparecer como novo
await clear();
for (const c of ["git reset --hard HEAD", "git switch -c g", 'echo G > a.txt', "git add .", 'git commit -m "g"', "git switch main", "echo M > a.txt", "git add .", 'git commit -m "M"', "git merge g", "git status"]) await type(c);
t = await term();
check("status em conflito sem Untracked", /Unmerged paths/.test(t) && !/Untracked files/.test(t));
await page.screenshot({ path: path.join(outDir, "1b2-conflito.png") });

check("sem erros na página", errors.length === 0, errors.join(" | "));
console.log(results.join("\n"));
await browser.close();
