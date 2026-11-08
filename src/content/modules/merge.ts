import type { Module } from "../types";
import { sc, onBranch, committedFile, clean, happened, hasMergeCommit, headCommit, isAncestor, used, noConflicts } from "../helpers";

export const merge: Module = {
  id: "merge",
  title: "Merge",
  subtitle: "Integrando o trabalho",
  description: "Fast-forward, merge de três vias e quando preservar o histórico com --no-ff.",
  color: "#a855f7",
  icon: "git-merge",
  missions: [
    {
      id: "fast-forward",
      title: "Fast-forward",
      tagline: "Quando a main não andou, o merge é só um avanço de ponteiro.",
      story: [
        "A `feature/login` está pronta e a `main` **não recebeu nenhum commit** desde que a branch nasceu. Nesse caso o Git não precisa criar nada: ele só move o ponteiro da `main` para a frente — o famoso **fast-forward**.",
        "Vá para a `main`, faça o merge da `feature/login` e observe: nenhum commit novo, só o ponteiro andando.",
      ],
      concept: {
        title: "Fast-forward",
        diagram: "fast-forward",
        points: [
          "Acontece quando o commit da main é ancestral direto da branch. A main simplesmente 'alcança' a feature.",
          "O histórico fica linear — ótimo para o fluxo trunk-based da Iron Systems.",
          "Sempre faça o merge **estando na branch que vai receber** (`git switch main` primeiro).",
        ],
      },
      setup: () =>
        sc()
          .file("README.md", "# Portal RPA\n")
          .commit("primeiro commit")
          .switch("feature/login", true)
          .file("login.php", "<?php // login\n")
          .commit("adiciona login")
          .file("login.php", "<?php // login\n// valida senha\n")
          .commit("valida senha")
          .switch("main")
          .done(),
      objectives: [
        { id: "on", text: "Estar na `main` antes do merge", check: ({ repo }) => onBranch(repo, "main") },
        { id: "ff", text: "Merge por fast-forward (sem commit de merge)", check: (ctx) => happened(ctx, "fast-forward") && !hasMergeCommit(ctx.repo, "main") },
        { id: "same", text: "`main` e `feature/login` apontam para o mesmo commit", check: ({ repo }) => repo.branches.main === repo.branches["feature/login"] && committedFile(repo, "login.php", "main") !== undefined },
      ],
      hints: ["`git switch main` e depois `git merge feature/login`.", "`git log --oneline --graph --all` mostra as duas etiquetas no mesmo commit."],
      cheatsheet: ["git switch main", "git merge feature/login", "git log --oneline --graph --all"],
      xp: 70,
    },
    {
      id: "merge-de-verdade",
      title: "Merge de três vias",
      tagline: "As duas branches andaram: nasce um commit de merge.",
      story: [
        "Enquanto você fazia a `feature/relatorio`, a **Ana** commitou um ajuste de CSS na `main`. Agora as duas linhas divergiram: o Git vai combinar os dois lados usando o **ancestral comum** como referência e criar um **commit de merge** com dois pais.",
        "Como vocês mexeram em arquivos diferentes, não haverá conflito. Faça o merge na `main` e veja o grafo formar o 'losango'.",
      ],
      concept: {
        title: "Merge de três vias",
        diagram: "three-way",
        points: [
          "O Git compara três pontos: a **base** (ancestral comum), a **sua branch** e a **outra**.",
          "Mudanças em partes diferentes são combinadas automaticamente.",
          "O resultado é um commit com **dois pais**. Ele registra a união das duas histórias.",
        ],
      },
      setup: () =>
        sc()
          .file("README.md", "# Portal RPA\n")
          .file("style.css", "body { margin: 0; }\n")
          .commit("primeiro commit")
          .switch("feature/relatorio", true)
          .file("relatorio.php", "<?php // relatório\n")
          .commit("adiciona relatório")
          .switch("main")
          .file("style.css", "body { margin: 0; }\nh1 { color: #f05032; }\n")
          .commit("ajusta cor do título", "ana")
          .done(),
      objectives: [
        { id: "merge", text: "Fazer o merge de `feature/relatorio` na `main`", check: ({ repo }) => onBranch(repo, "main") && isAncestor(repo, "feature/relatorio", "main") },
        { id: "mc", text: "Existe um commit de merge (dois pais) na `main`", check: ({ repo }) => (headCommit(repo)?.parents.length ?? 0) === 2 },
        { id: "both", text: "A `main` tem o relatório **e** o CSS da Ana", check: ({ repo }) => committedFile(repo, "relatorio.php", "main") !== undefined && committedFile(repo, "style.css", "main")?.includes("h1") === true },
        { id: "graph", text: "Ver o losango com `git log --graph`", check: (ctx) => used(ctx, /^git log.*--graph/) },
      ],
      hints: ["Você já está na main. `git merge feature/relatorio`.", "`git log --oneline --graph --all` para ver o commit de merge com `|\\`."],
      cheatsheet: ["git merge feature/relatorio", "git log --oneline --graph --all"],
      xp: 80,
    },
    {
      id: "no-ff",
      title: "Preservando a história",
      tagline: "Use --no-ff quando quiser registrar que uma feature existiu.",
      story: [
        "A `feature/exportacao` poderia ser mesclada por fast-forward, mas o líder técnico quer que o histórico mostre **claramente** onde a feature começou e terminou, para facilitar um eventual rollback inteiro.",
        "Faça o merge com `--no-ff` para forçar um commit de merge, mesmo sendo possível o fast-forward. Depois apague a branch, que já cumpriu seu papel.",
      ],
      concept: {
        title: "--no-ff",
        points: [
          "Força um commit de merge mesmo quando o fast-forward seria possível.",
          "Vantagem: o grupo de commits da feature fica visível como uma 'bolha' no grafo e pode ser revertido de uma vez.",
          "Na Iron Systems o fluxo oficial é commit direto na `main`, com histórico linear. Branches e `--no-ff` são escolha de quem prefere trabalhar em paralelo no local; use `--no-ff` só quando a 'bolha' no histórico tiver valor.",
        ],
      },
      setup: () =>
        sc()
          .file("README.md", "# Portal RPA\n")
          .commit("primeiro commit")
          .switch("feature/exportacao", true)
          .file("exportar.php", "<?php // exporta CSV\n")
          .commit("exporta CSV")
          .file("exportar.php", "<?php // exporta CSV\n// exporta PDF\n")
          .commit("exporta PDF")
          .switch("main")
          .done(),
      objectives: [
        { id: "noff", text: "Merge com `--no-ff` criando commit de merge na `main`", check: ({ repo }) => onBranch(repo, "main") && (headCommit(repo)?.parents.length ?? 0) === 2 && committedFile(repo, "exportar.php", "main")?.includes("PDF") === true },
        { id: "del", text: "Apagar `feature/exportacao` após o merge", check: ({ repo }) => !("feature/exportacao" in repo.branches) },
        { id: "clean", text: "Árvore limpa, sem operações pendentes", check: ({ repo }) => clean(repo) && noConflicts(repo) },
      ],
      hints: ["`git merge --no-ff feature/exportacao`.", "`git branch -d feature/exportacao` — como já foi mesclada, `-d` basta."],
      cheatsheet: ["git merge --no-ff feature/exportacao", "git log --oneline --graph", "git branch -d feature/exportacao"],
      xp: 80,
      badge: "merge-master",
    },
  ],
};
