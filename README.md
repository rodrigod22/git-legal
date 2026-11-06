# Git Dojo — RPA Tecnologia

Treinamento interativo e gamificado de Git para estagiários e devs: **branches, merges e conflitos** no fluxo trunk-based da empresa. Roda 100% no navegador — nenhum servidor, nenhum risco de estragar um repositório de verdade.

## O que tem dentro

- **Motor Git próprio** (`src/engine/`): commits, branches, HEAD, staging, checkout, merge fast-forward e 3-way com marcadores de conflito reais, rebase (com `--continue`/`--abort`), reset, revert, cherry-pick, stash, reflog e um remoto `origin` simulado com `fetch`/`pull --rebase`/`push` (incluindo rejeição *fetch first*).
- **Terminal** com histórico, autocompletar (Tab) e saída colorida igual ao Git.
- **Grafo de commits animado** que reage a cada comando.
- **Editor com resolvedor de conflitos** (manter atual / entrada / ambos).
- **23 missões em 6 módulos** (`src/content/modules/`), com objetivos verificados automaticamente, dicas, cola de comandos, "colegas" que fazem push no meio da missão e um chefão.
- **Gamificação**: XP, 5 níveis, 3 estrelas por missão, 9 conquistas, certificado imprimível.
- **Playground** para experimentar livremente.

## Rodar localmente

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 43 testes: motor + solvabilidade de todas as missões
npm run build    # gera dist/ (estático)
```

## Publicar

O build é estático (`dist/`). Basta copiar a pasta para qualquer servidor web — no WAMP, por exemplo, para `C:\wamp64\www\git-dojo` e abrir `http://localhost/git-dojo/`. O `base: "./"` no Vite permite servir de qualquer subpasta.

O progresso fica no `localStorage` do navegador de cada aluno.

## Criar ou editar missões

Cada missão é um objeto em `src/content/modules/*.ts`:

- `setup()` monta o repositório inicial com o construtor `sc()` (`.file()`, `.commit()`, `.switch()`, `.remote()`, `.remoteCommit()`…).
- `objectives[]` são funções `check(ctx)` sobre o repositório e o histórico de comandos.
- `triggers[]` simulam colegas (ex.: Ana faz push quando você commita).

Depois de criar uma missão, adicione a solução em `src/content/missions.test.ts` — o teste garante que ela é resolvível com os comandos ensinados.

## Próximos passos sugeridos

- Backend Laravel com ranking da empresa (o store já isola o progresso em `progress`/`xp`/`badges`).
- Vídeos de abertura dos módulos com [HyperFrames](https://github.com/heygen-com/hyperframes).
