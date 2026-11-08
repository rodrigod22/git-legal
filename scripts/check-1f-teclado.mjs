// Item 2 da Etapa 1F: conclui a primeira missão e resolve um conflito usando só o teclado
// (Tab, Shift+Tab, Enter, Espaço e setas), conferindo foco visível e ordem de foco.
// Uso: node scripts/check-1f-teclado.mjs <pasta-de-saida> [url]  (padrão: http://127.0.0.1:5199/)
import { chromium } from "playwright-core";
import { entraNoSite, argsDoChrome } from "./lib-missoes.mjs";
import path from "node:path";

const [outDir, url = "http://127.0.0.1:5199/"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: argsDoChrome() });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !/kaspersky|ERR_/.test(m.text() + (m.location()?.url ?? ""))) errors.push("console: " + m.text());
});

const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "OK   " : "FALHA"} ${name}${detail ? " — " + detail : ""}`);
const shot = (n) => page.screenshot({ path: path.join(outDir, `teclado-${n}.png`) });

/** Descreve o elemento focado e diz se o foco está visível (outline ou sombra) e dentro da tela. */
const focado = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return { desc: "body", visivel: false, naTela: false };
    const cs = getComputedStyle(el);
    const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
    const sombra = cs.boxShadow !== "none";
    const r = el.getBoundingClientRect();
    const naTela = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    const nome = el.getAttribute("aria-label") || (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    return { desc: `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}[${nome}]`, visivel: outline || sombra, naTela, x: Math.round(r.left), y: Math.round(r.top) };
  });

const semIndicador = [];
const paradas = [];
/** Tab até que o elemento focado satisfaça o predicado; registra cada parada. */
async function tabAte(pred, { shift = false, max = 60 } = {}) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press(shift ? "Shift+Tab" : "Tab");
    const f = await focado();
    paradas.push(f.desc);
    if (f.desc !== "body" && !f.visivel) semIndicador.push(f.desc);
    if (pred(f)) return f;
  }
  return null;
}
const re = (rx) => (f) => rx.test(f.desc);
const limpar = async () => {
  await page.keyboard.press("End");
  await page.keyboard.press("Shift+Home");
  await page.keyboard.press("Backspace");
};
const digitar = async (cmd) => {
  await page.keyboard.type(cmd);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);
};

// Início: Tab até o campo do nome, digita e Enter
await entraNoSite(page, url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(800);
const nome = await tabAte(re(/input.*Seu nome/));
check("início: campo do nome alcançado pelo Tab", !!nome, paradas.join(" > "));
await page.keyboard.type("Teclado");
await page.keyboard.press("Enter");
await page.waitForTimeout(600);
check("início: Enter no nome abre a trilha", (await page.locator(".map-head").count()) === 1);

// Trilha: Tab até a primeira missão e Enter
paradas.length = 0;
const missao = await tabAte(re(/button\.mission-row\[.*Primeiro dia/));
check("trilha: primeira missão alcançada pelo Tab", !!missao, paradas.join(" > "));
await shot("1-trilha-foco");
await page.keyboard.press("Enter");
await page.waitForTimeout(700);
check("trilha: Enter abre a missão", (await page.locator(".mission-title").count()) === 1);

// Vídeo de abertura (Fase 2): abre numa janela com o foco no botão de pular; Enter fecha e devolve a missão
check("vídeo: janela de abertura do módulo aparece", (await page.locator(".intro[role=dialog]").count()) === 1);
const focoIntro = await page.evaluate(() => document.activeElement?.textContent ?? "");
check("vídeo: foco inicial no botão de pular", /Pular vídeo/.test(focoIntro), focoIntro);
await shot("1b-video-foco");
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
check("vídeo: Enter fecha a janela", (await page.locator(".intro[role=dialog]").count()) === 0);

// Missão: ordem de foco do painel até o terminal
paradas.length = 0;
const linha = await tabAte(re(/input.*Linha de comando/));
check("missão: linha de comando alcançada pelo Tab", !!linha);
results.push("INFO  ordem de foco na missão: " + paradas.join(" > "));
// ordem visual: painel esquerdo (x < 360) antes do centro, e nada do painel direito antes do terminal
const xs = [];
for (const d of paradas) xs.push(d);
const idxCentro = paradas.findIndex((d) => /graph|terminal|Histórico/.test(d));
const painelDepois = paradas.slice(idxCentro).some((d) => /Trilha\]|Pedir dica|Reiniciar/.test(d));
check("missão: painel esquerdo inteiro vem antes do centro", idxCentro > 0 && !painelDepois);
await shot("2-missao-foco-terminal");

// Tab sem sugestão sai do terminal; Shift+Tab volta
await page.keyboard.press("Tab");
const depois = await focado();
check("terminal: Tab sem sugestão move o foco (não prende)", !/Linha de comando/.test(depois.desc), depois.desc);
await page.keyboard.press("Shift+Tab");
check("terminal: Shift+Tab volta à linha de comando", /Linha de comando/.test((await focado()).desc));
// Tab com sugestão completa
await page.keyboard.type("git sta");
await page.keyboard.press("Tab");
const completado = await page.inputValue("input[aria-label='Linha de comando']");
check("terminal: Tab com sugestão completa o comando", completado.startsWith("git sta") && completado.length > 7, completado);
await limpar();

// Conclui a missão 1 só digitando
for (const c of ["git init", 'echo "# Portal RPA" > README.md', "git status", "git add README.md"]) await digitar(c);
// hash do grafo pelo teclado: ainda sem commit; testa depois no Playground
await digitar('git commit -m "primeiro commit"');
await page.waitForTimeout(1000);
const dlg = page.locator("[role='dialog']");
check("conclusão: janela com role=dialog aparece", (await dlg.count()) === 1);
const fc = await focado();
check("conclusão: foco entra na janela", /Voltar à trilha|Próxima/.test(fc.desc), fc.desc);
await shot("3-conclusao-foco");
// Shift+Tab a partir do primeiro botão circula para o último; desde a Etapa 1G o toast de conquista entra na roda, no fim
await page.keyboard.press("Shift+Tab");
const ult = await focado();
check("conclusão: Shift+Tab fica dentro da janela (circula)", /Próxima|Voltar|Fechar aviso/.test(ult.desc), ult.desc);
await tabAte(re(/Voltar à trilha/));
await page.keyboard.press("Enter");
await page.waitForTimeout(600);
check("conclusão: Enter em 'Voltar à trilha' fecha e volta", (await page.locator(".map-head").count()) === 1);

// Playground pelo teclado (barra do topo)
paradas.length = 0;
const pg = await tabAte(re(/button.*Playground/));
check("topo: botão Playground alcançado", !!pg, paradas.join(" > "));
await page.keyboard.press("Enter");
await page.waitForTimeout(700);
await tabAte(re(/input.*Linha de comando/));
for (const c of ["git switch feature/relatorio", 'echo "<?php echo 1;" > index.php', "git add .", 'git commit -m "muda index"', "git switch main", "git merge feature/relatorio"]) await digitar(c);

// hash do grafo: Shift+Tab até um hash, Enter, e o hash entra na linha de comando
paradas.length = 0;
const sha = await tabAte(re(/^text\[Usar o hash/), { shift: true, max: 30 });
check("grafo: hash recebe foco pelo teclado", !!sha, paradas.join(" > "));
await shot("4-grafo-hash-foco");
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
const valor = await page.inputValue("input[aria-label='Linha de comando']");
check("grafo: Enter no hash coloca 'git show <hash>' na linha de comando e foca nela", /^git show [0-9a-f]{7}$/.test(valor) && /Linha de comando/.test((await focado()).desc), valor);
await limpar();

// cola da missão: botões focáveis
paradas.length = 0;
const cola = await tabAte(re(/button.*Cola de comandos/), { shift: true, max: 40 });
check("painel: botão 'Cola de comandos' alcançado", !!cola);
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
await page.keyboard.press("Tab");
const itemCola = await focado();
check("painel: comando da cola é um botão focável", /button.*git|button.*edit|button.*echo/.test(itemCola.desc), itemCola.desc);
await page.keyboard.press("Enter"); // copia (pode falhar sem permissão de clipboard, não deve dar erro de página)

// editor de conflito pelo teclado
await tabAte(re(/input.*Linha de comando/));
await digitar("edit index.php");
await page.waitForTimeout(500);
check("editor: abre como dialog", (await page.locator("[role='dialog'][aria-label^='Editor']").count()) === 1);
check("editor: foco vai para o texto do arquivo", /textarea/.test((await focado()).desc), (await focado()).desc);
await shot("5-editor-foco");
const ambos = await tabAte(re(/Manter ambos/), { max: 10 });
check("editor: 'Manter ambos' alcançado pelo Tab", !!ambos);
await page.keyboard.press("Space");
await page.waitForTimeout(150);
const salvar = await tabAte(re(/Salvar e fechar/), { max: 10 });
check("editor: 'Salvar e fechar' alcançado pelo Tab", !!salvar);
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
check("editor: fecha e o foco volta ao terminal", (await page.locator("[role='dialog']").count()) === 0 && /Linha de comando/.test((await focado()).desc), (await focado()).desc);
await digitar("git add index.php");
await digitar('git commit -m "merge resolvido"');
const t = await page.locator(".terminal-out").innerText();
check("conflito resolvido só pelo teclado", /merge resolvido/.test(t) && !/erro:/.test(t));
// Esc fecha o editor
await digitar("edit index.php");
await page.waitForTimeout(400);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check("editor: Esc fecha", (await page.locator("[role='dialog']").count()) === 0);

check("todo foco teve indicador visível", semIndicador.length === 0, [...new Set(semIndicador)].join(" | "));
check("sem erros na página", errors.length === 0, errors.join(" | "));
console.log(results.join("\n"));
await browser.close();
process.exitCode = results.some((r) => r.startsWith("FALHA")) ? 1 : 0;
