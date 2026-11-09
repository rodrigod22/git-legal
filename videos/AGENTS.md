# Vídeos de abertura do Git Dojo — instruções para agentes

Este é o projeto HyperFrames dos seis vídeos de abertura do Git Dojo. Leia antes [`README.md`](README.md), que descreve a estrutura, os comandos e as regras de produção.

## O essencial

- Uma composição por módulo em `compositions/<modulo>.html`; a base visual e os ajudantes estão em `assets/dojo.css` e `assets/dojo.js`. Mude a base com cuidado: as seis composições dependem dela.
- Rode sempre pelo CLI local: `npm run render -- <modulo>` (lint, check, capturas, render CRF 24 e cópia para `../public/videos/`) ou `node node_modules/hyperframes/bin/hyperframes.mjs <comando>`. Não use `npx hyperframes` em outra pasta: baixa outra cópia.
- Depois de mexer numa composição, olhe as capturas em `renders/quadros/<modulo>/` antes de renderizar. Um `check` que passa não mostra como ficou.
- O `check` do HyperFrames só olha o `index.html`, e uma composição montada fora do segundo 0 não ativa as cenas. Por isso `ferramentas/renderizar.mjs` monta uma composição por vez no `index.html` e o restaura no fim.
- Nada de CDN, `Date.now()`, `Math.random()` ou rede: GSAP, fontes e áudio são locais e a animação é determinística.
- Traço animado por `stroke-dasharray` não aparece no render; use o `desenha()` de `assets/dojo.js`, que anima um `clipPath`.
- Cada `<audio>` precisa de `id`, `class="clip"`, `data-start`, `data-duration`, `data-volume` e `data-hf-media-start-basis="local"`; efeitos em `data-track-index="2"`, narração em `3`. Não há música.
- O `#root` de cada composição leva a regra de posição e tamanho no `<style>` da própria composição; o lint recusa template literal em `querySelector`.
- Os textos dos vídeos respeitam as regras do fluxo da Iron Systems validadas na Etapa 1C (ver a seção "Regras do fluxo da Iron Systems" em `src/views/Cheatsheet.tsx`).
- Se o texto na tela mudar, atualize as deixas em `src/content/videos.ts` e rode `npm run legendas` na raiz do Dojo; o teste `videos.test.ts` confere que legenda e deixas batem.
- A narração sai de `narracao/<modulo>.json` por `npm run voz` (Kokoro local, voz `pm_santa`, num ambiente virtual em `.venv-kokoro/`; nunca instale o `kokoro-onnx` no Python global). Siga as regras do texto falado em "Narração" no README: fala que não cabe se encurta antes de acelerar, nada de símbolo lido em voz alta, termo novo em inglês passa pelo `narracao/pronuncia.json` e pelo `--fonemas`.
- As legendas reproduzem o texto da tela, não a fala. Se a narração passar a dizer algo que não está na tela, ponha na tela e nas deixas também.
- Não crie conta nem use chave de API (HeyGen e ElevenLabs inclusive): voz paga, avatar, render na nuvem e `publish` com conta estão fora. Música gerada por modelo de licença não comercial (MusicGen) também.
