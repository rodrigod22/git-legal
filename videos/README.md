# Vídeos de abertura do Git Dojo

Um vídeo de 60 s por módulo, mostrado antes da primeira missão de cada módulo (e revisível pela trilha). São páginas HTML animadas com GSAP e renderizadas em MP4 pelo [HyperFrames](https://github.com/heygen-com/hyperframes), localmente, sem conta nem internet depois de instalado.

## Estrutura

| Caminho | O que é |
|---|---|
| `compositions/<modulo>.html` | A composição de cada vídeo: seis cenas (`section.clip`), os `<audio>` da trilha e dos efeitos, e a timeline GSAP pausada registrada em `window.__timelines` |
| `assets/dojo.css`, `assets/dojo.js` | Base visual e ajudantes compartilhados: paleta e fontes do Dojo, terminal, cartões, grafo de commits em SVG, partículas, transições e digitação |
| `assets/fonts/` | Inter e JetBrains Mono (`woff2` do `@fontsource`, com as licenças OFL) |
| `assets/gsap.min.js` | Cópia local do GSAP 3.15.0 que vem no pacote do HyperFrames |
| `assets/audio/musica-<modulo>.m4a`, `assets/audio/sfx-*.wav` | Trilha de cada módulo e efeitos sonoros, **sintetizados** por `ferramentas/gerar-audio.py` (numpy): nenhuma amostra de terceiros, nenhuma licença a cuidar |
| `ferramentas/renderizar.mjs` | Lint, `check` (contraste AA, layout, movimento), capturas e render de cada módulo; copia o MP4 e um pôster para `public/videos/` do Dojo |
| `ferramentas/gerar-audio.py` | Gera os `.wav` da música (ignorados pelo Git) e dos efeitos |
| `index.html` | Projeto raiz, só para `check`, `snapshot` e `preview`; a ferramenta monta nele uma composição por vez |
| `renders/` | Saída dos renders e das capturas (ignorada pelo Git) |

As legendas (`public/videos/<modulo>.vtt`) e a transcrição do player vêm de `src/content/videos.ts`, pelo roteiro `scripts/gerar-legendas.ts`.

## Como produzir

```bash
cd videos
npm install                      # hyperframes 0.9.23 (117 MB em node_modules); o Chrome headless vem do cache do Puppeteer
npm run doctor                   # confere Chrome, FFmpeg e FFprobe
npm run audio                    # só se quiser regerar as trilhas (precisa de Python 3 com numpy)
npm run render -- conflitos      # um módulo: lint, check, capturas em renders/quadros/, render CRF 24 e cópia para public/videos/
npm run render                   # os seis
npm run render -- trunk --so-checar   # só lint, check e capturas
npm run preview                  # estúdio do HyperFrames no navegador, com o index.html
```

Na raiz do Dojo, depois do render: `npx vite-node scripts/gerar-legendas.ts` (se as deixas mudaram), `npm test` (o teste `videos.test.ts` confere arquivos, tamanhos e legendas) e `npm run build`.

## Regras de produção

- 1280×720, 30 fps, 60 s, seis cenas no mesmo molde: abertura, situação, o que o Git faz, anatomia, resolução, fechamento.
- Texto na tela com corpo mínimo de 26 px (Inter) e 27 px (JetBrains Mono); nada fora da faixa central de 1120 px; contraste AA conferido pelo `check`.
- Sem CDN: GSAP, fontes e áudio são locais. Sem template literal em `querySelector` (o lint recusa).
- O `#root` de cada composição precisa da regra de posição e tamanho inline, no `<style>` da própria composição (o lint recusa a regra vinda de arquivo externo).
- Cada `<audio>` tem `id`, `class="clip"`, `data-start`, `data-duration`, `data-volume` e `data-hf-media-start-basis="local"`. Música em `data-track-index="1"`, efeitos em `2`.
- Qualidade: CRF 24 (cerca de 1,2 a 1,6 MB por vídeo). Para a qualidade padrão do HyperFrames, `--crf 16`.
- Sem voz nesta fase. O texto que uma narração diria está na coluna "Narração" dos roteiros em `analises/fase2-roteiro-<modulo>.md`.
