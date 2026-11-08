// Item 3 da Etapa 1G: toasts dispensáveis pelo teclado, relógio parado com foco ou mouse em cima, e contraste do placeholder do nome.
// Uso: node scripts/check-1g-toasts.mjs [url]  (padrão: http://127.0.0.1:5199/)
import { chromium } from "playwright-core";
import { dispensaVideo } from "./lib-missoes.mjs";

const url = process.argv[2] ?? "http://127.0.0.1:5199/";
const results = [];
const check = (nome, ok, detalhe = "") => results.push(`${ok ? "OK   " : "FALHA"} ${nome}${ok || !detalhe ? "" : " — " + detalhe}`);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(800);

// placeholder do campo do nome
const ph = await page.evaluate(() => getComputedStyle(document.querySelector("input[aria-label='Seu nome']"), "::placeholder").color);
check("placeholder do nome usa --muted-2 (rgb(123, 138, 163), 4,98:1 sobre --surface)", ph === "rgb(123, 138, 163)", ph);

await page.fill("input[aria-label='Seu nome']", "Teste Toast");
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
await page.locator(".mission-row:not([disabled])").first().click();
await dispensaVideo(page);
await page.waitForTimeout(500);
const input = page.locator("input[aria-label='Linha de comando']");
const type = async (cmd) => {
  await input.fill(cmd);
  await input.press("Enter");
  await page.waitForTimeout(300);
};
for (const c of ["git status", "git init", 'echo "# Portal RPA" > README.md', "git add README.md"]) await type(c);
await type('git commit -m "primeiro commit"');
await page.waitForTimeout(600);
const toasts = page.locator(".toast");
const n = await toasts.count();
check("o commit da missão 1 mostra toasts", n >= 1, `${n} toast(s)`);
const botoes = await page.locator(".toast button[aria-label^='Fechar aviso']").count();
check("cada toast tem botão de fechar com nome acessível", botoes === n && n > 0, `${botoes} botão(ões) para ${n} toast(s)`);

// relógio parado com o mouse em cima: o toast de XP some em 5 s; com o mouse em cima, continua depois de 6 s
const primeiro = toasts.first();
const titulo = await primeiro.locator("b").first().innerText();
await primeiro.hover();
await page.waitForTimeout(6000);
check(`com o mouse em cima, o toast "${titulo}" continua depois de 6 s`, (await toasts.count()) === n, `${await toasts.count()} de ${n}`);

// relógio parado com foco: o foco vai para o botão de fechar e o toast fica
await page.mouse.move(5, 5);
const fechar = primeiro.locator("button[aria-label^='Fechar aviso']");
await fechar.focus();
check("o botão de fechar recebe foco", await fechar.evaluate((b) => document.activeElement === b));
await page.waitForTimeout(6000);
check("com foco no botão, o toast continua depois de mais 6 s", (await toasts.count()) === n, `${await toasts.count()} de ${n}`);
const foco = await fechar.evaluate((b) => {
  const cs = getComputedStyle(b);
  return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 ? "contorno" : cs.boxShadow !== "none" ? "sombra" : "nenhum";
});
check("o foco no botão de fechar é visível", foco !== "nenhum", foco);

// Enter no botão fecha só aquele toast
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
check("Enter no botão fecha o toast", (await toasts.count()) === n - 1, `${await toasts.count()} de ${n}`);

// sem mouse nem foco, o relógio volta: o resto some sozinho em até 8 s
await page.waitForTimeout(8000);
check("sem foco nem mouse, os toasts somem sozinhos", (await toasts.count()) === 0, `${await toasts.count()} restante(s)`);

// alcance pelo teclado: a janela de conclusão prende o Tab, mas o toast entra na roda, então Shift+Tab a partir do primeiro botão chega nele
await page.getByText("Voltar à trilha").click();
await page.waitForTimeout(500);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(800);
await page.fill("input[aria-label='Seu nome']", "Teste Toast");
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
await page.locator(".mission-row:not([disabled])").first().click();
await dispensaVideo(page);
await page.waitForTimeout(500);
for (const c of ["git status", "git init", 'echo "# Portal RPA" > README.md', "git add README.md"]) await type(c);
await type('git commit -m "primeiro commit"');
await page.waitForTimeout(800);
check("a janela de conclusão abriu com o toast de conquista", (await page.locator("[role=dialog]").count()) === 1 && (await toasts.count()) >= 1, `${await toasts.count()} toast(s)`);
await page.keyboard.press("Shift+Tab");
const ativo = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.textContent?.trim().slice(0, 40) ?? "");
check("Shift+Tab a partir da janela de conclusão chega ao botão de fechar do toast", /^Fechar aviso/.test(await ativo()), await ativo());
await page.keyboard.press("Tab");
check("Tab a partir do toast volta para a janela", await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]")), await ativo());
await page.keyboard.press("Shift+Tab");
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
check("Enter no toast fecha o aviso e o foco segue na roda da janela", (await toasts.count()) === 0 && (await page.evaluate(() => !!document.activeElement?.closest("[role=dialog], .toasts, body"))), `${await toasts.count()} toast(s); foco: ${await ativo()}`);
await page.keyboard.press("Tab");
check("depois de fechar o toast, Tab continua dentro da janela", await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]")), await ativo());
await browser.close();
console.log(results.join("\n"));
process.exitCode = results.some((r) => r.startsWith("FALHA")) ? 1 : 0;
