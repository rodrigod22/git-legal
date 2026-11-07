import { describe, it, expect } from "vitest";
import * as G from "./repo";
import { execute } from "./commands";
import { merge3, hasConflictMarkers } from "./diff";
import type { Repo } from "./types";

function run(repo: Repo, ...cmds: string[]) {
  let r = repo;
  let last = { lines: [] as string[], ok: true, event: undefined as string | undefined };
  for (const c of cmds) {
    const res = execute(r, c);
    r = res.repo;
    last = { lines: res.lines, ok: res.ok, event: res.event };
  }
  return { repo: r, ...last };
}

function base(): Repo {
  return run(
    G.createRepo({ user: "voce" }),
    "git init",
    'echo "# Projeto RPA" > README.md',
    "git add README.md",
    'git commit -m "primeiro commit"',
  ).repo;
}

describe("merge3", () => {
  it("resolve alterações em linhas diferentes sem conflito", () => {
    const b = "a\nb\nc\n";
    const o = "A\nb\nc\n";
    const t = "a\nb\nC\n";
    expect(merge3(b, o, t)).toEqual({ text: "A\nb\nC\n", conflict: false, hunks: 0 });
  });
  it("gera marcadores quando os dois lados mudam a mesma linha", () => {
    const r = merge3("a\nb\nc\n", "a\nB1\nc\n", "a\nB2\nc\n", { ours: "main", theirs: "feature" });
    expect(r.conflict).toBe(true);
    expect(r.text).toBe("a\n<<<<<<< main\nB1\n=======\nB2\n>>>>>>> feature\nc\n");
    expect(hasConflictMarkers(r.text)).toBe(true);
  });
  it("aceita adições no fim dos dois lados como conflito", () => {
    const r = merge3("x\n", "x\ny\n", "x\nz\n");
    expect(r.conflict).toBe(true);
  });
});

describe("fluxo básico", () => {
  it("init, add, commit, status limpo", () => {
    const r = base();
    const s = G.status(r);
    expect(s.branch).toBe("main");
    expect(s.staged).toEqual([]);
    expect(s.untracked).toEqual([]);
    expect(Object.keys(r.commits)).toHaveLength(1);
  });
  it("recusa commit sem nada no stage", () => {
    const { ok, lines } = run(base(), 'echo "x" > a.txt', 'git commit -m "sem add"');
    expect(ok).toBe(false);
    expect(lines.join("\n")).toContain("git add");
  });
  it("explica quando o hash abreviado é curto demais", () => {
    const r = base();
    const res = run(r, `git show ${G.headSha(r)!.slice(0, 3)}`);
    expect(res.ok).toBe(false);
    expect(res.lines.join("\n")).toContain("pelo menos 4 caracteres");
  });
  it("resolve HEAD~1 e prefixos de sha", () => {
    const r = run(base(), 'echo "2" > b.txt', "git add .", 'git commit -m "segundo"').repo;
    const head = G.headSha(r)!;
    const parent = r.commits[head].parents[0];
    expect(G.resolve(r, "HEAD~1")).toBe(parent);
    expect(G.resolve(r, head.slice(0, 6))).toBe(head);
  });
});

describe("branches e merge", () => {
  it("fast-forward quando main não andou", () => {
    const res = run(base(), "git switch -c feature", 'echo "f" > f.txt', "git add .", 'git commit -m "feat"', "git switch main", "git merge feature");
    expect(res.event).toBe("fast-forward");
    expect(res.repo.branches.main).toBe(res.repo.branches.feature);
  });
  it("cria commit de merge quando as duas andaram sem conflito", () => {
    const res = run(
      base(),
      "git switch -c feature",
      'echo "f" > f.txt',
      "git add .",
      'git commit -m "feat"',
      "git switch main",
      'echo "m" > m.txt',
      "git add .",
      'git commit -m "main avançou"',
      "git merge feature",
    );
    expect(res.event).toBe("merge");
    const head = res.repo.commits[G.headSha(res.repo)!];
    expect(head.parents).toHaveLength(2);
    expect(res.repo.workdir["f.txt"]).toBe("f\n");
    expect(res.repo.workdir["m.txt"]).toBe("m\n");
  });
  it("detecta conflito, bloqueia commit e permite resolver", () => {
    const conflicted = run(
      base(),
      "git switch -c feature",
      'echo "# Projeto RPA - feature" > README.md',
      "git add .",
      'git commit -m "titulo feature"',
      "git switch main",
      'echo "# Projeto RPA - main" > README.md',
      "git add .",
      'git commit -m "titulo main"',
      "git merge feature",
    );
    expect(conflicted.event).toBe("conflict");
    expect(conflicted.repo.conflicts).toEqual(["README.md"]);
    expect(conflicted.repo.workdir["README.md"]).toContain("<<<<<<< main");
    expect(conflicted.repo.workdir["README.md"]).toContain(">>>>>>> feature");

    const blocked = run(conflicted.repo, 'git commit -m "tentando"');
    expect(blocked.ok).toBe(false);

    const addWithMarkers = run(conflicted.repo, "git add README.md");
    expect(addWithMarkers.ok).toBe(false);
    expect(addWithMarkers.lines.join("")).toContain("marcadores");

    const fixed = G.writeFile(conflicted.repo, "README.md", "# Projeto RPA - unificado\n");
    const done = run(fixed, "git add README.md", 'git commit -m "resolve conflito"');
    expect(done.ok).toBe(true);
    expect(done.event).toBe("merge");
    expect(done.repo.conflicts).toEqual([]);
    expect(done.repo.inProgress).toBeNull();
    expect(done.repo.commits[G.headSha(done.repo)!].parents).toHaveLength(2);
  });
  it("merge --abort restaura a árvore", () => {
    const conflicted = run(
      base(),
      "git switch -c feature",
      'echo "A" > README.md',
      "git add .",
      'git commit -m "A"',
      "git switch main",
      'echo "B" > README.md',
      "git add .",
      'git commit -m "B"',
      "git merge feature",
    );
    const aborted = run(conflicted.repo, "git merge --abort");
    expect(aborted.repo.workdir["README.md"]).toBe("B\n");
    expect(aborted.repo.conflicts).toEqual([]);
  });
  it("impede apagar branch não mesclada sem -D", () => {
    const r = run(base(), "git switch -c feature", 'echo "f" > f.txt', "git add .", 'git commit -m "feat"', "git switch main").repo;
    expect(run(r, "git branch -d feature").ok).toBe(false);
    expect(run(r, "git branch -D feature").ok).toBe(true);
  });
  describe("criar branch a partir de um ponto de partida", () => {
    function doisCommits() {
      const r = run(base(), 'echo "2" > b.txt', "git add .", 'git commit -m "segundo"').repo;
      return { repo: r, primeiro: r.commits[G.headSha(r)!].parents[0] };
    }
    it("git switch -c nome <hash> nasce no commit informado, não no HEAD", () => {
      const { repo, primeiro } = doisCommits();
      const res = run(repo, `git switch -c resgate ${primeiro.slice(0, 7)}`);
      expect(res.ok).toBe(true);
      expect(res.repo.branches.resgate).toBe(primeiro);
      expect(G.currentBranch(res.repo)).toBe("resgate");
      expect(res.repo.workdir["b.txt"]).toBeUndefined();
    });
    it("git checkout -b nome <ref> aceita referências relativas", () => {
      const { repo, primeiro } = doisCommits();
      const res = run(repo, "git checkout -b resgate HEAD~1");
      expect(res.repo.branches.resgate).toBe(primeiro);
      expect(G.currentBranch(res.repo)).toBe("resgate");
    });
    it("ponto de partida inválido não cria a branch", () => {
      const { repo } = doisCommits();
      const res = run(repo, "git switch -c resgate abcd123");
      expect(res.ok).toBe(false);
      expect(res.repo.branches.resgate).toBeUndefined();
      expect(G.currentBranch(res.repo)).toBe("main");
    });
    it("mantém alterações locais em arquivo não relacionado, como o Git real", () => {
      const { repo, primeiro } = doisCommits();
      const res = run(repo, 'echo "local" > README.md', `git switch -c resgate ${primeiro}`);
      expect(res.ok).toBe(true);
      expect(res.repo.workdir["README.md"]).toBe("local\n");
    });
  });
  it("bloqueia checkout que sobrescreveria alterações locais", () => {
    const r = run(base(), "git switch -c feature", 'echo "F" > README.md', "git add .", 'git commit -m "F"', "git switch main", 'echo "local" > README.md');
    const res = run(r.repo, "git switch feature");
    expect(res.ok).toBe(false);
    expect(res.lines.join("")).toContain("stash");
  });
});

// Cada caso reproduz o resultado medido no Git 2.52.
describe("merge com trabalho local", () => {
  const avancoSimples = () => run(base(), "git switch -c feature", 'echo "f" > f.txt', "git add .", 'git commit -m "feat"', "git switch main").repo;
  const divergiu = () => run(avancoSimples(), 'echo "m" > m.txt', "git add .", 'git commit -m "main"').repo;
  const emConflito = () =>
    run(base(), 'echo "c" > c.txt', "git add .", 'git commit -m "c"', "git switch -c feature", 'echo "F" > c.txt', "git add .", 'git commit -m "F"', "git switch main", 'echo "M" > c.txt', "git add .", 'git commit -m "M"').repo;

  it("fast-forward preserva alteração não staged em arquivo não relacionado", () => {
    const res = run(avancoSimples(), 'echo "local" >> README.md', "git merge feature");
    expect(res.event).toBe("fast-forward");
    expect(res.repo.workdir["README.md"]).toContain("local");
    expect(res.repo.workdir["f.txt"]).toBe("f\n");
    expect(G.status(res.repo).unstaged.map((f) => f.path)).toEqual(["README.md"]);
  });
  it("fast-forward preserva alteração staged em arquivo não relacionado", () => {
    const res = run(avancoSimples(), 'echo "local" >> README.md', "git add README.md", "git merge feature");
    expect(res.event).toBe("fast-forward");
    expect(G.status(res.repo).staged.map((f) => f.path)).toEqual(["README.md"]);
  });
  it("merge de três vias preserva alteração não staged e não a inclui no commit", () => {
    const res = run(divergiu(), 'echo "local" >> README.md', "git merge feature");
    expect(res.event).toBe("merge");
    expect(res.repo.workdir["README.md"]).toContain("local");
    expect(res.repo.commits[G.headSha(res.repo)!].tree["README.md"]).toBe("# Projeto RPA\n");
    expect(G.status(res.repo).unstaged.map((f) => f.path)).toEqual(["README.md"]);
  });
  it("preserva arquivo apagado localmente que o merge não toca", () => {
    const res = run(divergiu(), "rm README.md", "git merge feature");
    expect(res.event).toBe("merge");
    expect(res.repo.workdir["README.md"]).toBeUndefined();
  });
  it("preserva arquivo não rastreado não relacionado", () => {
    const res = run(divergiu(), 'echo "u" > u.txt', "git merge feature");
    expect(res.event).toBe("merge");
    expect(res.repo.workdir["u.txt"]).toBe("u\n");
    expect(G.status(res.repo).untracked).toEqual(["u.txt"]);
  });
  it("merge de três vias recusa alteração staged, mesmo em arquivo não relacionado", () => {
    const r = run(divergiu(), 'echo "local" >> README.md', "git add README.md").repo;
    const res = run(r, "git merge feature");
    expect(res.ok).toBe(false);
    expect(res.lines.join("\n")).toContain("README.md");
    expect(res.repo).toBe(r);
  });
  it("recusa alteração local em arquivo que o merge toca", () => {
    const r = run(base(), "git switch -c feature", 'echo "z" >> README.md', "git add .", 'git commit -m "z"', "git switch main", 'echo "m" > m.txt', "git add .", 'git commit -m "m"', 'echo "local" >> README.md').repo;
    const res = run(r, "git merge feature");
    expect(res.ok).toBe(false);
    expect(res.lines.join("\n")).toContain("stash");
    expect(res.repo).toBe(r);
  });
  it.each([
    ["fast-forward, conteúdo diferente", "avanco", "outro"],
    ["fast-forward, mesmo conteúdo", "avanco", "f"],
    ["três vias, mesmo conteúdo", "divergiu", "f"],
  ])("recusa arquivo não rastreado que colidiria: %s", (_nome, cenario, conteudo) => {
    const r = run(cenario === "avanco" ? avancoSimples() : divergiu(), `echo "${conteudo}" > f.txt`).repo;
    const res = run(r, "git merge feature");
    expect(res.ok).toBe(false);
    expect(res.lines.join("\n")).toContain("não rastreados");
    expect(res.repo.workdir["f.txt"]).toBe(`${conteudo}\n`);
  });
  it("já atualizado responde normalmente com alteração local", () => {
    const res = run(base(), "git branch outra", 'echo "local" >> README.md', "git merge outra");
    expect(res.ok).toBe(true);
    expect(res.lines.join("\n")).toContain("Already up to date");
  });
  it("conflito preserva o trabalho local não relacionado, e --abort também", () => {
    const res = run(emConflito(), 'echo "local" >> README.md', 'echo "u" > u.txt', "git merge feature");
    expect(res.event).toBe("conflict");
    expect(res.repo.workdir["README.md"]).toContain("local");
    const aborted = run(res.repo, "git merge --abort");
    expect(aborted.repo.workdir["c.txt"]).toBe("M\n");
    expect(aborted.repo.workdir["README.md"]).toContain("local");
    expect(aborted.repo.workdir["u.txt"]).toBe("u\n");
    expect(G.status(aborted.repo).unstaged.map((f) => f.path)).toEqual(["README.md"]);
    expect(aborted.repo.conflicts).toEqual([]);
  });
  it("--abort apaga o arquivo trazido pelo merge", () => {
    const r = run(emConflito(), "git switch feature", 'echo "n" > novo.txt', "git add .", 'git commit -m "novo"', "git switch main").repo;
    const res = run(r, "git merge feature", "git merge --abort");
    expect(res.repo.workdir["novo.txt"]).toBeUndefined();
  });
  it("git pull sem rebase também aceita alteração local não relacionada", () => {
    let r = G.push(G.addRemote(base())).repo;
    r = G.remoteCommit(r, "main", "ana", "colega", (t) => ({ ...t, "ana.txt": "oi\n" }));
    const res = run(r, 'echo "local" >> README.md', "git pull");
    expect(res.ok).toBe(true);
    expect(res.repo.workdir["ana.txt"]).toBe("oi\n");
    expect(res.repo.workdir["README.md"]).toContain("local");
  });
});

describe("rebase", () => {
  it("reaplica commits em cima da base", () => {
    const res = run(
      base(),
      "git switch -c feature",
      'echo "f" > f.txt',
      "git add .",
      'git commit -m "feat"',
      "git switch main",
      'echo "m" > m.txt',
      "git add .",
      'git commit -m "main"',
      "git switch feature",
      "git rebase main",
    );
    expect(res.event).toBe("rebase");
    const head = res.repo.commits[G.headSha(res.repo)!];
    expect(head.message).toBe("feat");
    expect(head.parents[0]).toBe(res.repo.branches.main);
    expect(res.repo.workdir["m.txt"]).toBe("m\n");
  });
  it("para em conflito e continua após resolver", () => {
    const res = run(
      base(),
      "git switch -c feature",
      'echo "F" > README.md',
      "git add .",
      'git commit -m "F"',
      "git switch main",
      'echo "M" > README.md',
      "git add .",
      'git commit -m "M"',
      "git switch feature",
      "git rebase main",
    );
    expect(res.event).toBe("conflict");
    expect(res.repo.rebase).not.toBeNull();
    const fixed = G.writeFile(res.repo, "README.md", "FM\n");
    const done = run(fixed, "git add README.md", "git rebase --continue");
    expect(done.event).toBe("rebase");
    expect(done.repo.rebase).toBeNull();
    expect(G.currentBranch(done.repo)).toBe("feature");
    expect(done.repo.workdir["README.md"]).toBe("FM\n");
    expect(done.repo.commits[G.headSha(done.repo)!].parents[0]).toBe(done.repo.branches.main);
  });
});

describe("remoto simulado (trunk-based)", () => {
  function withRemote(): Repo {
    let r = base();
    r = G.addRemote(r);
    r = G.push(r).repo;
    return r;
  }
  it("push é rejeitado quando o colega já enviou commits", () => {
    let r = withRemote();
    r = G.remoteCommit(r, "main", "ana", "ajuste do colega", (t) => ({ ...t, "ana.txt": "oi\n" }));
    r = run(r, 'echo "meu" > meu.txt', "git add .", 'git commit -m "meu commit"').repo;
    const pushed = run(r, "git push");
    expect(pushed.ok).toBe(false);
    expect(pushed.lines.join("")).toContain("rejected");
    const pulled = run(r, "git pull --rebase");
    expect(pulled.event).toBe("rebase");
    const again = run(pulled.repo, "git push");
    expect(again.ok).toBe(true);
    expect(again.repo.remote!.branches.main).toBe(again.repo.branches.main);
    expect(G.status(again.repo).ahead).toBe(0);
  });
  it("status mostra ahead/behind", () => {
    let r = withRemote();
    r = G.remoteCommit(r, "main", "ana", "x", (t) => ({ ...t, "x.txt": "x\n" }));
    r = run(r, "git fetch").repo;
    expect(G.status(r).behind).toBe(1);
  });
});

describe("git config", () => {
  it("avisa que não tem efeito no Dojo, em vez de responder ok", () => {
    const r = base();
    const res = run(r, 'git config --global user.name "Ana"');
    expect(res.ok).toBe(true);
    expect(res.lines.join("\n")).toContain("não tem efeito");
    expect(res.lines.join("\n")).not.toMatch(/^(<d>)?ok(<\/d>)?$/m);
    expect(res.repo).toBe(r);
    expect(res.repo.user.name).toBe("voce");
  });
});

describe("git show", () => {
  it("mostra o conteúdo do primeiro commit como arquivo novo", () => {
    const text = run(base(), "git show").lines.join("\n");
    expect(text).toContain("new file mode 100644");
    expect(text).toContain("--- /dev/null");
    expect(text).toContain("+++ b/README.md");
    expect(text).toContain("+# Projeto RPA");
  });
  it("mostra arquivo apagado com /dev/null no destino", () => {
    const text = run(base(), 'echo "2" > b.txt', "git add .", 'git commit -m "b"', "rm b.txt", "git add .", 'git commit -m "tira b"', "git show").lines.join("\n");
    expect(text).toContain("deleted file mode 100644");
    expect(text).toContain("+++ /dev/null");
    expect(text).toContain("-2");
  });
  it("arquivo modificado continua com os dois caminhos", () => {
    const text = run(base(), 'echo "nova" >> README.md', "git add .", 'git commit -m "edita"', "git show").lines.join("\n");
    expect(text).toContain("--- a/README.md");
    expect(text).toContain("+nova");
    expect(text).not.toContain("/dev/null");
  });
});

describe("opções não suportadas", () => {
  function comBranch() {
    return run(base(), "git switch -c feature", 'echo "f" > f.txt', "git add .", 'git commit -m "feat"', "git switch main", 'echo "m" > m.txt', "git add .", 'git commit -m "main"').repo;
  }
  it("consulta: avisa, ignora a opção e mostra a saída padrão", () => {
    const status = run(base(), "git status -s");
    expect(status.ok).toBe(true);
    expect(status.event).not.toBe("unsupported");
    expect(status.lines[0]).toContain("'-s'");
    expect(status.lines.join("\n")).toContain("On branch");

    const log = run(base(), "git log --author=ana --oneline");
    expect(log.lines[0]).toContain("'--author'");
    expect(log.lines.join("\n")).toContain("primeiro commit");
  });
  it("lista todas as opções desconhecidas no aviso", () => {
    const res = run(base(), "git diff --stat --name-only");
    expect(res.lines[0]).toContain("'--stat'");
    expect(res.lines[0]).toContain("'--name-only'");
  });
  it.each([
    ['git commit --amend -m "outra"', "--amend"],
    ["git merge --squash feature", "--squash"],
    ["git rebase -i HEAD~1", "-i"],
    ["git push --force-with-lease", "--force-with-lease"],
    ["git add -p", "-p"],
    ["git stash -u", "-u"],
    ["git branch --merged", "--merged"],
    ["git reset --keep HEAD~1", "--keep"],
    ["git cherry-pick -x feature", "-x"],
    ["git checkout -B outra", "-B"],
  ])("altera o repositório: recusa sem mudar nada em %s", (cmd, opt) => {
    const r = run(comBranch(), 'echo "w" >> README.md').repo;
    const res = run(r, cmd);
    expect(res.ok).toBe(true);
    expect(res.event).toBe("unsupported");
    expect(res.repo).toBe(r);
    expect(res.lines[0]).toContain(`'${opt}'`);
  });
  it.each(["git stash clear", "git stash show", "git stash branch nova"])("subcomando desconhecido do stash não guarda nada: %s", (cmd) => {
    const r = run(base(), 'echo "w" >> README.md').repo;
    const res = run(r, cmd);
    expect(res.event).toBe("unsupported");
    expect(res.repo.stash).toEqual([]);
    expect(res.repo.workdir["README.md"]).toContain("w");
  });
  it("git stash pop com índice avisa em vez de devolver outra entrada", () => {
    const r = run(base(), 'echo "w" >> README.md', "git stash").repo;
    const res = run(r, "git stash pop stash@{1}");
    expect(res.event).toBe("unsupported");
    expect(res.repo.stash).toHaveLength(1);
  });
  it("git remote add avisa que o remoto é fixo", () => {
    const res = run(base(), "git remote add outro https://exemplo");
    expect(res.event).toBe("unsupported");
  });

  describe("o que é suportado continua funcionando", () => {
    it("mensagem de commit pode começar com hífen", () => {
      const res = run(base(), 'echo "x" > a.txt', "git add .", 'git commit -m "-x marca o item"');
      expect(res.event).toBe("commit");
      expect(res.repo.commits[G.headSha(res.repo)!].message).toBe("-x marca o item");
    });
    it("mensagem que parece a opção -a não adiciona arquivos", () => {
      const res = run(base(), 'echo "x" > a.txt', 'echo "y" >> README.md', "git add a.txt", 'git commit -m "-a"');
      expect(res.event).toBe("commit");
      expect(G.status(res.repo).unstaged.map((f) => f.path)).toEqual(["README.md"]);
    });
    it("aceita a mensagem colada na opção", () => {
      const res = run(base(), 'echo "x" > a.txt', "git add .", 'git commit -m"colada"');
      expect(res.repo.commits[G.headSha(res.repo)!].message).toBe("colada");
    });
    it("git commit -am adiciona os rastreados", () => {
      const res = run(base(), 'echo "y" >> README.md', 'git commit -am "tudo"');
      expect(res.event).toBe("commit");
      expect(G.status(res.repo).unstaged).toEqual([]);
    });
    it.each(["git log -n 1 --oneline", "git log -1 --oneline", "git log -n1 --oneline"])("limita o log: %s", (cmd) => {
      const r = run(base(), 'echo "2" > b.txt', "git add .", 'git commit -m "segundo"').repo;
      const res = run(r, cmd);
      expect(res.ok).toBe(true);
      expect(res.lines).toHaveLength(1);
    });
    it.each(['git stash -m "minha gaveta"', 'git stash push -m "minha gaveta"'])("aceita mensagem no stash: %s", (cmd) => {
      const res = run(base(), 'echo "y" >> README.md', cmd);
      expect(res.repo.stash[0].message).toBe("minha gaveta");
    });
    it("git switch --create cria a branch", () => {
      const res = run(base(), "git switch --create nova");
      expect(G.currentBranch(res.repo)).toBe("nova");
    });
    it("git switch --detach desanexa mesmo apontando para uma branch", () => {
      const res = run(base(), "git switch --detach main");
      expect(res.repo.head.type).toBe("detached");
    });
    it("git checkout -- arquivo restaura arquivo apagado", () => {
      const res = run(base(), "rm README.md", "git checkout -- README.md");
      expect(res.ok).toBe(true);
      expect(res.repo.workdir["README.md"]).toBe("# Projeto RPA\n");
    });
    it("git push --set-upstream funciona como -u", () => {
      const r = G.addRemote(base());
      const res = run(r, "git push --set-upstream origin main");
      expect(res.event).toBe("push");
    });
    it("--no-edit é aceito, porque o Dojo nunca abre editor de mensagem", () => {
      const merged = run(comBranch(), "git merge --no-edit feature");
      expect(merged.event).toBe("merge");
      const reverted = run(base(), 'echo "2" > b.txt', "git add .", 'git commit -m "segundo"', "git revert --no-edit HEAD");
      expect(reverted.event).toBe("commit");
    });
  });
});

describe("um comando por vez", () => {
  it("avisa sobre && e não executa nada", () => {
    const r = run(base(), 'echo "x" > a.txt').repo;
    const res = run(r, 'git add . && git commit -m "dois em um"');
    expect(res.ok).toBe(true);
    expect(res.event).toBe("unsupported");
    expect(res.lines.join("\n")).toContain("&&");
    expect(res.repo).toBe(r);
    expect(G.status(res.repo).staged).toEqual([]);
  });
  it.each(["git status || git log", "git log | head", "git status; git log"])("avisa também em: %s", (cmd) => {
    const res = run(base(), cmd);
    expect(res.event).toBe("unsupported");
  });
  it("não confunde operador dentro de aspas", () => {
    const res = run(base(), 'echo "a && b; c | d" > a.txt', "git add .", 'git commit -m "a && b"');
    expect(res.ok).toBe(true);
    expect(res.event).toBe("commit");
    expect(res.repo.workdir["a.txt"]).toBe("a && b; c | d\n");
    expect(res.repo.commits[G.headSha(res.repo)!].message).toBe("a && b");
  });
});

describe("stash e reset", () => {
  it("stash guarda e devolve alterações", () => {
    const r = run(base(), 'echo "wip" > wip.txt', "git add wip.txt", "git stash");
    expect(r.repo.workdir["wip.txt"]).toBeUndefined();
    const back = run(r.repo, "git stash pop");
    expect(back.repo.workdir["wip.txt"]).toBe("wip\n");
  });
  it("reset --hard volta HEAD e árvore", () => {
    const r = run(base(), 'echo "2" > b.txt', "git add .", 'git commit -m "segundo"', "git reset --hard HEAD~1");
    expect(r.repo.workdir["b.txt"]).toBeUndefined();
    expect(Object.keys(r.repo.workdir)).toEqual(["README.md"]);
  });
});

describe("arquivo não rastreado no rebase", () => {
  // f e main divergem a partir do primeiro commit
  const div = () =>
    run(base(), "git switch -c f", "echo f > f.txt", "git add .", 'git commit -m "f"', "git switch main", "echo m > m.txt", "git add .", 'git commit -m "m"', "git switch f").repo;
  // f e main mudam x.txt; o segundo commit de f cria p.txt
  const conf = () =>
    run(
      base(),
      "echo x > x.txt",
      "git add .",
      'git commit -m "x"',
      "git switch -c f",
      "echo F > x.txt",
      "git add .",
      'git commit -m "F"',
      "echo p > p.txt",
      "git add .",
      'git commit -m "P"',
      "git switch main",
      "echo M > x.txt",
      "git add .",
      'git commit -m "M"',
      "git switch f",
    ).repo;
  // f cria e depois apaga u.txt: na ponta ele não existe, mas o rebase passa por ele
  const meio = () =>
    run(
      base(),
      "git switch -c f",
      "echo U > u.txt",
      "git add .",
      'git commit -m "cria u"',
      "rm u.txt",
      "git add .",
      'git commit -m "tira u"',
      "echo f > f.txt",
      "git add .",
      'git commit -m "f"',
      "git switch main",
      "echo m > m.txt",
      "git add .",
      'git commit -m "m"',
      "git switch f",
    ).repo;
  const mensagens = (r: Repo) => G.log(r).map((e) => e.commit.message);
  // main tem um commit local e o colega enviou n.txt
  const comColega = () => {
    let r = G.addRemote(base());
    r = G.push(r, { branch: "main" }).repo;
    r = G.remoteCommit(r, "main", "ana", "colega", (t) => ({ ...t, "n.txt": "n\n" }));
    return run(r, "echo l > l.txt", "git add .", 'git commit -m "local"').repo;
  };

  it("mantém o arquivo ao concluir", () => {
    const r = run(div(), "echo meu > u.txt", "git rebase main").repo;
    expect(G.status(r).branch).toBe("f");
    expect(r.workdir["u.txt"]).toBe("meu\n");
    expect(G.status(r).untracked).toEqual(["u.txt"]);
  });
  it("mantém o arquivo ao parar em conflito, e o arquivo em conflito não aparece como não rastreado", () => {
    const r = run(conf(), "echo meu > u.txt", "git rebase main").repo;
    expect(r.rebase).not.toBeNull();
    expect(r.workdir["u.txt"]).toBe("meu\n");
    expect(G.status(r).conflicts).toEqual(["x.txt"]);
    expect(G.status(r).untracked).toEqual(["u.txt"]);
  });
  it("mantém o arquivo no --abort", () => {
    const r = run(conf(), "echo meu > u.txt", "git rebase main", "git rebase --abort").repo;
    expect(r.rebase).toBeNull();
    expect(r.workdir["u.txt"]).toBe("meu\n");
    expect(r.workdir["p.txt"]).toBe("p\n");
  });
  it("mantém o arquivo no --continue", () => {
    const r = run(conf(), "echo meu > u.txt", "git rebase main", "echo FM > x.txt", "git add x.txt", "git rebase --continue").repo;
    expect(r.rebase).toBeNull();
    expect(r.workdir["u.txt"]).toBe("meu\n");
    expect(r.workdir["x.txt"]).toBe("FM\n");
    expect(r.workdir["p.txt"]).toBe("p\n");
  });
  it("mantém o arquivo criado com o rebase já parado", () => {
    const r = run(conf(), "git rebase main", "echo meu > u.txt", "echo FM > x.txt", "git add x.txt", "git rebase --continue").repo;
    expect(r.rebase).toBeNull();
    expect(r.workdir["u.txt"]).toBe("meu\n");
  });
  it("git pull --rebase mantém o arquivo", () => {
    const r = run(comColega(), "echo meu > u.txt", "git pull --rebase").repo;
    expect(mensagens(r).slice(0, 2)).toEqual(["local", "colega"]);
    expect(r.workdir["u.txt"]).toBe("meu\n");
    expect(r.workdir["n.txt"]).toBe("n\n");
  });
  it("git pull --rebase em fast-forward mantém o arquivo", () => {
    let r = G.addRemote(base());
    r = G.push(r, { branch: "main" }).repo;
    r = G.remoteCommit(r, "main", "ana", "colega", (t) => ({ ...t, "n.txt": "n\n" }));
    r = run(r, "echo meu > u.txt", "git pull --rebase").repo;
    expect(r.workdir["u.txt"]).toBe("meu\n");
    expect(r.workdir["n.txt"]).toBe("n\n");
  });

  describe("colisão com a base", () => {
    it("recusa e deixa tudo como estava", () => {
      const antes = run(div(), "echo meu > m.txt").repo;
      const res = run(antes, "git rebase main");
      expect(res.ok).toBe(false);
      expect(res.lines.join("\n")).toContain("m.txt");
      expect(res.repo).toEqual(antes);
    });
    it("recusa mesmo com conteúdo idêntico", () => {
      const res = run(div(), "echo m > m.txt", "git rebase main");
      expect(res.ok).toBe(false);
      expect(res.repo.rebase).toBeNull();
    });
    it("recusa no rebase que seria fast-forward", () => {
      const antes = run(base(), "git switch -c f", "git switch main", "echo m > m.txt", "git add .", 'git commit -m "m"', "git switch f", "echo meu > m.txt").repo;
      const res = run(antes, "git rebase main");
      expect(res.ok).toBe(false);
      expect(res.repo).toEqual(antes);
    });
    it("git pull --rebase recusa, mas o fetch fica feito", () => {
      const res = run(comColega(), "echo meu > n.txt", "git pull --rebase");
      expect(res.ok).toBe(false);
      expect(res.lines.join("\n")).toContain("n.txt");
      expect(res.repo.workdir["n.txt"]).toBe("meu\n");
      expect(res.repo.rebase).toBeNull();
      expect(mensagens(res.repo)[0]).toBe("local");
      expect(res.repo.commits[res.repo.remoteRefs["origin/main"]].message).toBe("colega");
    });
    it("git pull --rebase com alteração local recusa antes do fetch", () => {
      const res = run(comColega(), 'echo "# outro" > README.md', "git pull --rebase");
      expect(res.ok).toBe(false);
      expect(res.repo.commits[res.repo.remoteRefs["origin/main"]].message).toBe("primeiro commit");
    });
    it("rebase já atualizado não olha colisão", () => {
      const res = run(base(), "git switch -c f", "git rebase main");
      expect(res.ok).toBe(true);
      expect(res.lines.join("\n")).toContain("up to date");
    });
  });

  describe("colisão no meio do rebase", () => {
    it("para antes do commit, com o rebase em andamento e o arquivo intacto", () => {
      const res = run(meio(), "echo meu > u.txt", "git rebase main");
      expect(res.ok).toBe(false);
      expect(res.event).toBe("error");
      expect(res.lines.join("\n")).toContain("u.txt");
      expect(res.lines.join("\n")).toContain("--continue");
      expect(res.repo.rebase).not.toBeNull();
      expect(res.repo.head.type).toBe("detached");
      expect(res.repo.conflicts).toEqual([]);
      expect(res.repo.workdir["u.txt"]).toBe("meu\n");
      expect(res.repo.workdir["m.txt"]).toBe("m\n");
      expect(G.status(res.repo).untracked).toEqual(["u.txt"]);
      expect(mensagens(res.repo)[0]).toBe("m");
    });
    it("--continue para de novo enquanto o arquivo estiver lá", () => {
      const res = run(meio(), "echo meu > u.txt", "git rebase main", "git rebase --continue");
      expect(res.ok).toBe(false);
      expect(res.repo.rebase).not.toBeNull();
      expect(res.repo.workdir["u.txt"]).toBe("meu\n");
    });
    it("--continue conclui depois que o arquivo sai do caminho", () => {
      const res = run(meio(), "echo meu > u.txt", "git rebase main", "rm u.txt", "git rebase --continue");
      expect(res.ok).toBe(true);
      expect(res.repo.rebase).toBeNull();
      expect(G.status(res.repo).branch).toBe("f");
      expect(mensagens(res.repo).slice(0, 4)).toEqual(["f", "tira u", "cria u", "m"]);
      expect(Object.keys(res.repo.workdir).sort()).toEqual(["README.md", "f.txt", "m.txt"]);
    });
    it("--abort volta à ponta original e mantém o arquivo", () => {
      const r = run(meio(), "echo meu > u.txt", "git rebase main", "git rebase --abort").repo;
      expect(r.rebase).toBeNull();
      expect(G.status(r).branch).toBe("f");
      expect(mensagens(r)[0]).toBe("f");
      expect(r.workdir["u.txt"]).toBe("meu\n");
    });
    it("--continue recusa com o arquivo em staging, sem perder o conteúdo", () => {
      const res = run(meio(), "echo meu > u.txt", "git rebase main", "git add u.txt", "git rebase --continue");
      expect(res.ok).toBe(false);
      expect(res.repo.rebase).not.toBeNull();
      expect(res.repo.workdir["u.txt"]).toBe("meu\n");
      expect(G.status(res.repo).staged.map((f) => f.path)).toEqual(["u.txt"]);
    });
    it("para no próximo commit se o arquivo foi criado durante um conflito", () => {
      const res = run(conf(), "git rebase main", "echo FM > x.txt", "git add x.txt", "echo meu > p.txt", "git rebase --continue");
      expect(res.ok).toBe(false);
      expect(res.repo.rebase).not.toBeNull();
      expect(res.repo.workdir["p.txt"]).toBe("meu\n");
      expect(mensagens(res.repo)[0]).toBe("F");
    });
    it("git pull --rebase também para no meio", () => {
      let r = G.addRemote(base());
      r = G.push(r, { branch: "main" }).repo;
      r = G.remoteCommit(r, "main", "ana", "colega", (t) => ({ ...t, "n.txt": "n\n" }));
      r = run(r, "echo U > u.txt", "git add .", 'git commit -m "cria u"', "rm u.txt", "git add .", 'git commit -m "tira u"', "echo meu > u.txt").repo;
      const res = run(r, "git pull --rebase");
      expect(res.ok).toBe(false);
      expect(res.repo.rebase).not.toBeNull();
      expect(res.repo.workdir["u.txt"]).toBe("meu\n");
      const fim = run(res.repo, "rm u.txt", "git rebase --continue");
      expect(fim.ok).toBe(true);
      expect(mensagens(fim.repo).slice(0, 3)).toEqual(["tira u", "cria u", "colega"]);
    });
  });

  describe("--abort", () => {
    it("recusa se um arquivo não rastreado colide com a ponta original", () => {
      const parado = run(conf(), "git rebase main", "echo meu > p.txt").repo;
      const res = run(parado, "git rebase --abort");
      expect(res.ok).toBe(false);
      expect(res.lines.join("\n")).toContain("p.txt");
      expect(res.repo).toEqual(parado);
    });
    it("apaga o arquivo novo que estava em staging", () => {
      const r = run(conf(), "git rebase main", "echo n > n.txt", "git add n.txt", "git rebase --abort").repo;
      expect(r.workdir).not.toHaveProperty("n.txt");
    });
  });

  it("não deixa arquivo da base nem da branch para trás ao concluir", () => {
    const r = run(div(), "git rebase main").repo;
    expect(Object.keys(r.workdir).sort()).toEqual(["README.md", "f.txt", "m.txt"]);
    expect(G.status(r).untracked).toEqual([]);
    expect(G.isCleanRepo(r)).toBe(true);
  });
});

describe("arquivo não rastreado em reset, revert e cherry-pick", () => {
  // dois commits: a.txt e x.txt no primeiro, b.txt no segundo
  const dois = () => run(G.createRepo({ user: "voce" }), "git init", "echo a > a.txt", "echo x > x.txt", "git add .", 'git commit -m "um"', "echo 2 > b.txt", "git add .", 'git commit -m "dois"').repo;
  // f e main mudam x.txt, e f também cria c.txt: o cherry-pick de f para em conflito
  const divergente = () =>
    run(dois(), "git switch -c f", "echo F > x.txt", "echo c > c.txt", "git add .", 'git commit -m "F"', "git switch main", "echo M > x.txt", "git add .", 'git commit -m "M"').repo;
  // o revert do commit "F" para em conflito em x.txt e apaga c.txt
  const paraReverter = () => run(dois(), "echo F > x.txt", "echo c > c.txt", "git add .", 'git commit -m "F"', "echo G > x.txt", "git add .", 'git commit -m "G"').repo;
  const arquivos = (r: Repo) => Object.keys(r.workdir).sort();

  describe("git reset --hard", () => {
    it("mantém o não rastreado", () => {
      const r = run(dois(), "echo meu > u.txt", "git reset --hard HEAD~1").repo;
      expect(r.workdir["u.txt"]).toBe("meu\n");
      expect(r.workdir).not.toHaveProperty("b.txt");
      expect(G.status(r).untracked).toEqual(["u.txt"]);
    });
    it("sobrescreve o não rastreado que colide", () => {
      const r = run(dois(), "git reset --hard HEAD~1", "echo meu > b.txt", `git reset --hard ${G.headSha(dois())}`).repo;
      expect(r.workdir["b.txt"]).toBe("2\n");
      expect(G.status(r).untracked).toEqual([]);
    });
    it("apaga o arquivo novo em staging, mesmo alterado depois do add", () => {
      expect(run(dois(), "echo n > n.txt", "git add n.txt", "git reset --hard HEAD").repo.workdir).not.toHaveProperty("n.txt");
      expect(run(dois(), "echo n > n.txt", "git add n.txt", "echo n2 > n.txt", "git reset --hard HEAD").repo.workdir).not.toHaveProperty("n.txt");
    });
    it("mantém o arquivo que saiu da staging com git rm --cached", () => {
      const r = run(dois(), "git rm --cached b.txt", "git reset --hard HEAD~1").repo;
      expect(r.workdir["b.txt"]).toBe("2\n");
      expect(G.status(r).untracked).toEqual(["b.txt"]);
    });
    it("limpa conflito de merge, mantém o não rastreado e apaga o arquivo em conflito que some no alvo", () => {
      const conflito = run(
        dois(),
        "git switch -c f",
        "echo F > x.txt",
        "echo F > novo.txt",
        "git add .",
        'git commit -m "F"',
        "git switch main",
        "echo M > x.txt",
        "echo M > novo.txt",
        "git add .",
        'git commit -m "M"',
        "echo meu > u.txt",
        "git merge f",
      ).repo;
      expect(conflito.conflicts).toEqual(["novo.txt", "x.txt"]);
      const noHead = run(conflito, "git reset --hard HEAD").repo;
      expect(noHead.inProgress).toBeNull();
      expect(noHead.conflicts).toEqual([]);
      expect(noHead.workdir["novo.txt"]).toBe("M\n");
      expect(noHead.workdir["u.txt"]).toBe("meu\n");
      const antes = run(conflito, "git reset --hard HEAD~1").repo;
      expect(arquivos(antes)).toEqual(["a.txt", "b.txt", "u.txt", "x.txt"]);
    });
    it("limpa cherry-pick parado e mantém o não rastreado", () => {
      const r = run(divergente(), "echo meu > u.txt", "git cherry-pick f", "git reset --hard HEAD").repo;
      expect(r.inProgress).toBeNull();
      expect(r.workdir["u.txt"]).toBe("meu\n");
      expect(G.isCleanRepo(r)).toBe(true);
    });
    it("durante um rebase parado, mantém o não rastreado e o rebase segue", () => {
      const parado = run(
        dois(),
        "git switch -c f",
        "echo F > x.txt",
        "git add .",
        'git commit -m "F"',
        "echo p > p.txt",
        "git add .",
        'git commit -m "P"',
        "git switch main",
        "echo M > x.txt",
        "git add .",
        'git commit -m "M"',
        "git switch f",
        "echo meu > u.txt",
        "git rebase main",
        "git reset --hard HEAD",
      ).repo;
      expect(parado.rebase).not.toBeNull();
      expect(parado.workdir["u.txt"]).toBe("meu\n");
      const r = run(parado, "git rebase --continue").repo;
      expect(r.rebase).toBeNull();
      expect(G.log(r).map((e) => e.commit.message).slice(0, 2)).toEqual(["P", "M"]);
      expect(r.workdir["u.txt"]).toBe("meu\n");
    });
  });

  describe("git revert", () => {
    it("mantém o não rastreado", () => {
      const r = run(dois(), "echo meu > u.txt", "git revert HEAD").repo;
      expect(r.workdir["u.txt"]).toBe("meu\n");
      expect(r.workdir).not.toHaveProperty("b.txt");
    });
    it("recusa quando recriaria um arquivo que colide, sem mudar nada", () => {
      const antes = run(dois(), "git rm b.txt", 'git commit -m "tira"', "echo meu > b.txt").repo;
      const res = run(antes, "git revert HEAD");
      expect(res.ok).toBe(false);
      expect(res.lines.join("\n")).toContain("b.txt");
      expect(res.repo).toEqual(antes);
    });
    it("recusa mesmo com conteúdo idêntico", () => {
      const res = run(dois(), "git rm b.txt", 'git commit -m "tira"', "echo 2 > b.txt", "git revert HEAD");
      expect(res.ok).toBe(false);
      expect(res.repo.inProgress).toBeNull();
    });
    it("colisão vem antes do conflito: não para em revert", () => {
      const antes = run(dois(), "git rm b.txt", "echo X > x.txt", "git add .", 'git commit -m "tira"', "echo X2 > x.txt", "git add .", 'git commit -m "muda"', "echo meu > b.txt").repo;
      const res = run(antes, "git revert HEAD~1");
      expect(res.ok).toBe(false);
      expect(res.repo).toEqual(antes);
    });
    it("recusa conflito modificado/apagado em arquivo que colide", () => {
      const antes = run(dois(), "echo 3 > b.txt", "git add .", 'git commit -m "muda b"', "git rm b.txt", 'git commit -m "tira b"', "echo meu > b.txt").repo;
      const res = run(antes, "git revert HEAD~1");
      expect(res.ok).toBe(false);
      expect(res.repo).toEqual(antes);
    });
    it("mantém o não rastreado ao parar em conflito e no --abort", () => {
      const parado = run(paraReverter(), "echo meu > u.txt", "git revert HEAD~1").repo;
      expect(parado.conflicts).toEqual(["x.txt"]);
      expect(parado.workdir["u.txt"]).toBe("meu\n");
      expect(G.status(parado).untracked).toEqual(["u.txt"]);
      const r = run(parado, "git revert --abort").repo;
      expect(r.inProgress).toBeNull();
      expect(r.workdir["u.txt"]).toBe("meu\n");
      expect(r.workdir["c.txt"]).toBe("c\n");
      expect(r.workdir["x.txt"]).toBe("G\n");
    });
    it("--abort mantém a edição feita em outro arquivo durante a parada", () => {
      const r = run(paraReverter(), "git revert HEAD~1", "echo sujo >> a.txt", "git revert --abort").repo;
      expect(r.workdir["a.txt"]).toBe("a\nsujo\n");
      expect(G.status(r).unstaged.map((f) => f.path)).toEqual(["a.txt"]);
    });
    it("--abort recusa se um não rastreado colide com o HEAD", () => {
      const parado = run(paraReverter(), "git revert HEAD~1", "echo meu > c.txt").repo;
      const res = run(parado, "git revert --abort");
      expect(res.ok).toBe(false);
      expect(res.repo).toEqual(parado);
    });
  });

  describe("git cherry-pick", () => {
    it("mantém o não rastreado", () => {
      const r = run(dois(), "git switch -c f", "echo f > f.txt", "git add .", 'git commit -m "f"', "git switch main", "echo meu > u.txt", "git cherry-pick f").repo;
      expect(r.workdir["u.txt"]).toBe("meu\n");
      expect(r.workdir["f.txt"]).toBe("f\n");
    });
    it("recusa quando criaria um arquivo que colide, sem mudar nada", () => {
      const antes = run(dois(), "git switch -c f", "echo f > f.txt", "git add .", 'git commit -m "f"', "git switch main", "echo meu > f.txt").repo;
      const res = run(antes, "git cherry-pick f");
      expect(res.ok).toBe(false);
      expect(res.lines.join("\n")).toContain("f.txt");
      expect(res.repo).toEqual(antes);
    });
    it("recusa mesmo com conteúdo idêntico", () => {
      const res = run(dois(), "git switch -c f", "echo f > f.txt", "git add .", 'git commit -m "f"', "git switch main", "echo f > f.txt", "git cherry-pick f");
      expect(res.ok).toBe(false);
      expect(res.repo.inProgress).toBeNull();
    });
    it("colisão vem antes do conflito: não para em cherry-pick", () => {
      const antes = run(divergente(), "echo meu > c.txt").repo;
      const res = run(antes, "git cherry-pick f");
      expect(res.ok).toBe(false);
      expect(res.repo).toEqual(antes);
    });
    it("mantém o não rastreado ao parar em conflito e no --abort, que apaga o que o pick trouxe", () => {
      const parado = run(divergente(), "echo meu > u.txt", "git cherry-pick f").repo;
      expect(parado.workdir["u.txt"]).toBe("meu\n");
      expect(parado.workdir["c.txt"]).toBe("c\n");
      const r = run(parado, "git cherry-pick --abort").repo;
      expect(r.inProgress).toBeNull();
      expect(r.workdir["u.txt"]).toBe("meu\n");
      expect(r.workdir).not.toHaveProperty("c.txt");
      expect(r.workdir["x.txt"]).toBe("M\n");
    });
    it("--abort mantém a edição feita em outro arquivo durante a parada", () => {
      const r = run(divergente(), "git cherry-pick f", "echo sujo >> a.txt", "git cherry-pick --abort").repo;
      expect(r.workdir["a.txt"]).toBe("a\nsujo\n");
    });
    it("--abort apaga o arquivo novo posto em staging durante a parada", () => {
      const r = run(divergente(), "git cherry-pick f", "echo n > n.txt", "git add n.txt", "git cherry-pick --abort").repo;
      expect(r.workdir).not.toHaveProperty("n.txt");
    });
    it("--abort recusa se um não rastreado colide com o HEAD", () => {
      const parado = run(dois(), "echo t > t.txt", "git add .", 'git commit -m "t"', "git switch -c f", "git rm t.txt", "echo F > x.txt", "git add .", 'git commit -m "F"', "git switch main", "echo M > x.txt", "git add .", 'git commit -m "M"', "git cherry-pick f", "echo meu > t.txt").repo;
      const res = run(parado, "git cherry-pick --abort");
      expect(res.ok).toBe(false);
      expect(res.lines.join("\n")).toContain("t.txt");
      expect(res.repo).toEqual(parado);
    });
  });

  describe("git merge --abort, que usa o mesmo caminho", () => {
    const parado = () => run(dois(), "echo t > t.txt", "git add .", 'git commit -m "t"', "git switch -c f", "git rm t.txt", "echo F > x.txt", "git add .", 'git commit -m "F"', "git switch main", "echo M > x.txt", "git add .", 'git commit -m "M"', "git merge f").repo;
    it("apaga o arquivo novo posto em staging durante a parada", () => {
      const r = run(parado(), "echo n > n.txt", "git add n.txt", "git merge --abort").repo;
      expect(r.workdir).not.toHaveProperty("n.txt");
    });
    it("recusa se um não rastreado colide com o HEAD", () => {
      const antes = run(parado(), "echo meu > t.txt").repo;
      const res = run(antes, "git merge --abort");
      expect(res.ok).toBe(false);
      expect(res.repo).toEqual(antes);
    });
  });
});

describe("git reset com arquivo", () => {
  const dois = () => run(G.createRepo({ user: "voce" }), "git init", "echo a > a.txt", "echo x > x.txt", "git add .", 'git commit -m "um"', "echo 2 > b.txt", "git add .", 'git commit -m "dois"').repo;
  // a.txt e x.txt alterados e em staging
  const emStaging = () => run(dois(), "echo y >> a.txt", "echo y >> x.txt", "git add .").repo;
  const staged = (r: Repo) => G.status(r).staged.map((f) => f.path);
  const unstaged = (r: Repo) => G.status(r).unstaged.map((f) => f.path);

  for (const cmd of ["git reset HEAD a.txt", "git reset HEAD -- a.txt", "git reset -- a.txt", "git reset a.txt"]) {
    it(`${cmd} tira só o arquivo da staging, sem aviso e sem mexer na pasta`, () => {
      const res = run(emStaging(), cmd);
      expect(res.event).not.toBe("unsupported");
      expect(res.ok).toBe(true);
      expect(staged(res.repo)).toEqual(["x.txt"]);
      expect(unstaged(res.repo)).toEqual(["a.txt"]);
      expect(res.repo.workdir["a.txt"]).toBe("a\ny\n");
    });
  }
  it("aceita mais de um arquivo", () => {
    const r = run(dois(), "echo y >> a.txt", "echo y >> x.txt", "echo 3 > b.txt", "git add .", "git reset HEAD a.txt x.txt").repo;
    expect(staged(r)).toEqual(["b.txt"]);
  });
  it("sem --, só o primeiro nome precisa existir", () => {
    const res = run(emStaging(), "git reset a.txt nada.txt");
    expect(res.ok).toBe(true);
    expect(staged(res.repo)).toEqual(["x.txt"]);
  });
  it("git reset HEAD~1 arquivo põe na staging a versão do commit e não move a branch", () => {
    const antes = dois();
    for (const cmd of ["git reset HEAD~1 b.txt", "git reset HEAD~1 -- b.txt"]) {
      const r = run(antes, cmd).repo;
      expect(G.headSha(r)).toBe(G.headSha(antes));
      expect(G.status(r).staged).toEqual([{ path: "b.txt", kind: "deleted" }]);
      expect(G.status(r).untracked).toEqual(["b.txt"]);
      expect(r.workdir["b.txt"]).toBe("2\n");
    }
  });
  it("git reset HEAD~1 arquivo restaura a versão antiga na staging", () => {
    const r = run(dois(), "echo novo > a.txt", "git add .", 'git commit -m "tres"', "git reset HEAD~1 a.txt").repo;
    expect(r.index["a.txt"]).toBe("a\n");
    expect(r.workdir["a.txt"]).toBe("novo\n");
  });
  it("arquivo novo em staging volta a não rastreado", () => {
    for (const cmd of ["git reset n.txt", "git reset HEAD -- n.txt", "git reset HEAD~1 -- n.txt"]) {
      const r = run(dois(), "echo n > n.txt", "git add .", cmd).repo;
      expect(G.status(r).untracked).toEqual(["n.txt"]);
    }
  });
  it("git reset . e git reset HEAD . tiram tudo", () => {
    for (const cmd of ["git reset .", "git reset HEAD ."]) expect(staged(run(emStaging(), cmd).repo)).toEqual([]);
  });
  it("aceita pasta", () => {
    const r = run(dois(), "echo 1 > src/a.txt", "echo 1 > src/b.txt", "git add .", "git reset HEAD src").repo;
    expect(staged(r)).toEqual([]);
    expect(G.status(r).untracked).toEqual(["src/a.txt", "src/b.txt"]);
  });
  it("--mixed com arquivo funciona, com aviso de que está obsoleto", () => {
    const res = run(emStaging(), "git reset --mixed HEAD a.txt");
    expect(res.ok).toBe(true);
    expect(res.lines.join("\n")).toContain("--mixed");
    expect(staged(res.repo)).toEqual(["x.txt"]);
  });
  it("arquivo depois de -- pode começar com hífen", () => {
    const res = run(dois(), "echo y > -y.txt", "git add .", "git reset HEAD -- -y.txt");
    expect(res.event).not.toBe("unsupported");
    expect(G.status(res.repo).untracked).toEqual(["-y.txt"]);
  });
  it("nome de arquivo com branch de mesmo nome é aceito com referência ou com --", () => {
    for (const cmd of ["git reset HEAD a.txt", "git reset -- a.txt"]) {
      const res = run(emStaging(), "git branch a.txt", cmd);
      expect(res.ok).toBe(true);
      expect(staged(res.repo)).toEqual(["x.txt"]);
    }
  });
  it("arquivo apagado da pasta é aceito com referência", () => {
    const res = run(emStaging(), "rm a.txt", "git reset HEAD a.txt");
    expect(res.ok).toBe(true);
    expect(G.status(res.repo).unstaged).toEqual([{ path: "a.txt", kind: "deleted" }]);
  });
  it("tira o arquivo do conflito, mantém os marcadores e o merge segue em andamento", () => {
    const conflito = run(
      dois(),
      "git switch -c f",
      "echo F > x.txt",
      "echo F > novo.txt",
      "git add .",
      'git commit -m "F"',
      "git switch main",
      "echo M > x.txt",
      "echo M > novo.txt",
      "git add .",
      'git commit -m "M"',
      "git merge f",
    ).repo;
    for (const cmd of ["git reset HEAD x.txt", "git restore --staged x.txt"]) {
      const r = run(conflito, cmd).repo;
      expect(r.inProgress?.kind).toBe("merge");
      expect(r.conflicts).toEqual(["novo.txt"]);
      expect(r.workdir["x.txt"]).toContain("<<<<<<<");
      expect(r.index["x.txt"]).toBe("M\n");
    }
  });

  describe("o que continua sem arquivo", () => {
    it("git reset e git reset HEAD tiram tudo da staging", () => {
      for (const cmd of ["git reset", "git reset HEAD"]) expect(staged(run(emStaging(), cmd).repo)).toEqual([]);
    });
    it("git reset HEAD~1 move a branch", () => {
      const r = run(dois(), "git reset HEAD~1").repo;
      expect(G.log(r)).toHaveLength(1);
      expect(G.status(r).untracked).toEqual(["b.txt"]);
    });
    it("git reset --hard -- funciona como git reset --hard", () => {
      const r = run(emStaging(), "git reset --hard --").repo;
      expect(G.isCleanRepo(r)).toBe(true);
    });
  });

  describe("o que continua recusado", () => {
    for (const cmd of ["git reset --hard HEAD a.txt", "git reset --soft HEAD a.txt", "git reset --hard -- a.txt", "git reset --soft -- a.txt", "git reset --hard HEAD -- a.txt", "git reset --hard a.txt"]) {
      it(`${cmd} é erro fatal e não muda nada`, () => {
        const antes = emStaging();
        const res = run(antes, cmd);
        expect(res.ok).toBe(false);
        expect(res.event).toBe("error");
        expect(res.lines[0]).toContain("fatal");
        expect(res.repo).toEqual(antes);
      });
    }
    it("nome desconhecido sem -- é erro", () => {
      const res = run(dois(), "git reset nada.txt");
      expect(res.ok).toBe(false);
      expect(res.lines.join("\n")).toContain("nada.txt");
      expect(res.lines.join("\n")).toContain("--");
    });
    it("arquivo apagado da pasta, sem referência, é erro", () => {
      const res = run(emStaging(), "rm a.txt", "git reset a.txt");
      expect(res.ok).toBe(false);
      expect(staged(res.repo)).toContain("a.txt");
    });
    it("nome igual ao de uma branch e ao de um arquivo é ambíguo", () => {
      const res = run(emStaging(), "git branch a.txt", "git reset a.txt");
      expect(res.ok).toBe(false);
      expect(res.lines.join("\n")).toContain("--");
      expect(staged(res.repo)).toEqual(["a.txt", "x.txt"]);
    });
    it("referência inválida antes de -- é erro", () => {
      const res = run(emStaging(), "git reset refruim -- a.txt");
      expect(res.ok).toBe(false);
      expect(staged(res.repo)).toEqual(["a.txt", "x.txt"]);
    });
  });

  it("nome desconhecido depois de uma referência ou de -- não é erro", () => {
    for (const cmd of ["git reset HEAD nada.txt", "git reset HEAD -- nada.txt", "git reset -- nada.txt"]) {
      const antes = emStaging();
      const res = run(antes, cmd);
      expect(res.ok).toBe(true);
      expect(res.repo).toEqual(antes);
    }
  });
});
