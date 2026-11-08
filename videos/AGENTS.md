# Vídeos de abertura do Git Dojo — instruções para agentes

Este é o projeto HyperFrames dos seis vídeos de abertura do Git Dojo. Leia antes [`README.md`](README.md), que descreve a estrutura, os comandos e as regras de produção.

## O essencial

- Uma composição por módulo em `compositions/<modulo>.html`; a base visual e os ajudantes estão em `assets/dojo.css` e `assets/dojo.js`. Mude a base com cuidado: as seis composições dependem dela.
- Rode sempre pelo CLI local: `npm run render -- <modulo>` (lint, check, capturas, render CRF 24 e cópia para `../public/videos/`) ou `node node_modules/hyperframes/bin/hyperframes.mjs <comando>`. Não use `npx hyperframes` em outra pasta: baixa outra cópia.
- Depois de mexer numa composição, olhe as capturas em `renders/quadros/<modulo>/` antes de renderizar. Um `check` que passa não mostra como ficou.
- O `check` do HyperFrames só olha o `index.html`, e uma composição montada fora do segundo 0 não ativa as cenas. Por isso `ferramentas/renderizar.mjs` monta uma composição por vez no `index.html` e o restaura no fim.
- Nada de CDN, `Date.now()`, `Math.random()` ou rede: GSAP, fontes e áudio são locais e a animação é determinística.
- Traço animado por `stroke-dasharray` não aparece no render; use o `desenha()` de `assets/dojo.js`, que anima um `clipPath`.
- Cada `<audio>` precisa de `id`, `class="clip"`, `data-start`, `data-duration`, `data-volume` e `data-hf-media-start-basis="local"`; música em `data-track-index="1"`, efeitos em `2`.
- O `#root` de cada composição leva a regra de posição e tamanho no `<style>` da própria composição; o lint recusa template literal em `querySelector`.
- Os textos dos vídeos respeitam as regras do fluxo da Iron Systems validadas na Etapa 1C (ver a seção "Regras do fluxo da Iron Systems" em `src/views/Cheatsheet.tsx`).
- Se o texto na tela mudar, atualize as deixas em `src/content/videos.ts` e rode `npm run legendas` na raiz do Dojo; o teste `videos.test.ts` confere que legenda e deixas batem.
- Sem voz nesta fase. Não crie conta nem use chave de API (HeyGen inclusive): voz, avatar, render na nuvem e `publish` com conta são pagos.
