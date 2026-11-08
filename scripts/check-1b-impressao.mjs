// Item 15 da Etapa 1B: gera os PDFs da Cola e do certificado como o diálogo de impressão faria.
// Uso: node scripts/check-1b-impressao.mjs <pasta-de-saida> [chrome|msedge] [url]
import { chromium } from "playwright-core";
import path from "node:path";
import { idsDasMissoes, progressoCompleto, dispensaVideo } from "./lib-missoes.mjs";

const [outDir, channel = "chrome", url = "http://127.0.0.1:5199/"] = process.argv.slice(2);
const browser = await chromium.launch({ channel, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto(url);
// Os ids vêm do código-fonte, para o roteiro funcionar também contra o build de dist/.
await page.evaluate((progress) => {
  localStorage.setItem("git-dojo-v1", JSON.stringify({ state: { playerName: "Maria Aparecida dos Santos Oliveira", progress, xp: 2931, badges: ["a", "b", "c"], totalCommands: 99, sound: false }, version: 0 }));
}, progressoCompleto(idsDasMissoes()));
await page.reload();
await page.waitForTimeout(600);
await page.getByRole("button", { name: /Continuar|Começar/ }).click();
await dispensaVideo(page);
await page.waitForTimeout(500);

const paginas = async (arquivo) => {
  const fs = await import("node:fs");
  const txt = fs.readFileSync(arquivo).toString("latin1");
  return (txt.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
};
for (const fundo of [false, true]) {
  const sufixo = `${channel}-${fundo ? "com-fundo" : "padrao"}`;
  await page.getByRole("button", { name: "Cola" }).click();
  await page.waitForTimeout(400);
  const cola = path.join(outDir, `cola-${sufixo}.pdf`);
  await page.pdf({ path: cola, format: "A4", printBackground: fundo, preferCSSPageSize: true });
  await page.getByRole("button", { name: "Trilha" }).click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /Ver certificado/ }).click();
  await page.waitForTimeout(400);
  const cert = path.join(outDir, `certificado-${sufixo}.pdf`);
  await page.pdf({ path: cert, format: "A4", printBackground: fundo, preferCSSPageSize: true });
  const [pc, pt] = [await paginas(cola), await paginas(cert)];
  console.log(pc === 1 && pt === 1 ? "OK   " : "FALHA", sufixo, "cola:", pc, "pág. · certificado:", pt, "pág.");
  await page.getByRole("button", { name: "Trilha" }).first().click();
  await page.waitForTimeout(300);
}
await browser.close();
