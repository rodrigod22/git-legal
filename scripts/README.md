# Roteiros de verificação

Roteiros que conferem o Dojo num navegador de verdade (Chrome, controlado pelo `playwright-core`) e a fidelidade do motor ao Git real. Eles complementam o `npm test`, que cobre o motor e o conteúdo em memória.

## Antes de rodar

1. `npm install` (traz `playwright-core` 1.65.0 e `axe-core` 4.14.0 como dependências de desenvolvimento; o Chrome precisa estar instalado na máquina, porque os roteiros usam `channel: "chrome"`).
2. Suba o servidor de desenvolvimento numa porta própria: `npx vite --port 5199 --strictPort --host 127.0.0.1`. Os roteiros assumem `http://127.0.0.1:5199/`; passe outro endereço como último argumento se precisar.
3. Escolha uma pasta de saída fora do repositório para as capturas e os relatórios (por exemplo, `%TEMP%\git-dojo-check`).

Todos os roteiros terminam com um resumo `OK`/`FALHA` e com "sem erros na página" quando o console do navegador ficou limpo.

## Roteiros de tela

| Roteiro | O que confere | Como rodar |
|---|---|---|
| `check-1b-telas.mjs` | Home (selo "Treinamento oficial", terminal simulado), trilha, avisos do terminal e `git show` | `npm run check:telas -- <pasta>` |
| `check-1b-fluxo.mjs` | Uma missão inteira em desktop ou celular, em Chrome ou Edge | `npm run check:fluxo -- <pasta> chrome desktop` |
| `check-1b-impressao.mjs` | PDFs da Cola e do certificado | `npm run check:impressao -- <pasta>` |
| `check-1b2-mensagens.mjs`, `check-1b3-mensagens.mjs`, `check-1b4-mensagens.mjs` | Mensagens do motor no Playground, uma rodada de correções por roteiro | `npm run check:mensagens` (grava em `tmp-check/`, que pode ser apagada) |
| `check-1d-offline.mjs` | Build servido de uma subpasta, com toda requisição externa bloqueada | copie `dist/` para `<tmp>/git-dojo/`, sirva `<tmp>` com `python -m http.server 5198 --bind 127.0.0.1` e rode `npm run check:offline -- <pasta>` |

## Roteiros de acessibilidade

| Roteiro | O que confere | Como rodar |
|---|---|---|
| `check-1f-acessibilidade.mjs` | `axe-core` nas nove telas, em desktop e celular | `npm run check:a11y -- <pasta>` |
| `check-1f-teclado.mjs` | Missão e conflito resolvidos só pelo teclado, com foco visível | `npm run check:teclado -- <pasta>` |
| `check-1f-movimento.mjs` | `prefers-reduced-motion` respeitado | `npm run check:movimento -- <pasta>` |
| `check-1f-leitor.mjs` | Região `aria-live` do terminal | `npm run check:leitor` |
| `check-1g-reflow.mjs` | Reflow em 320 px e zoom de 200% | `npm run check:reflow -- <pasta>` |
| `check-1g-toasts.mjs` | Toasts fecháveis pelo teclado e relógio que para | `npm run check:toasts` |

## Fidelidade ao Git real

| Roteiro | O que faz | Como rodar |
|---|---|---|
| `comparar-dojo-git-real.ts` | Gera sequências aleatórias de comandos, roda no motor do Dojo e no Git instalado e compara as saídas | `npx vite-node scripts/comparar-dojo-git-real.ts <pasta> <sequências> <semente> [diff]` |
| `medir-desvios-git-real.sh` | Cenários fixos medidos no Git real, usados para desenhar as correções do motor | `bash scripts/medir-desvios-git-real.sh <pasta>` |

`lib-missoes.mjs` é código compartilhado pelos roteiros de tela.

## Observações

- A máquina pode ter um antivírus que injeta um script em páginas HTTP; os roteiros que bloqueiam requisições externas ignoram a origem `kaspersky-labs.com`.
- O toast de conquista só aparece quando a missão conclui de verdade. Os roteiros esperam cerca de 300 ms entre comandos por isso.
- Os nomes `1b`, `1f`, `1g` referem-se às etapas do plano de implementação em que cada roteiro nasceu.
