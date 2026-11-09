# Roteiros de verificação

Roteiros que conferem o Dojo num navegador de verdade (Chrome, controlado pelo `playwright-core`) e a fidelidade do motor ao Git real. Eles complementam o `npm test`, que cobre o motor e o conteúdo em memória.

## Antes de rodar

1. `npm install` (traz `playwright-core` 1.65.0 e `axe-core` 4.14.0 como dependências de desenvolvimento; o Chrome precisa estar instalado na máquina, porque os roteiros usam `channel: "chrome"`).
2. Suba o servidor de desenvolvimento numa porta própria: `npx vite --port 5199 --strictPort --host 127.0.0.1`. Os roteiros assumem `http://127.0.0.1:5199/`; passe outro endereço como último argumento se precisar.
3. Escolha uma pasta de saída fora do repositório para as capturas e os relatórios (por exemplo, `%TEMP%\git-dojo-check`).

## Contra o site publicado

Todos os roteiros de tela aceitam o endereço como último argumento (`check-1f-leitor` e `check-1g-toasts` só recebem o endereço). No site publicado, a primeira página cai na tela de login; a função `entraNoSite(page, url)` de `lib-missoes.mjs` preenche "Usuário" e "Senha" com as variáveis `DOJO_USUARIO` e `DOJO_SENHA`, entra e reaproveita o cookie da sessão nos contextos seguintes do mesmo roteiro, para não gastar o limite de 10 tentativas de login por minuto. No Vite local e no build servido por um servidor simples não há login, e nada muda.

```powershell
$env:DOJO_USUARIO = "<login>"; $env:DOJO_SENHA = "<senha>"
npm run check:a11y -- "$env:TEMP\git-dojo-check" https://gitdojo.rpatecnologia.com.br/
npm run check:leitor -- https://gitdojo.rpatecnologia.com.br/
```

`CHROME_ARGS` passa argumentos ao Chrome em todos os roteiros, por exemplo `--host-resolver-rules=MAP host ip` para um host sem DNS. Os roteiros que injetam o `axe-core` (`check-1f-acessibilidade` e `check-2-video`) abrem o navegador com `bypassCSP`, porque a CSP do site publicado barraria o script injetado.

Todos os roteiros terminam com um resumo `OK`/`FALHA` e com "sem erros na página" quando o console do navegador ficou limpo.

## Roteiros de tela

| Roteiro | O que confere | Como rodar |
|---|---|---|
| `check-1b-telas.mjs` | Home (selo "Treinamento oficial", terminal simulado), trilha, avisos do terminal e `git show` | `npm run check:telas -- <pasta>` |
| `check-1b-fluxo.mjs` | Uma missão inteira em desktop ou celular, em Chrome ou Edge | `npm run check:fluxo -- <pasta> chrome desktop` |
| `check-1b-impressao.mjs` | PDFs da Cola e do certificado | `npm run check:impressao -- <pasta>` |
| `check-1b2-mensagens.mjs`, `check-1b3-mensagens.mjs`, `check-1b4-mensagens.mjs` | Mensagens do motor no Playground, uma rodada de correções por roteiro | `npm run check:mensagens` (grava em `tmp-check/`, que pode ser apagada) |
| `check-1d-offline.mjs` | Build servido de uma subpasta, com toda requisição externa bloqueada (o 404 de `_auth/me`, que só existe no site publicado, não conta como falha) | copie `dist/` para `<tmp>/git-dojo/`, sirva `<tmp>` com `python -m http.server 5198 --bind 127.0.0.1` e rode `npm run check:offline -- <pasta>` |

## Roteiros de acessibilidade

| Roteiro | O que confere | Como rodar |
|---|---|---|
| `check-1f-acessibilidade.mjs` | `axe-core` na tela de login e nas nove telas, em desktop e celular | `npm run check:a11y -- <pasta>` |
| `check-1f-teclado.mjs` | Missão e conflito resolvidos só pelo teclado, com foco visível | `npm run check:teclado -- <pasta>` |
| `check-1f-movimento.mjs` | `prefers-reduced-motion` respeitado | `npm run check:movimento -- <pasta>` |
| `check-1f-leitor.mjs` | Região `aria-live` do terminal | `npm run check:leitor` |
| `check-1g-reflow.mjs` | Reflow em 320 px e zoom de 200%, na tela de login e nas nove telas | `npm run check:reflow -- <pasta>` |
| `check-1g-toasts.mjs` | Toasts fecháveis pelo teclado e relógio que para | `npm run check:toasts` |
| `check-2-video.mjs` | Vídeo de abertura do módulo: janela antes da primeira missão, sem tocar sozinho, legendas, transcrição, axe, Pular, Escape, não repete, rever pela trilha, arquivos servidos | `npm run check:video -- <pasta>` |

## Fidelidade ao Git real

| Roteiro | O que faz | Como rodar |
|---|---|---|
| `comparar-dojo-git-real.ts` | Gera sequências aleatórias de comandos, roda no motor do Dojo e no Git instalado e compara as saídas | `npx vite-node scripts/comparar-dojo-git-real.ts <pasta> <sequências> <semente> [diff]` |
| `medir-desvios-git-real.sh` | Cenários fixos medidos no Git real, usados para desenhar as correções do motor | `bash scripts/medir-desvios-git-real.sh <pasta>` |

`lib-missoes.mjs` é código compartilhado pelos roteiros de tela: `dispensaVideo(page)` fecha a janela do vídeo de abertura quando ela aparece; `entraNoSite(page, url)` abre o Dojo e passa pela tela de login quando ela aparece; `abreTelaDeLogin(page, url)` abre a tela de login com o aviso de erro, a do site publicado ou, no Vite local, a cópia de `deploy/login/` servida no mesmo endereço por interceptação; `aplicaProgressoCompleto(page)` grava as 23 missões concluídas, recarrega e confere, tentando de novo se o app tiver sobrescrito o `localStorage` antes do reload (aconteceu no site publicado, onde o reload demora mais); `argsDoChrome()` lê `CHROME_ARGS`.

`gerar-legendas.ts` escreve `public/videos/<modulo>.vtt` a partir das deixas de `src/content/videos.ts`: `npm run legendas`.

## Observações

- A máquina pode ter um antivírus (Kaspersky) que injeta um script nas páginas, inclusive nas HTTPS do site publicado, onde a CSP o barra e o Chrome registra um erro no console. Os roteiros ignoram a origem `kaspersky-labs.com` nas requisições e nas mensagens do console.
- `check-1b-impressao.mjs` espera a Cola e o certificado em uma página A4 cada. Na impressão, a Cola usa duas colunas de fluxo (`column-count`), e não a grade da tela, com o corpo em 8 pt; sobram cerca de 17 mm no pé da folha. Se uma seção nova da Cola não couber, o roteiro acusa 2 páginas.
- O Firefox não entra no `playwright-core` sem o navegador próprio do Playwright. Para gerar o PDF no Firefox instalado, abra-o com `--headless --remote-debugging-port <porta> --profile <pasta-vazia>` e use WebDriver BiDi (`browsingContext.print` com `shrinkToFit: false`, A4 e margens de 1,2 cm). O `WebSocket` nativo do Node 24 basta.
- `check-1g-toasts.mjs` às vezes falha por tempo numa rodada e passa na seguinte; repita antes de concluir que quebrou.
- O toast de conquista só aparece quando a missão conclui de verdade. Os roteiros esperam cerca de 300 ms entre comandos por isso.
- Os nomes `1b`, `1f`, `1g` referem-se às etapas do plano de implementação em que cada roteiro nasceu.
