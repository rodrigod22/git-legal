# Vídeos de abertura do Git Dojo

Um vídeo narrado de 60 s por módulo, mostrado antes da primeira missão de cada módulo (e revisível pela trilha). São páginas HTML animadas com GSAP e renderizadas em MP4 pelo [HyperFrames](https://github.com/heygen-com/hyperframes), localmente, sem conta nem internet depois de instalado.

## Estrutura

| Caminho | O que é |
|---|---|
| `compositions/<modulo>.html` | A composição de cada vídeo: seis cenas (`section.clip`), os `<audio>` da narração e dos efeitos, e a timeline GSAP pausada registrada em `window.__timelines` |
| `assets/dojo.css`, `assets/dojo.js` | Base visual e ajudantes compartilhados: paleta e fontes do Dojo, terminal, cartões, grafo de commits em SVG, partículas, transições e digitação |
| `assets/fonts/` | Inter e JetBrains Mono (`woff2` do `@fontsource`, com as licenças OFL) |
| `assets/gsap.min.js` | Cópia local do GSAP 3.15.0 que vem no pacote do HyperFrames |
| `assets/audio/voz-<modulo>.m4a` | Narração de cada módulo, gerada por `ferramentas/gerar-narracao.py` com o Kokoro local (voz `pm_santa`); o `.wav` ao lado é ignorado pelo Git |
| `assets/audio/sfx-*.wav` | Efeitos sonoros **sintetizados** por `ferramentas/gerar-audio.py` (numpy): nenhuma amostra de terceiros, nenhuma licença a cuidar |
| `narracao/<modulo>.json` | O texto falado de cada vídeo: uma lista de falas com início, limite (`fim`) e texto |
| `narracao/pronuncia.json` | Dicionário de pronúncia: termos em inglês reescritos como um dev brasileiro fala (`git` → `guít`) |
| `ferramentas/renderizar.mjs` | Lint, `check` (contraste AA, layout, movimento), capturas e render de cada módulo; copia o MP4 e um pôster para `public/videos/` do Dojo |
| `ferramentas/gerar-narracao.py` | Gera a narração (`.wav` e `.m4a`) a partir de `narracao/`, avisa quando uma fala não cabe no tempo e mostra fonemas |
| `ferramentas/requisitos-voz.txt` | Versões do `kokoro-onnx` e do `soundfile` para o ambiente virtual da narração |
| `ferramentas/gerar-audio.py` | Gera os efeitos sonoros |
| `index.html` | Projeto raiz, só para `check`, `snapshot` e `preview`; a ferramenta monta nele uma composição por vez |
| `renders/` | Saída dos renders e das capturas (ignorada pelo Git) |
| `.venv-kokoro/` | Ambiente virtual da narração (ignorado pelo Git; ver "Narração") |

As legendas (`public/videos/<modulo>.vtt`) e a transcrição do player vêm de `src/content/videos.ts`, pelo roteiro `scripts/gerar-legendas.ts`. Elas reproduzem o **texto da tela**, não a fala: a narração resume o que a tela mostra, sem acrescentar informação, então quem lê a legenda ou a transcrição não perde nada. Se uma fala nova disser algo que não está na tela, ponha o texto na tela e nas deixas também.

## Como produzir

```bash
cd videos
npm install                      # hyperframes 0.9.23 (117 MB em node_modules); o Chrome headless vem do cache do Puppeteer
npm run doctor                   # confere Chrome, FFmpeg e FFprobe
npm run voz                      # regera a narração dos seis (precisa do ambiente virtual, ver "Narração")
npm run audio                    # só se quiser mudar um efeito sonoro (precisa de Python 3 com numpy)
npm run render -- conflitos      # um módulo: lint, check, capturas em renders/quadros/, render CRF 24 e cópia para public/videos/
npm run render                   # os seis
npm run render -- trunk --so-checar   # só lint, check e capturas
npm run preview                  # estúdio do HyperFrames no navegador, com o index.html
```

Para conferir os MP4 prontos (duração, resolução, codecs, peso e reprodução com áudio no Chrome): `npm run conferir`.

Um render de 60 s leva de 2 a 6 minutos nesta máquina; não rode dois ao mesmo tempo. Se um render for interrompido, confira se `index.html` voltou ao original (`git status index.html`), porque a ferramenta o reescreve durante o `check`.

Na raiz do Dojo, depois do render: `npx vite-node scripts/gerar-legendas.ts` (se as deixas mudaram), `npm test` (o teste `videos.test.ts` confere arquivos, tamanhos e legendas) e `npm run build`.

## Narração

A voz vem do [Kokoro](https://github.com/hexgrad/kokoro) (modelo de 82 M parâmetros, licença Apache 2.0) pelo pacote [`kokoro-onnx`](https://github.com/thewh1teagle/kokoro-onnx), rodando na CPU, sem conta, sem chave e sem rede depois do download. A voz é a `pm_santa` (masculina, pt-br), escolhida pelo Rodrigo em 08/11/2026 entre `pf_dora`, `pm_alex` e `pm_santa`. Os vídeos não têm música: só voz e efeitos.

**Ambiente (uma vez por máquina).** O Kokoro traz `onnxruntime` e `numpy` próprios: fica num ambiente virtual dentro de `videos/`, nunca no Python global.

```bash
cd videos
python -m venv .venv-kokoro
.venv-kokoro/Scripts/python.exe -m pip install -r ferramentas/requisitos-voz.txt    # cerca de um minuto
```

**Modelo (uma vez por máquina, 354 MB, arquivos públicos sem conta).** O script procura em `~/.cache/hyperframes/tts/` (a mesma pasta do `hyperframes tts`; outra pasta pela variável `KOKORO_MODELOS`):

```bash
mkdir -p ~/.cache/hyperframes/tts/models ~/.cache/hyperframes/tts/voices
curl -L -o ~/.cache/hyperframes/tts/models/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -L -o ~/.cache/hyperframes/tts/voices/voices-v1.0.bin https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
```

As vozes brasileiras (`pf_dora`, `pm_alex`, `pm_santa`) estão no `voices-v1.0.bin`, embora o `hyperframes tts --list` não as mostre.

**Gerar e conferir.**

```bash
npm run voz -- trunk --so-medir      # tempos de cada fala, sem gravar
npm run voz -- trunk                 # grava assets/audio/voz-trunk.wav e .m4a
npm run voz -- --fonemas "git push"  # fonemas pt-br de um termo, já com o dicionário aplicado
npm run render -- trunk              # o render usa o .m4a
```

Gerar a narração de um módulo leva poucos segundos. O resultado é determinístico: o mesmo texto dá o mesmo áudio.

**Regras do texto falado.**

- Cada fala termina pelo menos 0,3 s antes do seu `fim` (o script avisa `ESTOURA` e não grava) e não começa antes da anterior terminar (`SOBREPÕE`). O `fim` é o fim da cena ou o ponto onde a tela muda de assunto (as deixas de `src/content/videos.ts` ajudam a achar esses pontos).
- Se não couber, encurte o texto sem mudar o sentido; só depois acelere com `"velocidade"` na fala (máximo 1,1).
- Nada de símbolo lido em voz alta: os marcadores de conflito viram "a linha dos sinais de menor", "de igual", "de maior". O traço duplo some sozinho (`--soft` vira "soft") e `-c`, `--no-ff` e os termos em inglês passam pelo dicionário.
- Termo novo em inglês: acrescente em `narracao/pronuncia.json` e confira com `--fonemas`. O termo mais longo vem antes do que ele contém (`commits` antes de `commit`), e a troca só pega a palavra inteira, então `commitar` precisa de linha própria.
- A empresa é Iron Systems ("Áiron Sístems"). O projeto fictício das missões continua `projeto-rpa` / "Portal RPA". Valem as regras do fluxo da Etapa 1C: commit direto na `main`, branch local curta opcional, `pull --rebase` antes do push, `push --force` e `reset` proibidos na `main`, `--no-ff` como opção.
- Mistura: narração com pico em -1 dBFS e `data-volume="1"`; efeitos a 60% do volume que tinham com música.

## Regras de produção

- 1280×720, 30 fps, 60 s, seis cenas no mesmo molde: abertura, situação, o que o Git faz, anatomia, resolução, fechamento.
- Texto na tela com corpo mínimo de 26 px (Inter) e 27 px (JetBrains Mono); nada fora da faixa central de 1120 px; contraste AA conferido pelo `check`.
- Sem CDN: GSAP, fontes e áudio são locais. Sem template literal em `querySelector` (o lint recusa).
- O `#root` de cada composição precisa da regra de posição e tamanho inline, no `<style>` da própria composição (o lint recusa a regra vinda de arquivo externo).
- Cada `<audio>` tem `id`, `class="clip"`, `data-start`, `data-duration`, `data-volume` e `data-hf-media-start-basis="local"`. Efeitos em `data-track-index="2"`, narração em `3` (`id="au-voz"`, `data-start="0"`, `data-duration="60"`, `data-volume="1"`).
- Qualidade: CRF 24, cerca de 3 MB por vídeo (o zoom do fundo e as partículas mudam a tela inteira a cada quadro). O teste `src/content/videos.test.ts` fixa o teto em 4 MB. Para a qualidade padrão do HyperFrames, `--crf 16`.
- Narração em `narracao/<modulo>.json` (ver "Narração"); sem música.
