// Item 5 da Etapa 1F: com prefers-reduced-motion: reduce, o confete não roda e o grafo, a tela inicial
// e os botões trocam de estado sem animar. Roda cada verificação nos dois modos para provar que a detecção funciona.
// Uso: node scripts/check-1f-movimento.mjs <pasta-de-saida> [url]  (padrão: http://127.0.0.1:5199/)
import { chromium } from "playwright-core";
import path from "node:path";

const [outDir, url = "http://127.0.0.1:5199/"] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
const check = (name, ok, detail = "") => results.push(`${ok ? "OK   " : "FALHA"} ${name}${detail ? " — " + detail : ""}`);

async function medir(reduce) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.emulateMedia({ reducedMotion: reduce ? "reduce" : "no-preference" });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const m = { modo: reduce ? "reduzido" : "normal" };

  // tela inicial: as linhas da demonstração devem estar todas visíveis logo após a carga
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(250);
  m.demoOpacas = await page.evaluate(() => [...document.querySelectorAll(".terminal-preview > div")].slice(1).map((d) => getComputedStyle(d).opacity).filter((o) => o === "1").length);
  m.demoTotal = await page.evaluate(() => document.querySelectorAll(".terminal-preview > div").length - 1);
  m.matchMedia = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  m.transicaoBtn = await page.evaluate(() => getComputedStyle(document.querySelector(".btn")).transitionDuration);
  await page.waitForTimeout(3500);

  await page.fill("input[aria-label='Seu nome']", "Movimento");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(600);
  await page.locator(".mission-row:not([disabled])").first().click();
  await page.waitForTimeout(800);
  const input = page.locator("input[aria-label='Linha de comando']");
  const type = async (cmd, espera = 180) => {
    await input.fill(cmd);
    await input.press("Enter");
    await page.waitForTimeout(espera);
  };
  for (const c of ["git init", 'echo "# Portal RPA" > README.md', "git status", "git add README.md"]) await type(c);

  // grafo: logo depois do commit, o nó novo deve estar em escala 1 (sem animação de entrada)
  await input.fill('git commit -m "primeiro commit"');
  await input.press("Enter");
  await page.waitForTimeout(60);
  m.grafo = await page.evaluate(() => {
    const g = document.querySelector(".graph-wrap svg > g, .graph-wrap svg g");
    const gs = [...document.querySelectorAll(".graph-wrap svg > g")];
    return gs.map((e) => ({ transform: e.style.transform || e.getAttribute("transform") || "", opacity: e.style.opacity || "" }));
  });
  m.grafoAnimando = m.grafo.some((g) => /scale\((0\.\d+)/.test(g.transform) || (g.opacity !== "" && g.opacity !== "1"));

  // confete: a tela de conclusão abre; com movimento reduzido o canvas fica em branco
  await page.waitForTimeout(500);
  m.canvasPintado = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return null;
    const ctx = c.getContext("2d");
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) n++;
    return n;
  });
  await page.screenshot({ path: path.join(outDir, `movimento-${m.modo}-conclusao.png`) });
  m.errors = errors;
  await page.close();
  return m;
}

const normal = await medir(false);
const reduzido = await medir(true);
console.log("INFO  normal:  ", JSON.stringify({ ...normal, grafo: undefined }));
console.log("INFO  reduzido:", JSON.stringify({ ...reduzido, grafo: undefined }));

check("emulação de reduzir movimento chega à página", reduzido.matchMedia === true && normal.matchMedia === false);
check("normal: demonstração da tela inicial entra aos poucos", normal.demoOpacas < normal.demoTotal, `${normal.demoOpacas}/${normal.demoTotal} opacas aos 250 ms`);
check("reduzido: demonstração da tela inicial aparece de uma vez", reduzido.demoOpacas === reduzido.demoTotal, `${reduzido.demoOpacas}/${reduzido.demoTotal} opacas aos 250 ms`);
check("reduzido: transições do CSS desligadas", reduzido.transicaoBtn.split(",").every((t) => parseFloat(t) < 0.001), reduzido.transicaoBtn);
check("normal: nó do grafo entra animado", normal.grafoAnimando === true);
check("reduzido: nó do grafo aparece sem animação", reduzido.grafoAnimando === false, JSON.stringify(reduzido.grafo.slice(0, 2)));
check("normal: confete desenha no canvas", normal.canvasPintado > 0, `${normal.canvasPintado} amostras pintadas`);
check("reduzido: confete não desenha", reduzido.canvasPintado === 0, `${reduzido.canvasPintado} amostras pintadas`);
check("sem erros na página", normal.errors.length + reduzido.errors.length === 0, [...normal.errors, ...reduzido.errors].join(" | "));
console.log(results.join("\n"));
await browser.close();
process.exitCode = results.some((r) => r.startsWith("FALHA")) ? 1 : 0;
