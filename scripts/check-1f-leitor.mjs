// Item 6 da Etapa 1F: a região aria-live do terminal recebe só a saída do último comando.
// Não substitui um teste com leitor de tela real; confere a estrutura que o leitor vai ler.
// Uso: node scripts/check-1f-leitor.mjs [url]  (padrão: http://127.0.0.1:5199/)
import { chromium } from "playwright-core";
import { dispensaVideo, entraNoSite, argsDoChrome } from "./lib-missoes.mjs";

const [url = "http://127.0.0.1:5199/"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true, args: argsDoChrome() });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "OK   " : "FALHA"} ${name}${detail ? " — " + detail : ""}`);

await entraNoSite(page, url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(800);
await page.fill("input[aria-label='Seu nome']", "Leitor");
await page.keyboard.press("Enter");
await page.waitForTimeout(500);
await page.locator(".mission-row:not([disabled])").first().click();
await dispensaVideo(page);
await page.waitForTimeout(700);

const live = page.locator("[data-testid='saida-leitor']");
const texto = () => live.evaluate((e) => e.textContent.trim());
const input = page.locator("input[aria-label='Linha de comando']");
const type = async (cmd) => {
  await input.fill(cmd);
  await input.press("Enter");
  await page.waitForTimeout(200);
};

check("região aria-live=polite e aria-atomic existe", (await live.count()) === 1 && (await live.getAttribute("aria-live")) === "polite" && (await live.getAttribute("aria-atomic")) === "true");
check("região fica fora do histórico visível (.terminal-out)", (await page.locator(".terminal-out [data-testid='saida-leitor']").count()) === 0);
check("histórico visível não é live region", (await page.locator(".terminal-out").getAttribute("aria-live")) === null);
const inicial = await texto();
check("ao abrir a missão, anuncia a mensagem de sistema inicial", /^Missão: .*help/.test(inicial), inicial);

await type("git init");
const t1 = await texto();
check("após git init, anuncia só a saída desse comando", /Initialized|inicializado|Repositório/i.test(t1) && !/Missão:/.test(t1), t1);
await type("git status");
const t2 = await texto();
check("após git status, anuncia só a saída dele (sem a do git init)", /On branch/.test(t2) && !/Initialized|inicializado/i.test(t2), t2.split("\n")[0]);
check("marcação de cor não aparece no texto anunciado", !/<\/?[rgycmbd]>/.test(t2));
await type('echo "# Portal RPA" > README.md');
const t3 = await texto();
check("comando silencioso anuncia que executou sem saída", /sem saída/.test(t3), t3);
await type("git status");
const t4 = await texto();
check("saída repetida continua no DOM com nó novo (chave por comando)", /On branch/.test(t4));
const nosAntes = await live.evaluate((e) => e.firstElementChild);
await type("git status");
const trocou = await live.evaluate((e, antes) => e.firstElementChild !== antes, nosAntes);
check("cada comando troca o nó anunciado, mesmo com saída igual", trocou);
await type("clear");
check("após clear, a região fica vazia", (await texto()) === "", await texto());
const visivel = await live.evaluate((e) => {
  const r = e.getBoundingClientRect();
  return r.width <= 1 && r.height <= 1;
});
check("região invisível na tela (sr-only)", visivel);
check("sem erros na página", errors.length === 0, errors.join(" | "));
console.log(results.join("\n"));
await browser.close();
process.exitCode = results.some((r) => r.startsWith("FALHA")) ? 1 : 0;
