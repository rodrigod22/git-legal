import type { Module } from "../types";
import { sc, committedFile, clean, headCommit, used, hasBranch, commitsOn, onBranch } from "../helpers";
import * as G from "@/engine/repo";

export const perigo: Module = {
  id: "perigo",
  title: "Zona de Perigo",
  subtitle: "Reescrevendo e resgatando história",
  description: "Reset, cherry-pick e reflog: ferramentas poderosas para usar com consciência.",
  color: "#64748b",
  icon: "shield",
  missions: [
    {
      id: "squash-local",
      title: "Juntando commits locais",
      tagline: "Três commits 'wip' viram um só antes de sair da sua máquina.",
      story: [
        "Você fez três commits de rascunho (`wip 1`, `wip 2`, `wip 3`) que **ainda não foram enviados**. Antes do push, junte-os em um único commit limpo chamado `adiciona filtro de busca`.",
        "Use `git reset --soft HEAD~3`: a branch volta três commits, mas as mudanças ficam todas na staging. Aí é só commitar uma vez.",
      ],
      concept: {
        title: "Os três resets",
        points: [
          "`--soft`: move a branch; mantém staging e arquivos. Ideal para juntar commits.",
          "`--mixed` (padrão): move a branch e limpa a staging; mantém arquivos.",
          "`--hard`: move a branch e **descarta tudo**. Cuidado.",
          "Só use reset em commits que nunca saíram da sua máquina.",
        ],
      },
      setup: () =>
        sc()
          .file("README.md", "# Portal RPA\n")
          .commit("versão inicial")
          .file("busca.php", "<?php\n// filtro\n")
          .commit("wip 1")
          .file("busca.php", "<?php\n// filtro\n$termo = $_GET['q'] ?? '';\n")
          .commit("wip 2")
          .file("busca.php", "<?php\n// filtro\n$termo = $_GET['q'] ?? '';\necho buscar($termo);\n")
          .commit("wip 3")
          .done(),
      objectives: [
        { id: "soft", text: "Usar `git reset --soft HEAD~3`", check: (ctx) => used(ctx, /^git reset --soft HEAD~3/) },
        { id: "one", text: "Um único commit `adiciona filtro de busca` em cima da versão inicial", check: ({ repo }) => headCommit(repo)?.message === "adiciona filtro de busca" && repo.commits[headCommit(repo)!.parents[0]]?.message === "versão inicial" },
        { id: "content", text: "`busca.php` completo (com `buscar($termo)`) no commit", check: ({ repo }) => committedFile(repo, "busca.php")?.includes("buscar($termo)") === true && clean(repo) },
      ],
      hints: ["`git log --oneline` para ver os três wip. `git reset --soft HEAD~3`.", "`git status`: tudo verde na staging. `git commit -m \"adiciona filtro de busca\"`."],
      cheatsheet: ["git log --oneline", "git reset --soft HEAD~3", "git status", 'git commit -m "adiciona filtro de busca"'],
      xp: 100,
    },
    {
      id: "cherry-pick",
      title: "Só aquele commit",
      tagline: "Traga um commit específico de outra branch, sem o resto.",
      story: [
        "A `feature/dashboard` ainda não está pronta, mas **um** commit dela — `fix: formato de data` — corrige um bug que está incomodando todo mundo na `main`.",
        "Use `git cherry-pick <sha>` estando na `main` para copiar só esse commit. O dashboard continua na branch dele.",
      ],
      concept: {
        title: "Cherry-pick",
        points: [
          "Copia as mudanças de um commit para a branch atual, criando um novo commit (hash diferente).",
          "Útil para hotfixes isolados. Abusar gera duplicação de histórico — prefira integrar a branch inteira quando possível.",
        ],
      },
      setup: () =>
        sc()
          .file("util.php", "<?php\nfunction data($d) { return date('d/m/Y', $d); }\n")
          .commit("versão inicial")
          .switch("feature/dashboard", true)
          .file("dashboard.php", "<?php // dashboard em construção\n")
          .commit("inicia dashboard")
          .file("util.php", "<?php\nfunction data($d) { return date('d/m/Y H:i', $d); }\n")
          .commit("fix: formato de data")
          .file("dashboard.php", "<?php // dashboard em construção\n// gráficos\n")
          .commit("gráficos do dashboard")
          .switch("main")
          .done(),
      objectives: [
        { id: "pick", text: "A `main` tem o fix do formato de data", check: ({ repo }) => onBranch(repo, "main") && committedFile(repo, "util.php", "main")?.includes("H:i") === true && headCommit(repo)?.message === "fix: formato de data" },
        { id: "nodash", text: "A `main` **não** tem o `dashboard.php`", check: ({ repo }) => committedFile(repo, "dashboard.php", "main") === undefined },
        { id: "cp", text: "Usou `git cherry-pick`", check: (ctx) => used(ctx, /^git cherry-pick/) && clean(ctx.repo) },
      ],
      hints: ["`git log --oneline feature/dashboard` mostra os commits da outra branch.", "`git cherry-pick <hash do fix>`."],
      cheatsheet: ["git log --oneline feature/dashboard", "git cherry-pick <hash>", "git log --oneline"],
      xp: 90,
    },
    {
      id: "resgate",
      title: "Resgate com reflog",
      tagline: "Apagou a branch errada? O Git lembra de tudo.",
      story: [
        "Alguém rodou `git branch -D feature/importacao` achando que era lixo. Eram **dois dias de trabalho**. Pânico? Não: o Git guarda um diário de onde o HEAD esteve — o **reflog**.",
        "Use `git reflog` para encontrar o último commit da branch perdida (`importa planilha`) e recrie a branch `feature/importacao` apontando para ele.",
      ],
      concept: {
        title: "Reflog",
        points: [
          "`git reflog` lista cada lugar por onde HEAD passou, com o hash.",
          "Commits 'perdidos' continuam no repositório por semanas. Basta criar uma branch apontando para eles: `git branch nome <hash>`.",
          "Vale também para desfazer um `reset --hard` feito por engano.",
        ],
      },
      setup: () => {
        const r = sc()
          .file("README.md", "# Portal RPA\n")
          .commit("versão inicial")
          .switch("feature/importacao", true)
          .file("importar.php", "<?php // importa\n")
          .commit("inicia importação")
          .file("importar.php", "<?php // importa\n// lê planilha\n")
          .commit("importa planilha")
          .switch("main")
          .done();
        return G.branchDelete(r, "feature/importacao", true);
      },
      objectives: [
        { id: "reflog", text: "Consultar `git reflog`", check: (ctx) => used(ctx, /^git reflog/) },
        { id: "branch", text: "`feature/importacao` aponta para o commit `importa planilha`", check: ({ repo }) => hasBranch(repo, "feature/importacao") && repo.commits[repo.branches["feature/importacao"]]?.message === "importa planilha" },
        { id: "content", text: "O `importar.php` com 'lê planilha' está salvo na branch", check: ({ repo }) => committedFile(repo, "importar.php", "feature/importacao")?.includes("lê planilha") === true },
      ],
      hints: ["`git reflog` — procure a linha `commit: importa planilha` e copie o hash.", "`git branch feature/importacao <hash>` (ou `git switch -c feature/importacao <hash>`)."],
      cheatsheet: ["git reflog", "git branch feature/importacao <hash>", "git log --oneline feature/importacao"],
      xp: 110,
      badge: "resgate",
    },
  ],
};

void commitsOn;
