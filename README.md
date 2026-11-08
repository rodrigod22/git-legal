# Git Dojo — RPA Tecnologia

Treinamento interativo e gamificado de Git para estagiários e devs: **branches, merges e conflitos** no fluxo trunk-based da empresa. Roda 100% no navegador — nenhum servidor, nenhum risco de estragar um repositório de verdade.

## O que tem dentro

- **Motor Git próprio** (`src/engine/`): commits, branches, HEAD, staging, checkout, merge fast-forward e 3-way com marcadores de conflito reais, rebase (com `--continue`/`--abort`), reset, revert, cherry-pick, stash, reflog e um remoto `origin` simulado com `fetch`/`pull --rebase`/`push` (incluindo rejeição *fetch first*).
- **Terminal** com histórico (↑↓), autocompletar (Tab, quando há sugestão) e saída colorida igual ao Git.
- **Grafo de commits animado** que reage a cada comando; clique ou Enter em um hash o coloca na linha de comando.
- **Editor com resolvedor de conflitos** (manter atual / entrada / ambos).
- **23 missões em 6 módulos** (`src/content/modules/`), com objetivos verificados automaticamente, dicas, cola de comandos, "colegas" que fazem push no meio da missão e um chefão.
- **Regras do fluxo da RPA**, validadas e resumidas no topo da Cola: commit direto na `main`, branch local curta opcional, correções com prefixo `fix:`, `pull --rebase` antes do push, `push --force` e `reset` proibidos na `main`, GitHub sem Pull Request.
- **Gamificação**: XP, 5 níveis, 3 estrelas por missão, 9 conquistas, certificado imprimível.
- **Playground** para experimentar livremente.

## Rodar localmente

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # motor + solvabilidade de todas as missões
npm run build    # gera dist/ (estático)
```

## Publicar

O build é estático (`dist/`). Basta copiar a pasta inteira para qualquer servidor web — no WAMP, por exemplo, para `C:\wamp64\www\git-dojo` e abrir `http://localhost/git-dojo/`. O `base: "./"` no Vite permite servir de qualquer subpasta; isso foi conferido servindo `dist/` como `/git-dojo/` em um servidor estático comum.

O Dojo não depende de nada fora do servidor: as fontes Inter e JetBrains Mono vão dentro de `dist/assets/`, então funciona em rede sem acesso à internet. As licenças das fontes (SIL Open Font License) ficam em `dist/licencas/` e devem ser publicadas junto.

O progresso fica no `localStorage` do navegador de cada aluno, por endereço do site: mudar a subpasta zera o progresso de todo mundo.

## Criar ou editar missões

Cada missão é um objeto em `src/content/modules/*.ts`:

- `setup()` monta o repositório inicial com o construtor `sc()` (`.file()`, `.commit()`, `.switch()`, `.remote()`, `.remoteCommit()`…).
- `objectives[]` são funções `check(ctx)` sobre o repositório, o histórico de comandos e os commits exibidos com `git show` (`ctx.shown`).
- `triggers[]` simulam colegas (ex.: Ana faz push quando você commita).

Depois de criar uma missão, adicione a solução em `src/content/missions.test.ts` — o teste garante que ela é resolvível com os comandos ensinados. Outro teste confere se os comandos citados nos textos e na cola funcionam sem aviso de opção não suportada.

## Acessibilidade

- Tudo funciona pelo teclado: Tab e Shift+Tab percorrem os controles na ordem da tela, com foco visível; Enter ou Espaço acionam. No terminal, o Tab completa o comando quando há sugestão e, sem sugestão, segue para o próximo controle. O editor e a tela de conclusão prendem o Tab dentro da janela e fecham com Esc. Os avisos no canto da tela (conquistas e eventos dos colegas) têm botão de fechar, somem sozinhos em alguns segundos e param de contar o tempo enquanto estão com foco ou com o mouse em cima.
- O texto respeita o contraste mínimo da WCAG AA (4,5:1) e a preferência "reduzir movimento" do sistema: sem confete e sem animações de entrada.
- Para leitores de tela, cada tela tem título e marcos, os diagramas têm descrição e o terminal anuncia só a saída do último comando. Auditado com `axe-core` em 08/11/2026, sem violações; ainda não testado com NVDA.

## Limites do simulador

O motor cobre os comandos do treinamento, não o Git inteiro:

- O terminal roda um comando por vez. `&&`, `||`, `|` e `;` fora de aspas geram um aviso, e nada é executado.
- As opções aceitas por subcomando estão na tabela `OPTIONS`, em `src/engine/commands.ts`. Com outras opções, as consultas (`status`, `log`, `diff`, `show`, `reflog`) avisam e mostram a saída padrão; os demais comandos avisam e não executam nada. O aviso não conta como erro do aluno nem cumpre objetivo.
- `git config` não tem efeito: a identidade do repositório é fixa.
- `git add` bloqueia arquivo com marcadores de conflito, como proteção didática. O Git real aceita.
- `git cherry-pick` e `git revert` não têm `-m` nem `--skip`: commit de merge é recusado, e um cherry-pick que fica vazio se encerra com `--abort`.

## Próximos passos sugeridos

- Backend Laravel com ranking da empresa (o store já isola o progresso em `progress`/`xp`/`badges`).
- Vídeos de abertura dos módulos com [HyperFrames](https://github.com/heygen-com/hyperframes).
