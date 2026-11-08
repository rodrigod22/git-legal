import type { Module } from "../types";
import { sc, hasBranch, onBranch, committedFile, clean, used, branchHasCommitMsg, commitsOn, file } from "../helpers";
import * as G from "@/engine/repo";

export const branches: Module = {
  id: "branches",
  title: "Branches",
  subtitle: "Linhas paralelas de trabalho",
  description: "Crie, troque, navegue e limpe branches. Descubra que uma branch é só um ponteiro.",
  color: "#22c55e",
  icon: "git-branch",
  missions: [
    {
      id: "primeira-branch",
      title: "Sua primeira branch",
      tagline: "Isole uma funcionalidade nova sem tocar na main.",
      story: [
        "Chegou a demanda: **tela de login**. Na Iron Systems o padrão é commitar direto na `main`, em commits pequenos, como você vai praticar no módulo Trunk-based. Só que a tela precisa de vários commits até funcionar, e a `main` não pode ficar quebrada nesse meio-tempo. Para esses casos, quem preferir pode trabalhar numa **branch local curta**: ela vive poucas horas, fica só na sua máquina e volta para a `main` no mesmo dia. Não é obrigatório, mas é bom saber usar.",
        "Crie a branch `feature/login`, troque para ela, crie `login.php` e commite. Observe no grafo ao lado o ponteiro `HEAD` se movendo.",
      ],
      concept: {
        title: "Branch é um ponteiro",
        diagram: "branch",
        points: [
          "Uma branch é apenas uma etiqueta que aponta para um commit. Criar uma é instantâneo e barato.",
          "`HEAD` indica **onde você está**. Ao commitar, a branch onde HEAD está avança.",
          "`git switch -c nome` cria e troca de uma vez (equivale a `git checkout -b nome`).",
          "`git branch` lista; a atual aparece com `*`.",
        ],
      },
      setup: () => sc().file("README.md", "# Portal RPA\n").file("index.php", "<?php\necho 'Portal RPA';\n").commit("primeiro commit").done(),
      objectives: [
        { id: "create", text: "Criar a branch `feature/login`", check: ({ repo }) => hasBranch(repo, "feature/login") },
        { id: "on", text: "Estar na branch `feature/login`", check: ({ repo }) => onBranch(repo, "feature/login") },
        { id: "commit", text: "Commitar `login.php` nessa branch", check: ({ repo }) => onBranch(repo, "feature/login") && committedFile(repo, "login.php", "feature/login") !== undefined },
        { id: "main", text: "A `main` continua sem o `login.php`", check: ({ repo }) => committedFile(repo, "login.php", "main") === undefined },
      ],
      hints: [
        "`git switch -c feature/login` cria e já troca. Confira com `git branch`.",
        "Crie o arquivo: `echo \"<?php // login\" > login.php`, depois `git add login.php`.",
        "`git commit -m \"adiciona tela de login\"`. Repare que só a feature/login avançou no grafo.",
      ],
      cheatsheet: ["git switch -c feature/login", "git branch", 'echo "<?php // tela de login" > login.php', "git add login.php", 'git commit -m "adiciona tela de login"'],
      xp: 70,
    },
    {
      id: "troca-de-contexto",
      title: "Urgente: hotfix na main",
      tagline: "Guarde o trabalho pela metade com stash e volte depois.",
      story: [
        "Você está no meio da `feature/relatorio` com o `relatorio.php` alterado e **ainda não commitado**. O gerente chega: *\"o site está fora do ar, o `index.php` está com erro de sintaxe!\"*.",
        "Tente trocar para a `main`: o Git vai bloquear, pois suas alterações seriam sobrescritas. A saída profissional é `git stash`: guarda o trabalho em uma gaveta, você faz o hotfix e depois `git stash pop` devolve tudo.",
        "Corrija o `index.php` na `main` (falta o `;` no final do echo), commite, volte para a feature e recupere o trabalho.",
      ],
      concept: {
        title: "Stash: a gaveta",
        diagram: "stash",
        points: [
          "`git stash` guarda alterações não commitadas e deixa a árvore limpa.",
          "`git stash pop` devolve a alteração mais recente (e remove da gaveta). `git stash list` mostra o que há guardado.",
          "Alternativa: commitar um WIP na branch. Stash é melhor quando o trabalho ainda não merece um commit.",
        ],
      },
      setup: () =>
        sc()
          .file("README.md", "# Portal RPA\n")
          .file("index.php", "<?php\necho 'Portal RPA'\n")
          .commit("primeiro commit")
          .switch("feature/relatorio", true)
          .file("relatorio.php", "<?php\n// relatório mensal\n")
          .commit("inicia relatório")
          .file("relatorio.php", "<?php\n// relatório mensal\n// TODO: filtros por data (em andamento)\n")
          .done(),
      objectives: [
        { id: "stash", text: "Guardar o trabalho com `git stash`", check: (ctx) => used(ctx, /^git stash(\s|$)(?!pop|list|apply)/) },
        { id: "fix", text: "Commit na `main` corrigindo o `index.php` (com `;`)", check: ({ repo }) => committedFile(repo, "index.php", "main")?.includes("echo 'Portal RPA';") === true },
        { id: "back", text: "Voltar para `feature/relatorio`", check: ({ repo }) => onBranch(repo, "feature/relatorio") },
        { id: "pop", text: "Recuperar o trabalho com `git stash pop` (TODO de volta no arquivo)", check: ({ repo }) => onBranch(repo, "feature/relatorio") && file(repo, "relatorio.php")?.includes("TODO") === true && repo.stash.length === 0 },
      ],
      hints: [
        "Tente `git switch main` e leia o erro. Depois: `git stash`.",
        "Na main: `edit index.php`, adicione o `;` e salve. `git add index.php` e `git commit -m \"fix: ponto e vírgula\"`.",
        "`git switch feature/relatorio` e `git stash pop`. Confira com `cat relatorio.php`.",
      ],
      cheatsheet: ["git switch main  (vai falhar!)", "git stash", "git switch main", "edit index.php", "git add index.php", 'git commit -m "fix: ponto e vírgula no index"', "git switch feature/relatorio", "git stash pop"],
      xp: 90,
    },
    {
      id: "viagem-no-tempo",
      title: "Viagem no tempo",
      tagline: "Visite um commit antigo e crie uma branch a partir dele.",
      story: [
        "O cliente quer ver como o portal estava **antes** da migração visual. Você pode fazer checkout de um commit antigo (`HEAD desanexado`) para olhar, e, se quiser trabalhar ali, criar uma branch naquele ponto.",
        "Faça checkout do commit `layout antigo` (olhe no log), confira o `style.css`, e crie a branch `legado` a partir dele. Depois volte para a `main`.",
      ],
      concept: {
        title: "HEAD desanexado",
        diagram: "detached",
        points: [
          "`git checkout <sha>` move HEAD direto para um commit, sem branch. É seguro para olhar.",
          "Commits feitos ali ficam 'órfãos' se você sair sem criar uma branch. Por isso: `git switch -c nome` antes de commitar.",
          "`HEAD~1` é o pai do commit atual; `HEAD~2`, o avô.",
        ],
      },
      setup: () =>
        sc()
          .file("README.md", "# Portal RPA\n")
          .file("style.css", "body { background: #fff; color: #222; }\n")
          .commit("layout antigo")
          .file("style.css", "body { background: #0b0f1a; color: #eee; }\n")
          .commit("migra para tema escuro")
          .file("index.php", "<?php\necho 'Portal RPA';\n")
          .commit("adiciona index")
          .done(),
      objectives: [
        {
          id: "detached",
          text: "Visitar o commit `layout antigo` em HEAD desanexado",
          check: (ctx) => ctx.events.includes("checkout") && ctx.commands.some((c) => /^git (checkout|switch --detach)\s+(HEAD~2|[0-9a-f]{4,})/.test(c)),
        },
        {
          id: "branch",
          text: "A branch `legado` aponta para o commit `layout antigo`",
          check: ({ repo }) => hasBranch(repo, "legado") && repo.commits[repo.branches.legado]?.message === "layout antigo",
        },
        { id: "back", text: "Voltar para a `main`", check: ({ repo }) => onBranch(repo, "main") },
      ],
      hints: [
        "`git log --oneline` e copie o hash de 'layout antigo'. Ou use `git checkout HEAD~2`.",
        "Estando lá: `git switch -c legado` (ou `git branch legado` depois de voltar: `git branch legado <hash>`).",
        "Para voltar: `git switch main`. O grafo mostra as duas branches.",
      ],
      cheatsheet: ["git log --oneline", "git checkout HEAD~2", "cat style.css", "git switch -c legado", "git switch main"],
      xp: 80,
    },
    {
      id: "faxina",
      title: "Faxina nas branches",
      tagline: "Apague o que já foi integrado, renomeie o que está errado.",
      story: [
        "O repositório acumulou lixo. `feature/cadastro` **já foi mesclada** na main e pode ir embora. `spike/teste-api` era um experimento **abandonado** (tem commits que nunca entrarão) e deve ser apagada à força. E alguém criou `feture-relatorio` com erro de digitação: renomeie para `feature/relatorio`.",
        "Termine com exatamente estas branches: `main`, `feature/relatorio`.",
      ],
      concept: {
        title: "Ciclo de vida de uma branch",
        points: [
          "`git branch -d` apaga só se já foi mesclada (seguro). `-D` força — use quando tiver certeza de que o trabalho é descartável.",
          "`git branch -m antigo novo` renomeia.",
          "Branch mesclada apagada não perde nada: os commits continuam na main.",
        ],
      },
      setup: () =>
        sc()
          .file("README.md", "# Portal RPA\n")
          .commit("primeiro commit")
          .switch("feature/cadastro", true)
          .file("cadastro.php", "<?php // cadastro\n")
          .commit("adiciona cadastro")
          .switch("main")
          .merge("feature/cadastro")
          .switch("spike/teste-api", true)
          .file("api-teste.php", "<?php // experimento\n")
          .commit("experimento com API")
          .switch("main")
          .branch("feture-relatorio")
          .done(),
      objectives: [
        { id: "d", text: "Apagar `feature/cadastro` com `-d` (segura)", check: (ctx) => !hasBranch(ctx.repo, "feature/cadastro") && used(ctx, /^git branch (-d|--delete) feature\/cadastro/) },
        { id: "D", text: "Apagar `spike/teste-api` à força", check: ({ repo }) => !hasBranch(repo, "spike/teste-api") },
        { id: "m", text: "Renomear `feture-relatorio` para `feature/relatorio`", check: ({ repo }) => hasBranch(repo, "feature/relatorio") && !hasBranch(repo, "feture-relatorio") },
        { id: "final", text: "Sobrar apenas `main` e `feature/relatorio`", check: ({ repo }) => G.allBranches(repo).join(",") === "feature/relatorio,main" && clean(repo) },
      ],
      hints: [
        "`git branch` lista tudo. `git branch -d feature/cadastro` funciona porque já está na main.",
        "`git branch -d spike/teste-api` vai recusar. Use `git branch -D spike/teste-api`.",
        "`git branch -m feture-relatorio feature/relatorio`.",
      ],
      cheatsheet: ["git branch", "git branch -d feature/cadastro", "git branch -D spike/teste-api", "git branch -m feture-relatorio feature/relatorio"],
      xp: 80,
      badge: "branch-master",
    },
  ],
};

void branchHasCommitMsg;
void commitsOn;
