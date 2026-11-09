// Lista os ids das missões sem depender do servidor de desenvolvimento.
// No `npm run dev`, `import("/src/content/index.ts")` funciona dentro da página; no build
// servido de `dist/` não existe `/src`, então os ids são lidos do código-fonte dos módulos.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pasta = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src", "content", "modules");

export function idsDasMissoes() {
  const ids = [];
  for (const arquivo of fs.readdirSync(pasta).filter((f) => f.endsWith(".ts"))) {
    const texto = fs.readFileSync(path.join(pasta, arquivo), "utf8");
    // Missões ficam com seis espaços de recuo dentro de `missions: [ { id: "...", ... } ]`.
    for (const m of texto.matchAll(/^ {6}id: "([^"]+)",\s*$/gm)) ids.push(m[1]);
  }
  if (ids.length !== 23) throw new Error(`esperava 23 missões, encontrei ${ids.length}: ${ids.join(", ")}`);
  return ids;
}

/**
 * Argumentos extras do Chrome, de CHROME_ARGS. Serve, por exemplo, para resolver um host sem DNS:
 * CHROME_ARGS="--host-resolver-rules=MAP host ip".
 */
export function argsDoChrome() {
  return process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(/ +(?=--)/) : [];
}

/** A página está na tela de login do site publicado (Etapa 1H)? */
export function naTelaDeLogin(page) {
  return new URL(page.url()).pathname.startsWith("/login/");
}

/**
 * Abre o Dojo em `url`. No site publicado, quem não tem sessão vai para a tela de login (/login/); aí a
 * função preenche "Usuário" e "Senha" com DOJO_USUARIO e DOJO_SENHA, entra e volta para `url`. O cookie da
 * sessão fica no contexto do navegador, então as outras páginas do mesmo contexto já entram logadas; num
 * contexto novo, a função reaproveita o cookie da primeira entrada, para não gastar o limite de tentativas
 * do /_auth/login (10 por minuto por IP).
 * No Vite local e no build servido por um servidor simples não há login, e a função é só um page.goto.
 */
let cookieDaSessao = null;
export async function entraNoSite(page, url) {
  if (cookieDaSessao) await page.context().addCookies([cookieDaSessao]);
  await page.goto(url);
  if (!naTelaDeLogin(page)) return;
  if (!process.env.DOJO_USUARIO) throw new Error(`${url} pediu login: defina DOJO_USUARIO e DOJO_SENHA`);
  await page.getByLabel("Usuário").fill(process.env.DOJO_USUARIO);
  await page.getByLabel("Senha").fill(process.env.DOJO_SENHA ?? "");
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login/") || u.search.includes("erro=1")), page.getByRole("button", { name: "Entrar" }).click()]);
  if (naTelaDeLogin(page)) throw new Error(`login recusado para "${process.env.DOJO_USUARIO}" em ${page.url()}`);
  cookieDaSessao = (await page.context().cookies()).find((c) => c.name === "gitdojo_sessao") ?? null;
  if (page.url() !== new URL(url).href) await page.goto(url);
}

/**
 * Abre a tela de login com o aviso de erro (/login/?erro=1#erro), para auditar acessibilidade e reflow.
 * No site publicado é a página de verdade; no Vite local, que não tem login, a função serve a cópia de
 * deploy/login/ no mesmo endereço por interceptação. Devolve "site" ou "cópia local".
 */
const pastaDoLogin = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "deploy", "login");
export async function abreTelaDeLogin(page, url) {
  const alvo = new URL("/login/?erro=1#erro", url).href;
  const ehLogin = () => page.locator("form[action='/_auth/login']").count().then((n) => n === 1);
  await page.goto(alvo);
  let origem = "site";
  if (!(await ehLogin())) {
    await page.route((u) => u.host === new URL(url).host && u.pathname.startsWith("/login/"), (route) => {
      const arquivo = new URL(route.request().url()).pathname.endsWith(".js") ? "login.js" : "index.html";
      return route.fulfill({
        contentType: arquivo === "login.js" ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8",
        body: fs.readFileSync(path.join(pastaDoLogin, arquivo), "utf8"),
      });
    });
    await page.goto("about:blank"); // mesmo endereço com âncora não recarregaria a página
    await page.goto(alvo);
    origem = "cópia local";
  }
  if (!(await ehLogin())) throw new Error(`tela de login não encontrada em ${alvo}`);
  await page.waitForTimeout(400); // o login.js escreve o aviso 100 ms depois da carga
  return origem;
}

/**
 * Desde a Fase 2, a primeira missão aberta em cada módulo mostra o vídeo de abertura numa janela.
 * Os roteiros que não testam o vídeo dispensam a janela pelo botão "Pular", se ela aparecer.
 */
export async function dispensaVideo(page) {
  const botao = page.getByRole("button", { name: /Pular vídeo|Começar a missão|^Fechar$/ }).last();
  try {
    await botao.waitFor({ state: "visible", timeout: 1500 });
    await botao.click();
    await page.waitForTimeout(300);
    return true;
  } catch {
    return false;
  }
}

/**
 * Grava no localStorage as 23 missões concluídas e recarrega a página, conferindo depois do reload.
 * O app aberto grava o próprio estado de tempos em tempos; se ele gravar entre o setItem e o reload (mais
 * provável no site publicado, onde o reload demora mais), o progresso some. Aí a função tenta de novo.
 */
export async function aplicaProgressoCompleto(page, xp = 2931) {
  const progresso = progressoCompleto(idsDasMissoes());
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    await page.evaluate(
      ([progress, pontos]) => {
        const salvo = JSON.parse(localStorage.getItem("git-dojo-v1"));
        salvo.state.progress = progress;
        salvo.state.xp = pontos;
        localStorage.setItem("git-dojo-v1", JSON.stringify(salvo));
      },
      [progresso, xp],
    );
    await page.reload();
    await page.waitForTimeout(900);
    const n = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("git-dojo-v1") ?? "{}").state?.progress ?? {}).length);
    if (n === Object.keys(progresso).length) return;
  }
  throw new Error("o progresso gravado no localStorage não sobreviveu ao reload em 3 tentativas");
}

export function progressoCompleto(ids) {
  return Object.fromEntries(ids.map((id) => [id, { completedAt: 1, stars: 3, xp: 1, hintsUsed: 0, errors: 0, commands: 1, seconds: 1 }]));
}
