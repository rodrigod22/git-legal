// Etapa 1B4 na tela: mensagens novas no Playground.
// Uso: node scripts/check-1b4-mensagens.mjs <pasta-de-saida> [url]  (padrão: http://127.0.0.1:5199/)
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
const resumo = (t) => t.split("\n").slice(1, 5).join(" | ");

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
// main: a.txt, x.txt = M. f: x.txt = F e f.txt a mais. O merge de f em main para em conflito em x.txt
for (const c of ["echo a > a.txt", "echo x > x.txt", "git add .", 'git commit -m "um"', "git switch -c f", "echo F > x.txt", "echo f > f.txt", "git add .", 'git commit -m "F"', "git switch main", "echo M > x.txt", "git add .", 'git commit -m "M"']) await type(c);

// N11: switch para a branch atual
await clear();
await type("git switch main");
let t = await term();
check("N11 switch para a branch atual responde Already on", /Already on 'main'/.test(t), resumo(t));
await type("git checkout main");
check("N11 checkout também", /Already on 'main'/.test(await term()));

// N6: diff durante conflito
await clear();
for (const c of ["git merge f", "git diff"]) await type(c);
t = await term();
check("N6 git diff mostra o diff combinado", /diff --cc x\.txt/.test(t) && /\+\+<<<<<<< HEAD/.test(t) && /\+ F/.test(t), resumo(t));
await page.screenshot({ path: path.join(outDir, "1b4-diff-conflito.png") });
await clear();
await type("git diff --staged");
t = await term();
check("N6 git diff --staged lista Unmerged path", /\* Unmerged path x\.txt/.test(t), resumo(t));

// N5: reset sem arquivo durante o conflito
await clear();
await type("git reset --soft");
t = await term();
check("N5 reset --soft é recusado no conflito", /reset --soft/.test(t) && /merge/.test(t), resumo(t));
await clear();
for (const c of ["git reset", "git status"]) await type(c);
t = await term();
check("N5 reset encerra o merge e avisa dos marcadores", /merge encerrado pelo reset/.test(t) && /marcadores/.test(t) && /Changes not staged/.test(t) && !/Unmerged/.test(t) && !/em andamento/.test(t), resumo(t));
await page.screenshot({ path: path.join(outDir, "1b4-reset-conflito.png") });
await type("git restore x.txt");
await clear();
await type("git status");
t = await term();
check("N5 depois do restore, só f.txt (trazido pelo merge) fica como não rastreado", /Untracked files/.test(t) && /f\.txt/.test(t) && !/Changes not staged/.test(t), resumo(t));
await type("rm f.txt");

// N8: cherry-pick sem efeito
await clear();
for (const c of ["git switch -c g", "echo igual > i.txt", "git add .", 'git commit -m "igual-g"', "git switch main", "echo igual > i.txt", "git add .", 'git commit -m "igual-main"', "git cherry-pick g"]) await type(c);
t = await term();
check("N8 cherry-pick vazio para com erro e aponta o --abort", /ficou vazio/.test(t) && /cherry-pick --abort/.test(t), resumo(t));
await page.screenshot({ path: path.join(outDir, "1b4-cherry-pick-vazio.png") });
await clear();
await type("git status");
t = await term();
check("N8 status mostra cherry-pick em andamento sem conflito", /cherry-pick em andamento/.test(t) && !/Unmerged/.test(t) && /nothing to commit/.test(t), resumo(t));
await clear();
await type('git commit -m "x"');
t = await term();
check("N8 commit durante o cherry-pick vazio é recusado", /vazio/.test(t), resumo(t));
await clear();
for (const c of ["git cherry-pick --abort", "git status"]) await type(c);
t = await term();
check("N8 --abort encerra e fica limpo", /Cherry-pick abortado/.test(t) && /working tree clean/.test(t), resumo(t));
// revert sem efeito: F2 e volta
await clear();
for (const c of ["echo F2 > x.txt", "git add .", 'git commit -m "F2"', "echo M > x.txt", "git add .", 'git commit -m "volta"', "git revert HEAD~1"]) await type(c);
t = await term();
check("N8 revert sem efeito para com erro", /nada para reverter/.test(t), resumo(t));
await clear();
await type("git status");
check("N8 revert sem efeito não fica em andamento", /working tree clean/.test(await term()) && !/em andamento/.test(await term()));

// N9: cherry-pick e revert de commit de merge
await clear();
for (const c of ["git merge g", "git revert HEAD"]) await type(c);
t = await term();
check("N9 revert de merge recusa e explica o -m", /commit de merge/.test(t) && /-m/.test(t), resumo(t));
await page.screenshot({ path: path.join(outDir, "1b4-revert-merge.png") });
await clear();
for (const c of ["git switch f", "git cherry-pick main"]) await type(c);
t = await term();
check("N9 cherry-pick de merge recusa e explica o -m", /commit de merge/.test(t) && /-m/.test(t), resumo(t));
await type("git switch main");

// N10: switch para branch que só existe no remoto (o Playground tem origin)
await clear();
for (const c of ["git branch nova", "git push origin nova", "git branch -d nova", "git switch nova"]) await type(c);
t = await term();
check("N10 switch cria a branch local rastreando origin/nova", /criada para acompanhar 'origin\/nova'/.test(t) && /Trocado para a nova branch 'nova'/.test(t), resumo(t));
await page.screenshot({ path: path.join(outDir, "1b4-switch-remota.png") });
await clear();
await type("git status");
t = await term();
check("N10 status mostra a branch em dia com origin/nova", /On branch nova/.test(t) && /up to date with 'origin\/nova'/.test(t), resumo(t));
await type("git switch main");

check("sem erros na página", errors.length === 0, errors.join(" | "));
console.log(results.join("\n"));
await browser.close();
