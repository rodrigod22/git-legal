import type { Module } from "../types";
import { sc, onBranch, committedFile, clean, happened, isLinear, noConflicts, noMarkers, includesAll, used, remoteHas, pushedUpToDate, countCommitsBetween, hasBranch } from "../helpers";
import * as G from "@/engine/repo";

const baseRemote = () =>
  sc()
    .file("README.md", "# Portal RPA\n")
    .file("index.php", "<?php\necho 'Portal RPA';\n")
    .commit("versão inicial")
    .remote()
    .push("main");

export const trunk: Module = {
  id: "trunk",
  title: "Trunk-based na RPA",
  subtitle: "O fluxo oficial do time",
  description: "Commits pequenos na main, pull --rebase antes do push, branches curtíssimas e revert em vez de reset.",
  color: "#f97316",
  icon: "rocket",
  missions: [
    {
      id: "push-rejeitado",
      title: "Push rejeitado",
      tagline: "Alguém chegou antes. Integre e envie de novo.",
      story: [
        "Na RPA trabalhamos **trunk-based**: todo mundo commita direto na `main`, em commits pequenos, várias vezes por dia. O segredo para isso funcionar é um ritual: **antes de `push`, `pull --rebase`**.",
        "Faça um commit adicionando `sobre.php` e tente `git push`. A **Ana** vai ter enviado um commit antes de você e o remoto vai rejeitar. Resolva com `git pull --rebase` e envie de novo.",
      ],
      concept: {
        title: "O ritual do trunk-based",
        diagram: "trunk",
        points: [
          "`git pull --rebase` traz os commits do remoto e **reaplica os seus por cima** — histórico linear, sem commits de merge inúteis.",
          "`git push` só é aceito se o remoto for ancestral do seu commit (fast-forward). Se não for: *rejected, fetch first*.",
          "Commits pequenos + integração frequente = conflitos raros e pequenos.",
          "`git status` mostra 'ahead'/'behind' em relação a `origin/main`. Use antes do push.",
        ],
      },
      setup: () => baseRemote().done(),
      triggers: [
        {
          id: "ana-push",
          when: (ctx) => ctx.events.includes("commit"),
          apply: (repo) => G.remoteCommit(repo, "main", "ana", "ajusta título do index", (t) => ({ ...t, "index.php": "<?php\necho 'Portal RPA — Intranet';\n" })),
          message: "Ana acabou de enviar um commit para origin/main: “ajusta título do index”",
          actor: "ana",
        },
      ],
      objectives: [
        { id: "commit", text: "Commitar `sobre.php` na `main`", check: ({ repo }) => committedFile(repo, "sobre.php", "main") !== undefined },
        { id: "rejected", text: "Ter o `git push` rejeitado (fetch first)", check: (ctx) => ctx.commands.some((c, i) => /^git push/.test(c) && ctx.events[i] === "error") },
        { id: "rebase", text: "Integrar com `git pull --rebase`", check: (ctx) => used(ctx, /^git pull (--rebase|-r)/) && isLinear(ctx.repo, "main") },
        { id: "push", text: "Enviar com sucesso: `origin/main` igual à sua `main`", check: ({ repo }) => pushedUpToDate(repo) && remoteHas(repo, "main", /sobre|Sobre/) && remoteHas(repo, "main", /ajusta título/) && isLinear(repo, "main") },
      ],
      hints: [
        "`echo \"<?php // sobre\" > sobre.php`, `git add .`, `git commit -m \"adiciona página sobre\"`. Veja a notificação da Ana.",
        "`git push` → rejected. Então `git pull --rebase`.",
        "`git push` de novo. `git status` deve dizer 'up to date with origin/main'.",
      ],
      cheatsheet: ['echo "<?php // sobre" > sobre.php', "git add .", 'git commit -m "adiciona página sobre"', "git push", "git pull --rebase", "git push", "git status"],
      xp: 110,
    },
    {
      id: "ritmo-de-integracao",
      title: "Ritmo de integração",
      tagline: "Três commits pequenos, três pushes. Colegas trabalhando ao mesmo tempo.",
      story: [
        "Hoje você vai implementar o **rodapé** em três passos: `rodape.php` (estrutura), incluir o rodapé no `index.php`, e o CSS em `style.css`. Cada passo é um commit e **cada commit vai para o remoto** logo em seguida.",
        "Enquanto isso, Ana e Carlos também estão enviando. Mantenha o ritmo: commit → `pull --rebase` → push. No final, `origin/main` deve ter seus 3 commits em histórico linear.",
      ],
      concept: {
        title: "Integração contínua de verdade",
        points: [
          "Quanto mais tempo um commit fica só na sua máquina, maior a chance de conflito.",
          "Pequeno e frequente vence grande e raro. Se o commit compila e não quebra, envie.",
          "`git log --oneline origin/main` mostra o que o remoto já tem.",
        ],
      },
      setup: () => baseRemote().file("style.css", "body { margin: 0; }\n").commit("estilos base").push("main").done(),
      triggers: [
        {
          id: "ana-1",
          when: (ctx) => ctx.events.filter((e) => e === "push").length >= 1,
          apply: (repo) => G.remoteCommit(repo, "main", "ana", "adiciona favicon", (t) => ({ ...t, "favicon.txt": "icone\n" })),
          message: "Ana enviou “adiciona favicon” para origin/main",
          actor: "ana",
        },
        {
          id: "carlos-1",
          when: (ctx) => ctx.events.filter((e) => e === "push").length >= 2,
          apply: (repo) => G.remoteCommit(repo, "main", "carlos", "corrige README", (t) => ({ ...t, "README.md": "# Portal RPA\n\nIntranet da RPA Tecnologia.\n" })),
          message: "Carlos enviou “corrige README” para origin/main",
          actor: "carlos",
        },
      ],
      objectives: [
        { id: "p1", text: "Commit + push de `rodape.php`", check: ({ repo }) => remoteHas(repo, "main", /rodap/i) && !!repo.remote?.commits[repo.remote.branches.main]?.tree["rodape.php"] },
        { id: "p2", text: "Commit + push do `index.php` incluindo o rodapé", check: ({ repo }) => (repo.remote?.commits[repo.remote.branches.main]?.tree["index.php"] ?? "").includes("rodape") },
        { id: "p3", text: "Commit + push do CSS do rodapé", check: ({ repo }) => (repo.remote?.commits[repo.remote.branches.main]?.tree["style.css"] ?? "").includes("footer") },
        { id: "linear", text: "3+ pushes, histórico linear e integrando os commits da Ana e do Carlos", check: (ctx) => ctx.events.filter((e) => e === "push").length >= 3 && isLinear(ctx.repo, "main") && pushedUpToDate(ctx.repo) && remoteHas(ctx.repo, "main", /favicon/) && remoteHas(ctx.repo, "main", /corrige README/) },
      ],
      hints: [
        "Passo 1: `echo \"<?php // rodapé\" > rodape.php`, add, commit, `git push`.",
        "Passo 2: `edit index.php` e adicione `require 'rodape.php';`. Commit. Antes do push, `git pull --rebase` (a Ana enviou algo).",
        "Passo 3: `echo \"footer { padding: 16px; }\" >> style.css`, commit, `git pull --rebase`, `git push`.",
      ],
      cheatsheet: ["git add .", 'git commit -m "descreva o passo"', "git pull --rebase", "git push", "git log --oneline origin/main"],
      xp: 130,
    },
    {
      id: "conflito-no-pull",
      title: "Conflito no pull",
      tagline: "O rebase do pull parou. Resolva e siga.",
      story: [
        "Você e o Carlos alteraram a **mesma linha** do `index.php`: você trocou o texto para `'Portal RPA 2026'`; ele, para `'Portal RPA — Intranet'`. Ele enviou primeiro.",
        "Faça `git pull --rebase`, resolva o conflito com o texto final **`'Portal RPA 2026 — Intranet'`**, `git add`, `git rebase --continue` e `git push`.",
      ],
      concept: {
        title: "Conflito durante o pull --rebase",
        points: [
          "É o mesmo conflito do merge, só que o 'HEAD' agora é o **remoto** e o 'lado que chega' é o **seu commit**.",
          "Os marcadores são os mesmos. Resolva, `git add`, e `git rebase --continue`.",
          "Se tudo der errado, `git rebase --abort` volta ao estado anterior ao pull.",
        ],
      },
      setup: () =>
        baseRemote()
          .file("index.php", "<?php\necho 'Portal RPA 2026';\n")
          .commit("atualiza ano")
          .remoteCommit("main", "carlos", "muda título para Intranet", (t) => ({ ...t, "index.php": "<?php\necho 'Portal RPA — Intranet';\n" }))
          .done(),
      objectives: [
        { id: "pull", text: "`git pull --rebase` e cair no conflito", check: (ctx) => used(ctx, /^git pull (--rebase|-r)/) && happened(ctx, "conflict") },
        { id: "resolve", text: "`index.php` com `'Portal RPA 2026 — Intranet'`, sem marcadores", check: ({ repo }) => noMarkers(repo.workdir["index.php"]) && repo.workdir["index.php"]?.includes("'Portal RPA 2026 — Intranet'") === true },
        { id: "continue", text: "`git rebase --continue` concluído", check: ({ repo }) => !repo.rebase && noConflicts(repo) && onBranch(repo, "main") },
        { id: "push", text: "Push aceito, `origin/main` atualizado e linear", check: ({ repo }) => pushedUpToDate(repo) && isLinear(repo, "main") && (repo.remote?.commits[repo.remote.branches.main]?.tree["index.php"] ?? "").includes("2026 — Intranet") },
      ],
      hints: ["`git pull --rebase` → CONFLICT em index.php.", "`edit index.php`: escreva `echo 'Portal RPA 2026 — Intranet';` e apague os marcadores.", "`git add index.php`, `git rebase --continue`, `git push`."],
      cheatsheet: ["git pull --rebase", "edit index.php", "git add index.php", "git rebase --continue", "git push"],
      xp: 140,
    },
    {
      id: "branch-curta",
      title: "Branch de vida curta",
      tagline: "Quando precisar de uma branch, que ela dure horas, não semanas.",
      story: [
        "Uma mudança um pouco maior: o **modo escuro**. No trunk-based ainda se usa branch, mas **curta**: nasce, recebe 1–3 commits, é atualizada com a main, integrada por fast-forward e apagada no mesmo dia.",
        "Crie `feat/modo-escuro` e commite o `tema.css`. Para atualizar a branch, primeiro traga a `main` em dia com `git switch main` e `git pull`. Depois volte para a branch e rode `git rebase main`.",
        "Por fim, integre na `main` por fast-forward, faça push e apague a branch.",
      ],
      concept: {
        title: "Branches curtas",
        points: [
          "Fluxo: `switch -c feat/x` → commits → `switch main` + `pull` → `switch feat/x` + `rebase main` → `switch main` + `merge feat/x` (ff) → `push` → `branch -d feat/x`.",
          "O resultado no remoto é indistinguível de commits feitos direto na main — e é isso que queremos.",
          "Se a branch está demorando dias, quebre a tarefa em partes menores.",
        ],
      },
      setup: () => baseRemote().done(),
      triggers: [
        {
          id: "ana-2",
          when: (ctx) => ctx.events.includes("branch"),
          apply: (repo) => G.remoteCommit(repo, "main", "ana", "adiciona página de ajuda", (t) => ({ ...t, "ajuda.php": "<?php // ajuda\n" })),
          message: "Ana enviou “adiciona página de ajuda” para origin/main",
          actor: "ana",
        },
      ],
      objectives: [
        { id: "branch", text: "Criar `feat/modo-escuro` e commitar `tema.css` nela", check: (ctx) => ctx.commands.some((c) => /^git (switch -c|checkout -b|branch) feat\/modo-escuro/.test(c)) && committedFile(ctx.repo, "tema.css", "main") !== undefined || (hasBranch(ctx.repo, "feat/modo-escuro") && committedFile(ctx.repo, "tema.css", "feat/modo-escuro") !== undefined) },
        { id: "update", text: "Atualizar a `main` com o commit da Ana (`git pull` na main)", check: ({ repo }) => committedFile(repo, "ajuda.php", "main") !== undefined },
        { id: "ff", text: "Integrar na `main` por fast-forward (sem commit de merge, linear)", check: ({ repo }) => committedFile(repo, "tema.css", "main") !== undefined && committedFile(repo, "ajuda.php", "main") !== undefined && isLinear(repo, "main") },
        { id: "push", text: "Push da `main` e apagar `feat/modo-escuro`", check: ({ repo }) => pushedUpToDate(repo) && !hasBranch(repo, "feat/modo-escuro") && clean(repo) && remoteHas(repo, "main", /tema|escuro/i) },
      ],
      hints: [
        "`git switch -c feat/modo-escuro`, `echo \":root { color-scheme: dark; }\" > tema.css`, add, commit.",
        "`git switch main`, `git pull` (traz o commit da Ana). `git switch feat/modo-escuro`, `git rebase main`.",
        "`git switch main`, `git merge feat/modo-escuro` (fast-forward), `git push`, `git branch -d feat/modo-escuro`.",
      ],
      cheatsheet: ["git switch -c feat/modo-escuro", 'echo ":root { color-scheme: dark; }" > tema.css', "git add .", 'git commit -m "modo escuro"', "git switch main", "git pull", "git switch feat/modo-escuro", "git rebase main", "git switch main", "git merge feat/modo-escuro", "git push", "git branch -d feat/modo-escuro"],
      xp: 150,
    },
    {
      id: "revert-em-producao",
      title: "Quebrou em produção",
      tagline: "Desfaça um commit já enviado sem reescrever a história.",
      story: [
        "O commit **“ativa novo gateway”** foi para `origin/main` e derrubou o pagamento em produção. Na `main` compartilhada é proibido `reset` e `push --force` — isso apagaria história que outras pessoas já têm.",
        "A solução certa: `git revert <commit>` cria um **novo commit** que desfaz as mudanças. Depois `git push`. A história fica intacta e auditável.",
      ],
      concept: {
        title: "Revert vs. reset",
        diagram: "revert",
        points: [
          "`git reset` **move** a branch para trás (apaga commits do histórico). Só para commits que ainda não saíram da sua máquina.",
          "`git revert` **adiciona** um commit inverso. Seguro para branches compartilhadas.",
          "Na RPA, `push --force` e `reset` na `main` são proibidos. O motivo: a `main` está na máquina de todo mundo. Se você reescreve o histórico do remoto, quem já tinha baixado os commits apagados fica com um repositório divergente, o próximo `pull` vira conflito e trabalho pode se perder. O `revert` corrige sem apagar nada.",
          "Se alguém sugerir `push --force` na `main`, chame o líder técnico antes.",
        ],
      },
      setup: () =>
        baseRemote()
          .file("pagamento.php", "<?php\n$gateway = 'antigo';\n")
          .commit("adiciona pagamento")
          .push("main")
          .file("pagamento.php", "<?php\n$gateway = 'novo';\n")
          .commit("ativa novo gateway")
          .push("main")
          .done(),
      objectives: [
        { id: "revert", text: "Criar um commit de revert do “ativa novo gateway”", check: ({ repo }) => committedFile(repo, "pagamento.php", "main")?.includes("'antigo'") === true && G.log(repo).some((e) => /^Revert/.test(e.commit.message)) },
        { id: "nohistory", text: "O commit original continua no histórico (não usou reset)", check: (ctx) => G.log(ctx.repo).some((e) => e.commit.message === "ativa novo gateway") && !used(ctx, /^git reset/) && !used(ctx, /^git push.*(-f|--force)/) },
        { id: "push", text: "Push do revert para `origin/main`", check: ({ repo }) => pushedUpToDate(repo) && remoteHas(repo, "main", /^Revert/) },
      ],
      hints: ["`git log --oneline` — o commit culpado é o HEAD. `git revert HEAD`.", "O revert já cria o commit. Confira `cat pagamento.php` e `git log --oneline`.", "`git push`."],
      cheatsheet: ["git log --oneline", "git revert HEAD", "cat pagamento.php", "git push"],
      xp: 120,
      badge: "trunk-hero",
    },
  ],
};

void countCommitsBetween;
void includesAll;
