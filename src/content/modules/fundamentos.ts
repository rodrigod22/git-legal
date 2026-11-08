import type { Module } from "../types";
import { sc, commitCount, headCommit, committedFile, file, clean, used, commitsOn } from "../helpers";
import * as G from "@/engine/repo";

export const fundamentos: Module = {
  id: "fundamentos",
  title: "Fundamentos",
  subtitle: "As três áreas do Git",
  description: "Entenda de onde vem cada comando: pasta de trabalho, área de preparação e repositório.",
  color: "#3b82f6",
  icon: "sprout",
  missions: [
    {
      id: "primeiro-dia",
      title: "Primeiro dia na RPA",
      tagline: "Transforme uma pasta comum em um repositório Git e registre seu primeiro commit.",
      story: [
        "Bem-vindo à **RPA Tecnologia**! Você recebeu uma pasta vazia chamada `projeto-rpa` e a primeira tarefa é simples: colocar o projeto sob controle de versão.",
        "No Git, nada acontece por acaso. Primeiro você **inicializa** o repositório, depois **cria** um arquivo, **prepara** (stage) o que vai entrar no commit e, por fim, **commita** com uma mensagem clara.",
        "Crie um `README.md` com o nome do projeto e faça seu primeiro commit.",
      ],
      concept: {
        title: "As três áreas",
        diagram: "three-areas",
        points: [
          "**Working directory**: seus arquivos como estão no disco.",
          "**Staging area (index)**: a 'bandeja' do que vai entrar no próximo commit. `git add` coloca aqui.",
          "**Repositório**: a história permanente. `git commit` grava uma fotografia da bandeja.",
          "`git status` mostra em que área cada arquivo está. Use sempre que tiver dúvida.",
        ],
      },
      setup: () => sc("voce", false).file("index.php", "<?php\necho 'Portal RPA';\n").done(),
      objectives: [
        { id: "init", text: "Inicializar o repositório (`git init`)", check: ({ repo }) => repo.initialized },
        { id: "readme", text: "Criar o arquivo `README.md`", check: ({ repo }) => "README.md" in repo.workdir },
        { id: "status", text: "Consultar o estado com `git status`", check: (ctx) => used(ctx, /^git status/) },
        { id: "commit", text: "Fazer um commit contendo o README.md", check: ({ repo }) => committedFile(repo, "README.md") !== undefined },
      ],
      hints: [
        "Tudo começa com `git init`. Depois crie o arquivo: `echo \"# Portal RPA\" > README.md`.",
        "`git status` vai mostrar o README como *untracked*. Para prepará-lo: `git add README.md`.",
        "Finalize com `git commit -m \"primeiro commit\"`. A mensagem vai entre aspas.",
      ],
      cheatsheet: ["git init", 'echo "# Portal RPA" > README.md', "git status", "git add README.md", 'git commit -m "primeiro commit"'],
      xp: 60,
      badge: "first-commit",
    },
    {
      id: "ciclo-de-vida",
      title: "Um commit, uma intenção",
      tagline: "Aprenda a separar mudanças em commits pequenos e com propósito.",
      story: [
        "Você alterou dois arquivos: corrigiu um erro de digitação no `README.md` e criou a página `contato.php`. São duas mudanças **sem relação** — e na RPA cada commit conta uma única história.",
        "Faça **dois commits separados**: um só com `contato.php` e outro só com o `README.md`. A ordem não importa, mas a separação sim.",
        "Dica de ouro: `git add` aceita o nome de um arquivo específico. Você escolhe o que entra na bandeja.",
      ],
      concept: {
        title: "Commits pequenos",
        points: [
          "Um commit = uma mudança coerente. Fica fácil de revisar, de reverter e de entender no `git log`.",
          "`git add <arquivo>` prepara só aquele arquivo; `git add .` prepara tudo (use com cuidado).",
          "Mensagens no imperativo e específicas: `corrige link do rodapé`, não `ajustes`.",
        ],
      },
      setup: () =>
        sc()
          .file("README.md", "# Portal RPA\n\nSitema interno da RPA Tecnologia.\n")
          .file("index.php", "<?php\necho 'Portal RPA';\n")
          .commit("primeiro commit")
          .file("README.md", "# Portal RPA\n\nSistema interno da RPA Tecnologia.\n")
          .file("contato.php", "<?php\necho 'Fale conosco';\n")
          .done(),
      objectives: [
        {
          id: "c1",
          text: "Um commit que adiciona apenas `contato.php`",
          check: ({ repo }) =>
            commitsOn(repo, "HEAD").some((c) => {
              const p = c.parents[0] ? repo.commits[c.parents[0]].tree : {};
              return "contato.php" in c.tree && !("contato.php" in p) && c.tree["README.md"] === p["README.md"];
            }),
        },
        {
          id: "c2",
          text: "Um commit que corrige apenas o `README.md`",
          check: ({ repo }) =>
            commitsOn(repo, "HEAD").some((c) => {
              const p = c.parents[0] ? repo.commits[c.parents[0]].tree : {};
              return c.tree["README.md"] !== p["README.md"] && (c.tree["contato.php"] ?? null) === (p["contato.php"] ?? null) && c.parents.length === 1;
            }),
        },
        { id: "clean", text: "Terminar com a árvore limpa (nada pendente)", check: ({ repo }) => clean(repo) && commitCount(repo) >= 3 },
      ],
      hints: [
        "Rode `git status` para ver os dois arquivos pendentes. Prepare só um: `git add contato.php`.",
        "Commite: `git commit -m \"adiciona página de contato\"`. Depois `git add README.md` e outro commit.",
        "`git log --oneline` mostra os três commits em sequência.",
      ],
      cheatsheet: ["git status", "git add contato.php", 'git commit -m "adiciona página de contato"', "git add README.md", 'git commit -m "corrige digitação no README"', "git log --oneline"],
      xp: 70,
    },
    {
      id: "investigacao",
      title: "Quem mexeu no config?",
      tagline: "Use o histórico para investigar e corrigir um bug.",
      story: [
        "O portal parou de conectar no banco. Alguém mudou a porta no `config.php` em algum commit recente. Sua missão de detetive: **descubra qual commit** fez isso com `git log` e `git show`.",
        "Depois, corrija a porta de volta para `3306` e commite com uma mensagem que comece com `fix:`.",
      ],
      concept: {
        title: "Lendo a história",
        points: [
          "`git log --oneline` lista commits de forma compacta; `git log` mostra autor, data e mensagem.",
          "`git show <sha>` exibe o que um commit mudou (o diff). Bastam os 7 primeiros caracteres do hash, e também vale uma referência como `HEAD~1`, o commit anterior ao atual.",
          "`git diff` compara pasta de trabalho × staging; `git diff --staged` compara staging × último commit.",
          "Na RPA, commit que corrige um bug começa com `fix:`. Assim, no `git log --oneline`, dá para achar as correções de relance e saber o que entrou de novo e o que foi conserto.",
        ],
      },
      setup: () =>
        sc()
          .file("README.md", "# Portal RPA\n")
          .file("config.php", "<?php\n$db_host = 'localhost';\n$db_port = 3306;\n")
          .commit("primeiro commit")
          .file("index.php", "<?php\nrequire 'config.php';\n")
          .commit("adiciona index")
          .file("config.php", "<?php\n$db_host = 'localhost';\n$db_port = 3307;\n")
          .commit("ajusta configuração", "carlos")
          .file("style.css", "body { font-family: sans-serif; }\n")
          .commit("adiciona estilos", "ana")
          .done(),
      objectives: [
        { id: "log", text: "Consultar o histórico com `git log`", check: (ctx) => used(ctx, /^git log/) },
        {
          id: "show",
          text: "Inspecionar o commit culpado com `git show`",
          check: (ctx) => {
            const culprit = commitsOn(ctx.repo, "HEAD").find((c) => c.message === "ajusta configuração");
            return !!culprit && ctx.shown.includes(culprit.sha);
          },
        },
        { id: "fix", text: "Commit começando com `fix:` que volta a porta para 3306", check: ({ repo }) => !!headCommit(repo) && /^fix:/i.test(headCommit(repo)!.message) && committedFile(repo, "config.php")?.includes("3306") === true },
        { id: "clean", text: "Árvore limpa no final", check: ({ repo }) => clean(repo) && file(repo, "config.php")?.includes("3306") === true },
      ],
      hints: [
        "`git log --oneline` mostra 4 commits. O suspeito tem mensagem 'ajusta configuração'.",
        "Copie os 7 caracteres do hash dele e rode `git show <hash>` (ou `git show HEAD~1`, já que ele é o penúltimo); verá `-3306` e `+3307`.",
        "Para corrigir: `edit config.php` (ou `echo` com o conteúdo completo), depois `git add config.php` e `git commit -m \"fix: porta do banco\"`.",
      ],
      cheatsheet: ["git log --oneline", "git show <hash>", "edit config.php", "git add config.php", 'git commit -m "fix: porta do banco de volta para 3306"'],
      xp: 80,
    },
  ],
};

void G;
