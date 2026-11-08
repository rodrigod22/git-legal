// Etapa 1B3 na tela: mensagens novas no Playground.
// Uso: node scripts/check-1b3-mensagens.mjs <pasta-de-saida> [url]  (padrão: http://127.0.0.1:5199/)
import path from "node:path";
import { chromium } from "playwright-core";

const outDir = process.argv[2];
const url = process.argv[3] ?? "http://127.0.0.1:5199/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
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
const resumo = (t) => t.split("\n").slice(1, 4).join(" | ");

await page.goto(url);
await page.waitForTimeout(800);
await page.fill("input[aria-label='Seu nome']", "Teste");
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
await page.click("text=Playground");
await page.waitForTimeout(400);

await type("git status");
const inicio = await term();
if (/não é um repositório/.test(inicio)) await type("git init");
// main: a.txt, x.txt. f: x.txt = F e f.txt a mais
for (const c of ["echo a > a.txt", "echo x > x.txt", "git add .", 'git commit -m "um"', "git switch -c f", "echo F > x.txt", "echo f > f.txt", "git add .", 'git commit -m "F"', "git switch main"]) await type(c);

// N1: checkout -f mantém o não rastreado
await clear();
for (const c of ["echo u > u.txt", "git checkout -f f", "ls"]) await type(c);
let t = await term();
check("N1 checkout -f mantém u.txt", /Trocado para a branch 'f'/.test(t) && /u\.txt/.test(t), resumo(t));
await type("git switch main");

// N2: não rastreado que colide
await clear();
for (const c of ["echo outro > f.txt", "git switch f"]) await type(c);
t = await term();
check("N2 switch recusa não rastreado que colide", /não rastreados seriam sobrescritos por checkout/.test(t) && /f\.txt/.test(t), resumo(t));
await page.screenshot({ path: path.join(outDir, "1b3-switch-colisao.png") });
await type("cat f.txt");
check("N2 arquivo intacto", /outro/.test(await term()));
// N2: novo em staging que colide
await clear();
for (const c of ["git add f.txt", "git switch f"]) await type(c);
t = await term();
check("N2 switch recusa novo em staging que colide", /alterações locais/.test(t) && /f\.txt/.test(t), resumo(t));
await type("git status");
check("N2 continua em main com f.txt em staging", /On branch main/.test(await term()));
for (const c of ["git reset -- f.txt", "rm f.txt", "rm u.txt"]) await type(c);

// N15: arquivo apagado sem add, que o destino muda
await clear();
for (const c of ["rm x.txt", "git switch f", "cat x.txt"]) await type(c);
t = await term();
check("N15 switch aceita apagado sem add e traz a versão do destino", /Trocado para a branch 'f'/.test(t) && /\nF/.test("\n" + t.split("\n").pop()), resumo(t));
await type("git switch main");

// N3: rebase --continue com edição sem add
await clear();
for (const c of ["echo M > x.txt", "git add .", 'git commit -m "M"', "git switch f", "git rebase main", "echo FM > x.txt", "git add x.txt", "echo sujo >> a.txt", "git rebase --continue"]) await type(c);
t = await term();
check("N3 rebase --continue recusa edição sem add", /alterações sem 'git add'/.test(t) && /a\.txt/.test(t), resumo(t));
await page.screenshot({ path: path.join(outDir, "1b3-rebase-continue.png") });
await clear();
for (const c of ["git add a.txt", "git rebase --continue"]) await type(c);
t = await term();
check("N3 depois do add, conclui", /Successfully rebased/.test(t), resumo(t));

// N4: merge --abort com arquivo adicionado e editado depois
await clear();
// main e f divergem em x.txt (M2 e FM): o merge para em conflito
for (const c of ["git switch main", "echo M2 > x.txt", "git add .", 'git commit -m "M2"', "git merge f", "echo R > x.txt", "git add x.txt", "echo R2 > x.txt", "git merge --abort"]) await type(c);
t = await term();
check("N4 merge --abort recusa", /depois do 'git add'/.test(t) && /x\.txt/.test(t) && /merge --abort não é possível/.test(t), resumo(t));
await type("cat x.txt");
check("N4 edição preservada", /R2/.test(await term()));
await clear();
for (const c of ["git add x.txt", "git merge --abort", "git status"]) await type(c);
t = await term();
check("N4 depois do add, aborta e fica limpo", /Merge abortado/.test(t) && /working tree clean/.test(t), resumo(t));

// N7: pull --rebase com commit que a colega já enviou não cria commit vazio
await clear();
for (const c of ["git switch -c g", "echo igual > i.txt", "git add .", 'git commit -m "igual-g"', "git switch main", "echo igual > i.txt", "git add .", 'git commit -m "igual-main"', "git switch g", "git rebase main"]) await type(c);
t = await term();
check("N7 rebase avisa que pulou o commit", /foi pulado/.test(t) && /igual-g/.test(t) && /Successfully rebased/.test(t), resumo(t));
await page.screenshot({ path: path.join(outDir, "1b3-rebase-pulado.png") });
await clear();
await type("git log --oneline");
t = await term();
check("N7 histórico sem o commit vazio", !/igual-g/.test(t) && /igual-main/.test(t));

check("sem erros na página", errors.length === 0, errors.join(" | "));
console.log(results.join("\n"));
await browser.close();
