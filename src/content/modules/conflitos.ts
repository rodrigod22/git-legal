import type { Module } from "../types";
import { sc, onBranch, committedFile, clean, happened, headCommit, isAncestor, noConflicts, noMarkers, includesAll, used, isLinear, hasMergeCommit } from "../helpers";

export const conflitos: Module = {
  id: "conflitos",
  title: "Conflitos",
  subtitle: "Quando duas pessoas mudam a mesma linha",
  description: "Entenda a anatomia de um conflito, resolva com segurança, aborte quando precisar e enfrente o chefão.",
  color: "#ef4444",
  icon: "flame",
  missions: [
    {
      id: "primeiro-conflito",
      title: "Anatomia de um conflito",
      tagline: "Os dois lados mexeram na mesma linha. Agora é com você.",
      story: [
        "Você mudou o título do `README.md` na `feature/titulo` para **\"Portal RPA — Intranet\"**. Ao mesmo tempo, o Carlos mudou a mesma linha na `main` para **\"Portal RPA v2\"**. O Git não tem como decidir sozinho.",
        "Faça o merge, leia os marcadores `<<<<<<<`, `=======`, `>>>>>>>` e resolva deixando o título **\"Portal RPA v2 — Intranet\"** (juntando os dois). Depois `git add` e `git commit`.",
        "Respire: conflito não é erro. É o Git pedindo uma decisão humana.",
      ],
      concept: {
        title: "Os marcadores",
        diagram: "conflict",
        points: [
          "`<<<<<<< HEAD` … `=======` é o **seu lado** (a branch onde você está).",
          "`=======` … `>>>>>>> outra` é o **lado que está chegando**.",
          "Resolver = editar o arquivo até ficar do jeito certo **e apagar os três marcadores**.",
          "Depois: `git add <arquivo>` (marca como resolvido) e `git commit` (fecha o merge).",
          "**Atenção:** no Git real, `git add` aceita o arquivo mesmo com marcadores, e eles vão parar no commit. O Dojo bloqueia para proteger você. Fora daqui, confira o arquivo antes do `git add`.",
        ],
      },
      setup: () =>
        sc()
          .file("README.md", "# Portal RPA\n\nSistema interno.\n")
          .commit("primeiro commit")
          .switch("feature/titulo", true)
          .file("README.md", "# Portal RPA — Intranet\n\nSistema interno.\n")
          .commit("novo título")
          .switch("main")
          .file("README.md", "# Portal RPA v2\n\nSistema interno.\n")
          .commit("versão 2 no título", "carlos")
          .done(),
      objectives: [
        { id: "conflict", text: "Provocar o conflito com `git merge feature/titulo`", check: (ctx) => happened(ctx, "conflict") },
        { id: "resolve", text: "Editar o README até ficar `# Portal RPA v2 — Intranet`, sem marcadores", check: ({ repo }) => noMarkers(repo.workdir["README.md"]) && repo.workdir["README.md"]?.startsWith("# Portal RPA v2 — Intranet") === true },
        { id: "commit", text: "Finalizar o merge (`git add` + `git commit`)", check: ({ repo }) => noConflicts(repo) && (headCommit(repo)?.parents.length ?? 0) === 2 && committedFile(repo, "README.md")?.startsWith("# Portal RPA v2 — Intranet") === true },
      ],
      hints: [
        "`git merge feature/titulo` → CONFLICT. `git status` mostra o arquivo em 'Unmerged paths'.",
        "`edit README.md`: use os botões do editor ou escreva a linha final à mão e apague `<<<<<<<`, `=======`, `>>>>>>>`.",
        "`git add README.md` e `git commit -m \"merge feature/titulo\"`.",
      ],
      cheatsheet: ["git merge feature/titulo", "git status", "edit README.md", "git add README.md", 'git commit -m "merge: título unificado"'],
      xp: 100,
    },
    {
      id: "escolhendo-lado",
      title: "Escolhendo um lado",
      tagline: "Nem sempre se junta: às vezes um lado está certo e o outro, errado.",
      story: [
        "A `feature/cache` muda duas coisas no `config.php`: adiciona `$cache = true` (bom) e, por engano, muda `$db_port` para `3307` (ruim). Na `main`, a Ana já corrigiu a porta para **3306** — a versão da main está certa.",
        "Faça o merge na `main`. No conflito, mantenha a porta **3306** da main e a linha `$cache = true` da feature. Nada de aceitar tudo de um lado só!",
      ],
      concept: {
        title: "Resolver é decidir",
        points: [
          "Leia os dois lados e pergunte: qual é a intenção de cada mudança?",
          "Pode-se manter um lado, o outro, os dois ou escrever algo novo. O Git aceita qualquer conteúdo final.",
          "Quando não souber, pergunte a quem fez o outro commit (`git log` mostra o autor).",
        ],
      },
      setup: () =>
        sc()
          .file("config.php", "<?php\n$db_host = 'localhost';\n$db_port = 3307;\n")
          .commit("primeiro commit")
          .switch("feature/cache", true)
          .file("config.php", "<?php\n$db_host = 'localhost';\n$db_port = 3307;\n$cache = true;\n")
          .commit("habilita cache")
          .switch("main")
          .file("config.php", "<?php\n$db_host = 'localhost';\n$db_port = 3306;\n")
          .commit("fix: porta do banco", "ana")
          .done(),
      objectives: [
        { id: "conflict", text: "Provocar o conflito mesclando `feature/cache` na `main`", check: (ctx) => happened(ctx, "conflict") && onBranch(ctx.repo, "main") },
        { id: "content", text: "Resultado com `$db_port = 3306;` **e** `$cache = true;`", check: ({ repo }) => noMarkers(repo.workdir["config.php"]) && includesAll(repo.workdir["config.php"], "$db_port = 3306;", "$cache = true;") && !repo.workdir["config.php"]!.includes("3307") },
        { id: "commit", text: "Merge concluído com commit", check: ({ repo }) => noConflicts(repo) && isAncestor(repo, "feature/cache", "main") && includesAll(committedFile(repo, "config.php", "main"), "3306", "$cache = true;") },
      ],
      hints: [
        "`git merge feature/cache`. Abra com `edit config.php`.",
        "No bloco de conflito, a linha `$db_port = 3306;` vem do HEAD (main) e `$cache = true;` da feature. Escreva as duas, sem o 3307.",
        "`git add config.php` e `git commit -m \"merge feature/cache mantendo porta correta\"`.",
      ],
      cheatsheet: ["git merge feature/cache", "edit config.php", "git add config.php", 'git commit -m "merge: cache + porta correta"'],
      xp: 110,
    },
    {
      id: "abortar",
      title: "Abortar com elegância",
      tagline: "Começou um merge errado? Volte atrás sem medo.",
      story: [
        "Você rodou `git merge spike/experimental` por engano e caiu num conflito enorme — aquela branch nem deveria ser integrada. O jeito certo é **abortar** o merge, voltar ao estado anterior e fazer o merge correto: `feature/pagamento`, que não gera conflito.",
        "Termine com a `main` contendo o pagamento e **sem nada** do experimento.",
      ],
      concept: {
        title: "git merge --abort",
        points: [
          "Durante um conflito, `git merge --abort` restaura exatamente o estado anterior ao merge.",
          "Funciona também para `git rebase --abort`, `git cherry-pick --abort` e `git revert --abort`.",
          "Antes de abortar, `git status` confirma que há um merge em andamento.",
        ],
      },
      setup: () =>
        sc()
          .file("index.php", "<?php\necho 'Portal RPA';\n")
          .file("README.md", "# Portal RPA\n")
          .commit("primeiro commit")
          .switch("spike/experimental", true)
          .file("index.php", "<?php\n// EXPERIMENTO: reescrita total\necho 'XPTO';\n")
          .file("README.md", "# XPTO\n")
          .commit("experimento maluco")
          .switch("main")
          .file("index.php", "<?php\necho 'Portal RPA';\n// rodapé\n")
          .file("README.md", "# Portal RPA\nDocumentação.\n")
          .commit("rodapé e docs")
          .switch("feature/pagamento", true)
          .file("pagamento.php", "<?php // pagamento\n")
          .commit("adiciona pagamento")
          .switch("main")
          .done(),
      objectives: [
        { id: "conflict", text: "Cair no conflito ao mesclar `spike/experimental`", check: (ctx) => ctx.commands.some((c) => /^git merge\s+spike\/experimental/.test(c)) && happened(ctx, "conflict") },
        { id: "abort", text: "Abortar com `git merge --abort`", check: (ctx) => used(ctx, /^git merge --abort/) && !ctx.repo.inProgress },
        { id: "right", text: "Mesclar `feature/pagamento` na `main`", check: ({ repo }) => onBranch(repo, "main") && committedFile(repo, "pagamento.php", "main") !== undefined },
        { id: "noxpto", text: "A `main` não contém nada do experimento (`XPTO`)", check: ({ repo }) => clean(repo) && !committedFile(repo, "index.php", "main")?.includes("XPTO") && !isAncestor(repo, "spike/experimental", "main") },
      ],
      hints: ["`git merge spike/experimental` (sim, de propósito). Veja o estrago com `git status`.", "`git merge --abort`. `git status` deve voltar a 'working tree clean'.", "`git merge feature/pagamento` — fast-forward limpo."],
      cheatsheet: ["git merge spike/experimental", "git status", "git merge --abort", "git merge feature/pagamento"],
      xp: 90,
    },
    {
      id: "conflito-no-rebase",
      title: "Conflito no rebase",
      tagline: "Reescreva sua branch em cima da main — e resolva o que travar.",
      story: [
        "Na RPA preferimos histórico **linear**. Em vez de mesclar a `main` na sua feature, você faz `git rebase main`: seus commits são reaplicados um a um em cima da main.",
        "A `feature/menu` tem 2 commits. O segundo mexe na mesma linha do `menu.php` que o Carlos alterou na `main`. O rebase vai parar nele. Resolva mantendo **os dois itens de menu** (Relatórios e Configurações), `git add`, e `git rebase --continue`.",
      ],
      concept: {
        title: "Rebase",
        diagram: "rebase",
        points: [
          "`git rebase main` (estando na feature) pega os commits da feature e os reaplica depois do último commit da main.",
          "O resultado é linear: parece que você começou a trabalhar hoje.",
          "Se um commit conflitar, o rebase para. Resolva, `git add`, `git rebase --continue`. Para desistir: `git rebase --abort`.",
          "Regra de ouro: **nunca** faça rebase de commits que já foram enviados para o remoto e outras pessoas usam.",
        ],
      },
      setup: () =>
        sc()
          .file("menu.php", "<?php\n$menu = [\n  'Início',\n];\n")
          .commit("primeiro commit")
          .switch("feature/menu", true)
          .file("menu.php", "<?php\n$menu = [\n  'Início',\n];\n// menu dinâmico\n")
          .commit("comentário do menu")
          .file("menu.php", "<?php\n$menu = [\n  'Início',\n  'Relatórios',\n];\n// menu dinâmico\n")
          .commit("adiciona Relatórios ao menu")
          .switch("main")
          .file("menu.php", "<?php\n$menu = [\n  'Início',\n  'Configurações',\n];\n")
          .commit("adiciona Configurações ao menu", "carlos")
          .switch("feature/menu")
          .done(),
      objectives: [
        { id: "rebase", text: "Iniciar `git rebase main` na `feature/menu` e cair no conflito", check: (ctx) => used(ctx, /^git rebase main/) && happened(ctx, "conflict") },
        { id: "resolve", text: "`menu.php` com `'Relatórios'` **e** `'Configurações'`, sem marcadores", check: ({ repo }) => noMarkers(repo.workdir["menu.php"]) && includesAll(repo.workdir["menu.php"], "'Relatórios'", "'Configurações'") },
        { id: "continue", text: "Concluir com `git rebase --continue`", check: ({ repo }) => !repo.rebase && noConflicts(repo) && onBranch(repo, "feature/menu") },
        { id: "linear", text: "Histórico linear: `feature/menu` contém a `main` e não tem commit de merge", check: ({ repo }) => isAncestor(repo, "main", "feature/menu") && isLinear(repo, "feature/menu") && !hasMergeCommit(repo, "feature/menu") && includesAll(committedFile(repo, "menu.php", "feature/menu"), "'Relatórios'", "'Configurações'") },
      ],
      hints: [
        "`git rebase main`. O primeiro commit passa; o segundo para com CONFLICT.",
        "`edit menu.php`: deixe as duas linhas `'Relatórios',` e `'Configurações',` dentro do array e remova os marcadores.",
        "`git add menu.php` e `git rebase --continue`. Veja o grafo: ficou uma linha reta.",
      ],
      cheatsheet: ["git rebase main", "git status", "edit menu.php", "git add menu.php", "git rebase --continue", "git log --oneline --graph"],
      xp: 130,
    },
    {
      id: "chefao-conflitos",
      title: "CHEFÃO: Sexta-feira de deploy",
      tagline: "Três arquivos em conflito, três regras diferentes. Sem pânico.",
      boss: true,
      story: [
        "É sexta, 17h. A `release/sprint-12` precisa entrar na `main` e **três arquivos** conflitam. O time combinou as regras:",
        "1. `CHANGELOG.md`: manter **as duas** entradas (a da main e a da release).",
        "2. `config.php`: vale a versão da **main** (`$timeout = 30;`) — a release tinha um valor de teste.",
        "3. `style.css`: vale a versão da **release** (`--primary: #0ea5e9;`), aprovada pelo design.",
        "Resolva os três, finalize o merge e deixe a árvore limpa. Vença o chefão e ganhe o título de **Pacificador**.",
      ],
      setup: () =>
        sc()
          .file("CHANGELOG.md", "# Changelog\n\n## 1.0.0\n- versão inicial\n")
          .file("config.php", "<?php\n$timeout = 10;\n")
          .file("style.css", ":root { --primary: #f05032; }\n")
          .commit("versão 1.0.0")
          .switch("release/sprint-12", true)
          .file("CHANGELOG.md", "# Changelog\n\n## 1.1.0\n- exportação em PDF\n\n## 1.0.0\n- versão inicial\n")
          .file("config.php", "<?php\n$timeout = 999; // teste\n")
          .file("style.css", ":root { --primary: #0ea5e9; }\n")
          .commit("sprint 12: PDF, timeout de teste, nova cor")
          .switch("main")
          .file("CHANGELOG.md", "# Changelog\n\n## 1.0.1\n- hotfix de login\n\n## 1.0.0\n- versão inicial\n")
          .file("config.php", "<?php\n$timeout = 30;\n")
          .file("style.css", ":root { --primary: #e11d48; }\n")
          .commit("hotfix 1.0.1 e ajustes", "ana")
          .done(),
      objectives: [
        { id: "conflict", text: "Mesclar `release/sprint-12` na `main` e enfrentar os 3 conflitos", check: (ctx) => happened(ctx, "conflict") && onBranch(ctx.repo, "main") },
        { id: "changelog", text: "`CHANGELOG.md` com `1.1.0` **e** `1.0.1`", check: ({ repo }) => noMarkers(repo.workdir["CHANGELOG.md"]) && includesAll(repo.workdir["CHANGELOG.md"], "## 1.1.0", "## 1.0.1", "## 1.0.0") },
        { id: "config", text: "`config.php` com `$timeout = 30;`", check: ({ repo }) => noMarkers(repo.workdir["config.php"]) && repo.workdir["config.php"]?.includes("$timeout = 30;") === true && !repo.workdir["config.php"]?.includes("999") },
        { id: "css", text: "`style.css` com `--primary: #0ea5e9;`", check: ({ repo }) => noMarkers(repo.workdir["style.css"]) && repo.workdir["style.css"]?.includes("#0ea5e9") === true && !repo.workdir["style.css"]?.includes("#e11d48") },
        { id: "done", text: "Merge finalizado, árvore limpa", check: ({ repo }) => clean(repo) && noConflicts(repo) && (headCommit(repo)?.parents.length ?? 0) === 2 && includesAll(committedFile(repo, "CHANGELOG.md"), "1.1.0", "1.0.1") },
      ],
      hints: [
        "`git merge release/sprint-12`. `git status` lista os três arquivos.",
        "No editor, cada bloco tem botões: 'Manter atual' (main), 'Manter entrada' (release) e 'Manter ambos'. Use o certo para cada arquivo.",
        "`git add .` quando os três estiverem sem marcadores e `git commit -m \"merge release/sprint-12\"`.",
      ],
      cheatsheet: ["git merge release/sprint-12", "git status", "edit CHANGELOG.md", "edit config.php", "edit style.css", "git add .", 'git commit -m "merge: release sprint 12"'],
      xp: 200,
      badge: "pacificador",
    },
  ],
};
