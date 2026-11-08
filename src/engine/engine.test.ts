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

describe("git switch para commit", () => {
  const dois = () => run(G.createRepo({ user: "voce" }), "git init", "echo a > a.txt", "git add .", 'git commit -m "um"', "echo 2 > b.txt", "git add .", 'git commit -m "dois"').repo;
  const umHash = (r: Repo) => G.resolve(r, "HEAD~1");
  const comRemoto = () => {
    const r = G.addRemote(dois());
    return G.push(r, { branch: "main" }).repo;
  };

  describe("recusa sem --detach", () => {
    const casos: [string, () => Repo, (r: Repo) => string][] = [
      ["hash", dois, (r) => `git switch ${umHash(r)}`],
      ["hash abreviado", dois, (r) => `git switch ${G.short(umHash(r))}`],
      ["HEAD~1", dois, () => "git switch HEAD~1"],
      ["HEAD", dois, () => "git switch HEAD"],
      ["origin/main", comRemoto, () => "git switch origin/main"],
      ["hash com -f", dois, (r) => `git switch -f ${umHash(r)}`],
    ];
    for (const [nome, setup, cmd] of casos) {
      it(`${nome}: é um erro normal, com a dica do --detach, e não muda nada`, () => {
        const antes = setup();
        const res = run(antes, cmd(antes));
        expect(res.ok).toBe(false);
        expect(res.event).toBe("error");
        expect(res.lines.join("\n")).toContain("--detach");
        expect(res.repo).toEqual(antes);
      });
    }
    it("diz quando a referência é uma branch remota", () => {
      expect(run(comRemoto(), "git switch origin/main").lines[0]).toContain("branch remota");
    });
    it("nome desconhecido continua dando o erro próprio", () => {
      const res = run(dois(), "git switch naoexiste");
      expect(res.ok).toBe(false);
      expect(res.lines.join("\n")).toContain("naoexiste");
      expect(res.lines.join("\n")).not.toContain("--detach");
    });
  });

  describe("o que continua valendo", () => {
    it("git switch --detach desanexa em hash, HEAD~1 e origin/main", () => {
      const r = comRemoto();
      for (const cmd of [`git switch --detach ${umHash(r)}`, "git switch --detach HEAD~1", "git switch --detach origin/main"]) {
        const res = run(r, cmd);
        expect(res.ok).toBe(true);
        expect(res.repo.head.type).toBe("detached");
      }
    });
    it("git checkout desanexa em hash, HEAD~1 e origin/main", () => {
      const r = comRemoto();
      for (const cmd of [`git checkout ${umHash(r)}`, "git checkout HEAD~1", "git checkout origin/main"]) {
        const res = run(r, cmd);
        expect(res.ok).toBe(true);
        expect(res.repo.head.type).toBe("detached");
      }
    });
    it("git switch -c nasce de um commit", () => {
      const r = dois();
      const res = run(r, `git switch -c novo ${umHash(r)}`);
      expect(res.ok).toBe(true);
      expect(G.status(res.repo).branch).toBe("novo");
    });
    it("git switch vai para uma branch, mesmo com nome de hash", () => {
      const res = run(dois(), "git branch abcd", "git switch abcd");
      expect(res.ok).toBe(true);
      expect(G.status(res.repo).branch).toBe("abcd");
    });
    it("G.checkout, usado pelos cenários, continua desanexando", () => {
      const r = dois();
      expect(G.checkout(r, umHash(r)).head.type).toBe("detached");
    });
  });
});

describe("git diff com arquivo", () => {
  const dois = () => run(G.createRepo({ user: "voce" }), "git init", "echo a > a.txt", "echo x > x.txt", "git add .", 'git commit -m "um"', "echo 2 > b.txt", "git add .", 'git commit -m "dois"').repo;
  // a.txt e x.txt alterados na pasta, sem add
  const alterado = () => run(dois(), "echo y >> a.txt", "echo y >> x.txt").repo;
  const arquivos = (lines: string[]) => lines.filter((l) => l.includes("diff --git")).map((l) => l.replace(/<\/?\w>/g, "").split(" b/")[1]);
  const texto = (lines: string[]) => lines.join("\n");

  for (const cmd of ["git diff a.txt", "git diff -- a.txt", "git diff HEAD a.txt", "git diff HEAD -- a.txt", "git diff main a.txt"]) {
    it(`${cmd} mostra só o arquivo, sem aviso`, () => {
      const res = run(alterado(), cmd);
      expect(res.ok).toBe(true);
      expect(res.event).not.toBe("unsupported");
      expect(arquivos(res.lines)).toEqual(["a.txt"]);
      expect(texto(res.lines)).toContain("+y");
    });
  }
  it("git diff --staged arquivo mostra só o arquivo", () => {
    for (const cmd of ["git diff --staged a.txt", "git diff --cached a.txt", "git diff --staged -- a.txt"]) {
      expect(arquivos(run(alterado(), "git add .", cmd).lines)).toEqual(["a.txt"]);
    }
  });
  it("git diff --staged referência arquivo compara a staging com o commit", () => {
    const res = run(dois(), "echo y >> a.txt", "git add .", "echo z >> a.txt", "git diff --staged HEAD~1 a.txt");
    expect(arquivos(res.lines)).toEqual(["a.txt"]);
    expect(texto(res.lines)).toContain("+y");
    expect(texto(res.lines)).not.toContain("+z");
  });
  it("aceita duas referências", () => {
    for (const cmd of ["git diff HEAD~1 HEAD b.txt", "git diff HEAD~1 HEAD -- b.txt"]) expect(arquivos(run(dois(), cmd).lines)).toEqual(["b.txt"]);
    expect(run(dois(), "git diff HEAD~1 HEAD a.txt").lines).toEqual([]);
  });
  it("aceita mais de um arquivo, pasta e ponto", () => {
    expect(arquivos(run(alterado(), "git diff a.txt x.txt").lines)).toEqual(["a.txt", "x.txt"]);
    expect(arquivos(run(alterado(), "git diff .").lines)).toEqual(["a.txt", "x.txt"]);
    const pasta = run(dois(), "echo 1 > src/s.txt", "git add .", 'git commit -m "s"', "echo 2 > src/s.txt", "echo y >> a.txt").repo;
    for (const cmd of ["git diff src", "git diff src/", "git diff -- src"]) expect(arquivos(run(pasta, cmd).lines)).toEqual(["src/s.txt"]);
  });
  it("arquivo sem alteração não mostra nada", () => {
    for (const cmd of ["git diff b.txt", "git diff HEAD b.txt", "git diff --staged b.txt", "git diff -- b.txt"]) {
      const res = run(alterado(), cmd);
      expect(res.ok).toBe(true);
      expect(res.lines).toEqual([]);
    }
  });
  it("sem arquivo, mantém a mensagem de que não há diferenças", () => {
    expect(texto(run(dois(), "git diff").lines)).toContain("sem diferenças");
  });
  it("referência sozinha continua comparando com a pasta", () => {
    expect(arquivos(run(alterado(), "git diff HEAD~1").lines)).toEqual(["a.txt", "b.txt", "x.txt"]);
    expect(arquivos(run(alterado(), "git diff HEAD~1 --").lines)).toEqual(["a.txt", "b.txt", "x.txt"]);
  });
  it("git diff -- sem arquivo funciona como git diff", () => {
    expect(arquivos(run(alterado(), "git diff --").lines)).toEqual(["a.txt", "x.txt"]);
  });

  describe("arquivo apagado", () => {
    it("com --, mostra a deleção", () => {
      for (const cmd of ["git diff -- b.txt", "git diff HEAD -- b.txt"]) {
        const res = run(dois(), "rm b.txt", cmd);
        expect(arquivos(res.lines)).toEqual(["b.txt"]);
        expect(texto(res.lines)).toContain("deleted file");
      }
    });
    it("deleção em staging aparece com --staged e --", () => {
      expect(texto(run(dois(), "git rm b.txt", "git diff --staged -- b.txt").lines)).toContain("deleted file");
    });
    it("sem --, é erro, porque o nome não está na pasta", () => {
      for (const cmd of ["git diff b.txt", "git diff HEAD b.txt", "git diff --staged b.txt", "git diff HEAD~1 HEAD b.txt"]) {
        const res = run(dois(), "rm b.txt", cmd);
        expect(res.ok).toBe(false);
        expect(texto(res.lines)).toContain("--");
      }
    });
  });

  describe("arquivo não rastreado e arquivo novo", () => {
    it("não rastreado não aparece em nenhuma forma", () => {
      for (const cmd of ["git diff u.txt", "git diff -- u.txt", "git diff HEAD u.txt", "git diff --staged u.txt"]) {
        const res = run(dois(), "echo u > u.txt", cmd);
        expect(res.ok).toBe(true);
        expect(res.lines).toEqual([]);
      }
    });
    it("git diff HEAD não mostra não rastreado", () => {
      expect(arquivos(run(alterado(), "echo u > u.txt", "git diff HEAD").lines)).toEqual(["a.txt", "x.txt"]);
    });
    it("arquivo novo em staging aparece com HEAD e --staged, e não aparece sozinho", () => {
      const r = run(dois(), "echo n > n.txt", "git add .").repo;
      expect(run(r, "git diff n.txt").lines).toEqual([]);
      expect(texto(run(r, "git diff HEAD n.txt").lines)).toContain("new file");
      expect(texto(run(r, "git diff --staged n.txt").lines)).toContain("new file");
    });
  });

  describe("nome desconhecido ou ambíguo", () => {
    it("nome desconhecido sem -- é erro", () => {
      for (const cmd of ["git diff nada.txt", "git diff --staged nada.txt", "git diff HEAD nada.txt"]) {
        const res = run(dois(), cmd);
        expect(res.ok).toBe(false);
        expect(res.event).toBe("error");
        expect(texto(res.lines)).toContain("nada.txt");
      }
    });
    it("com --, nome desconhecido não mostra nada", () => {
      for (const cmd of ["git diff -- nada.txt", "git diff HEAD -- nada.txt", "git diff --staged -- nada.txt"]) {
        const res = run(dois(), cmd);
        expect(res.ok).toBe(true);
        expect(res.lines).toEqual([]);
      }
    });
    it("nome desconhecido no meio dos arquivos é erro", () => {
      for (const cmd of ["git diff a.txt nada.txt", "git diff nada.txt a.txt"]) {
        const res = run(alterado(), cmd);
        expect(res.ok).toBe(false);
        expect(texto(res.lines)).toContain("nada.txt");
      }
    });
    it("arquivo antes de referência é erro", () => {
      expect(run(alterado(), "git diff a.txt HEAD").ok).toBe(false);
    });
    it("referência inválida antes de -- é erro", () => {
      for (const cmd of ["git diff refruim -- a.txt", "git diff a.txt -- x.txt"]) expect(run(alterado(), cmd).ok).toBe(false);
    });
    it("nome igual ao de uma branch e ao de um arquivo é ambíguo", () => {
      const r = run(alterado(), "git branch a.txt").repo;
      const res = run(r, "git diff a.txt");
      expect(res.ok).toBe(false);
      expect(texto(res.lines)).toContain("--");
      expect(arquivos(run(r, "git diff -- a.txt").lines)).toEqual(["a.txt"]);
      expect(run(r, "git diff a.txt --").ok).toBe(true);
    });
  });

  it("opção desconhecida avisa e aplica o filtro do arquivo", () => {
    const res = run(alterado(), "git diff --stat -- a.txt");
    expect(res.lines[0]).toContain("--stat");
    expect(arquivos(res.lines)).toEqual(["a.txt"]);
  });
  it("nome depois de -- pode começar com hífen, sem aviso", () => {
    const res = run(dois(), "echo y > -y.txt", "git add .", "echo z > -y.txt", "git diff -- -y.txt");
    expect(res.event).not.toBe("unsupported");
    expect(arquivos(res.lines)).toEqual(["-y.txt"]);
  });
});

// ---------- Etapa 1B3: desvios que perdem trabalho ----------

describe("git checkout -f e arquivo não rastreado", () => {
  const dois = () => run(G.createRepo({ user: "voce" }), "git init", "echo a > a.txt", "echo x > x.txt", "git add .", 'git commit -m "um"', "echo 2 > b.txt", "git add .", 'git commit -m "dois"').repo;
  // f tem f.txt a mais que main; estamos em main
  const fx = () => run(dois(), "git switch -c f", "echo f > f.txt", "git add .", 'git commit -m "f"', "git switch main").repo;

  it("mantém o arquivo não rastreado", () => {
    const res = run(dois(), "echo u > u.txt", "git switch -c f", "git checkout -f main");
    expect(res.ok).toBe(true);
    expect(G.status(res.repo).branch).toBe("main");
    expect(res.repo.workdir["u.txt"]).toBe("u\n");
    expect(G.status(res.repo).untracked).toEqual(["u.txt"]);
  });
  it("mantém o arquivo não rastreado ao ir para um commit", () => {
    const res = run(dois(), "echo u > u.txt", "git checkout -f HEAD~1");
    expect(res.ok).toBe(true);
    expect(res.repo.head.type).toBe("detached");
    expect(res.repo.workdir["u.txt"]).toBe("u\n");
    expect(res.repo.workdir).not.toHaveProperty("b.txt");
  });
  it("sobrescreve o não rastreado que colide com o destino", () => {
    const res = run(fx(), "echo outro > f.txt", "git checkout -f f");
    expect(res.ok).toBe(true);
    expect(G.status(res.repo).branch).toBe("f");
    expect(res.repo.workdir["f.txt"]).toBe("f\n");
    expect(G.isCleanRepo(res.repo)).toBe(true);
  });
  it("apaga o arquivo novo em staging e descarta a edição", () => {
    const res = run(dois(), "git switch -c f", "echo n > n.txt", "git add n.txt", "echo y >> a.txt", "git checkout -f main");
    expect(res.ok).toBe(true);
    expect(res.repo.workdir).not.toHaveProperty("n.txt");
    expect(res.repo.workdir["a.txt"]).toBe("a\n");
    expect(G.isCleanRepo(res.repo)).toBe(true);
  });
});

describe("git switch, git checkout e git merge com trabalho local que colide", () => {
  const dois = () => run(G.createRepo({ user: "voce" }), "git init", "echo a > a.txt", "echo x > x.txt", "git add .", 'git commit -m "um"', "echo 2 > b.txt", "git add .", 'git commit -m "dois"').repo;
  const texto = (lines: string[]) => lines.join("\n");
  // f tem f.txt a mais que main; estamos em main
  const fx = () => run(dois(), "git switch -c f", "echo f > f.txt", "git add .", 'git commit -m "f"', "git switch main").repo;
  // f mudou x.txt para F; main continua com x
  const fxx = () => run(dois(), "git switch -c f", "echo F > x.txt", "echo f > f.txt", "git add .", 'git commit -m "F"', "git switch main").repo;
  // f e main divergem em x.txt (F e M); estamos em main
  const xconf = () => run(fxx(), "echo M > x.txt", "git add .", 'git commit -m "M"').repo;
  // f apagou b.txt; estamos em main
  const fsemb = () => run(dois(), "git switch -c f", "git rm b.txt", 'git commit -m "tira"', "git switch main").repo;

  describe("arquivo não rastreado que colide com o destino", () => {
    it("git switch recusa e nada muda", () => {
      const antes = run(fx(), "echo outro > f.txt").repo;
      const res = run(antes, "git switch f");
      expect(res.ok).toBe(false);
      expect(texto(res.lines)).toContain("não rastreados");
      expect(texto(res.lines)).toContain("f.txt");
      expect(res.repo).toEqual(antes);
    });
    it("git checkout recusa", () => {
      const antes = run(fx(), "echo outro > f.txt").repo;
      const res = run(antes, "git checkout f");
      expect(res.ok).toBe(false);
      expect(res.repo).toEqual(antes);
    });
    it("recusa mesmo com conteúdo idêntico", () => {
      const res = run(fx(), "echo f > f.txt", "git switch f");
      expect(res.ok).toBe(false);
      expect(G.status(res.repo).branch).toBe("main");
    });
    it("git switch -c nova f recusa e não cria a branch", () => {
      const antes = run(fx(), "echo outro > f.txt").repo;
      const res = run(antes, "git switch -c nova f");
      expect(res.ok).toBe(false);
      expect(res.repo).toEqual(antes);
      expect(res.repo.branches).not.toHaveProperty("nova");
    });
    it("git merge fast-forward continua recusando", () => {
      const antes = run(fx(), "echo outro > f.txt").repo;
      const res = run(antes, "git merge f");
      expect(res.ok).toBe(false);
      expect(res.repo).toEqual(antes);
    });
    it("não rastreado que não colide vai junto", () => {
      const res = run(fx(), "echo u > u.txt", "git switch f");
      expect(res.ok).toBe(true);
      expect(G.status(res.repo).branch).toBe("f");
      expect(G.status(res.repo).untracked).toEqual(["u.txt"]);
    });
  });

  describe("arquivo novo em staging", () => {
    it("que colide com o destino: recusa como alteração local", () => {
      const antes = run(fx(), "echo meu > f.txt", "git add f.txt").repo;
      const res = run(antes, "git switch f");
      expect(res.ok).toBe(false);
      expect(texto(res.lines)).toContain("alterações locais");
      expect(texto(res.lines)).toContain("f.txt");
      expect(res.repo).toEqual(antes);
    });
    it("que não colide: vai junto, ainda em staging", () => {
      const res = run(fx(), "echo n > n.txt", "git add n.txt", "git switch f");
      expect(res.ok).toBe(true);
      expect(G.status(res.repo).branch).toBe("f");
      expect(G.status(res.repo).staged).toEqual([{ path: "n.txt", kind: "new" }]);
      expect(res.repo.workdir["f.txt"]).toBe("f\n");
    });
    it("idêntico ao do destino: aceita e fica limpo", () => {
      const res = run(fx(), "echo f > f.txt", "git add f.txt", "git switch f");
      expect(res.ok).toBe(true);
      expect(G.status(res.repo).branch).toBe("f");
      expect(G.isCleanRepo(res.repo)).toBe(true);
    });
  });

  describe("staging igual ao destino", () => {
    it("edição em staging idêntica ao destino: git switch aceita", () => {
      const res = run(xconf(), "echo F > x.txt", "git add x.txt", "git switch f");
      expect(res.ok).toBe(true);
      expect(G.isCleanRepo(res.repo)).toBe(true);
    });
    it("deleção em staging de arquivo que o destino também não tem: git switch e git merge aceitam", () => {
      for (const cmd of ["git switch f", "git merge f"]) {
        const res = run(fsemb(), "git rm b.txt", cmd);
        expect(res.ok).toBe(true);
        expect(res.repo.workdir).not.toHaveProperty("b.txt");
        expect(G.isCleanRepo(res.repo)).toBe(true);
      }
    });
    it("deleção em staging com o arquivo ainda na pasta: só o caminho que o destino muda é recusado", () => {
      // a.txt: o destino tem a mesma versão, então nada muda nele
      for (const cmd of ["git switch f", "git merge f"]) {
        const res = run(fx(), "git rm --cached a.txt", cmd);
        expect(res.ok).toBe(true);
        expect(G.status(res.repo).staged).toEqual([{ path: "a.txt", kind: "deleted" }]);
        expect(G.status(res.repo).untracked).toEqual(["a.txt"]);
        expect(res.repo.workdir["f.txt"]).toBe("f\n");
      }
      // b.txt: o destino não tem o arquivo, e o Git recusa remover um não rastreado
      const antes = run(fsemb(), "git rm --cached b.txt").repo;
      const res = run(antes, "git switch f");
      expect(res.ok).toBe(false);
      expect(texto(res.lines)).toContain("b.txt");
      expect(texto(res.lines)).toContain("removidos");
      expect(res.repo).toEqual(antes);
      const res2 = run(antes, "git switch --detach f");
      expect(res2.ok).toBe(false);
      expect(res2.repo).toEqual(antes);
    });
    it("edição sem add idêntica ao destino continua recusada, como no Git real", () => {
      const antes = run(xconf(), "echo F > x.txt").repo;
      const res = run(antes, "git switch f");
      expect(res.ok).toBe(false);
      expect(res.repo).toEqual(antes);
    });
  });

  describe("arquivo apagado da pasta sem git add", () => {
    it("git switch aceita e traz a versão do destino, se ele mudou o arquivo", () => {
      const res = run(xconf(), "rm x.txt", "git switch f");
      expect(res.ok).toBe(true);
      expect(G.status(res.repo).branch).toBe("f");
      expect(res.repo.workdir["x.txt"]).toBe("F\n");
      expect(G.isCleanRepo(res.repo)).toBe(true);
    });
    it("continua apagado se o destino tem a mesma versão", () => {
      const res = run(fx(), "rm x.txt", "git switch f");
      expect(res.ok).toBe(true);
      expect(G.status(res.repo).branch).toBe("f");
      expect(res.repo.workdir).not.toHaveProperty("x.txt");
      expect(G.status(res.repo).unstaged).toEqual([{ path: "x.txt", kind: "deleted" }]);
    });
    it("some de vez se o destino também não tem o arquivo", () => {
      const res = run(fsemb(), "rm b.txt", "git switch f");
      expect(res.ok).toBe(true);
      expect(res.repo.workdir).not.toHaveProperty("b.txt");
      expect(G.isCleanRepo(res.repo)).toBe(true);
    });
    it("git merge fast-forward aceita e traz a versão do destino", () => {
      const res = run(fxx(), "rm x.txt", "git merge f");
      expect(res.ok).toBe(true);
      expect(res.event).toBe("fast-forward");
      expect(res.repo.workdir["x.txt"]).toBe("F\n");
      expect(G.isCleanRepo(res.repo)).toBe(true);
    });
    it("git merge fast-forward: se o destino apaga também, fica limpo", () => {
      const res = run(fsemb(), "rm b.txt", "git merge f");
      expect(res.ok).toBe(true);
      expect(G.isCleanRepo(res.repo)).toBe(true);
    });
    it("git merge de três vias aceita e traz a versão mesclada", () => {
      const res = run(fxx(), "echo m > m.txt", "git add .", 'git commit -m "m"', "rm x.txt", "git merge f");
      expect(res.ok).toBe(true);
      expect(res.event).toBe("merge");
      expect(res.repo.workdir["x.txt"]).toBe("F\n");
      expect(G.isCleanRepo(res.repo)).toBe(true);
    });
    it("git merge de três vias mantém apagado o arquivo que o merge não toca", () => {
      const res = run(fxx(), "echo m > m.txt", "git add .", 'git commit -m "m"', "rm b.txt", "git merge f");
      expect(res.ok).toBe(true);
      expect(res.event).toBe("merge");
      expect(G.status(res.repo).unstaged).toEqual([{ path: "b.txt", kind: "deleted" }]);
    });
    it("git merge com conflito nesse arquivo: o conflito acontece normalmente", () => {
      const res = run(xconf(), "rm x.txt", "git merge f");
      expect(res.event).toBe("conflict");
      expect(G.status(res.repo).conflicts).toEqual(["x.txt"]);
      expect(res.repo.workdir["x.txt"]).toContain("<<<<<<<");
    });
  });

  describe("o que continua recusado", () => {
    it("arquivo apagado com git add, se o destino difere", () => {
      for (const cmd of ["git switch f", "git merge f"]) {
        const antes = run(xconf(), "git rm x.txt").repo;
        const res = run(antes, cmd);
        expect(res.ok).toBe(false);
        expect(texto(res.lines)).toContain("x.txt");
        expect(res.repo).toEqual(antes);
      }
    });
    it("edição sem add em arquivo que o destino muda", () => {
      const antes = run(xconf(), "echo meu > x.txt").repo;
      const res = run(antes, "git switch f");
      expect(res.ok).toBe(false);
      expect(res.repo).toEqual(antes);
    });
  });

  describe("o que continua aceito", () => {
    it("edição sem add em arquivo que o destino não muda vai junto", () => {
      const res = run(fx(), "echo y >> a.txt", "git switch f");
      expect(res.ok).toBe(true);
      expect(G.status(res.repo).branch).toBe("f");
      expect(res.repo.workdir["a.txt"]).toBe("a\ny\n");
      expect(G.status(res.repo).unstaged).toEqual([{ path: "a.txt", kind: "modified" }]);
    });
    it("edição com add em arquivo que o destino não muda vai junto, em staging", () => {
      const res = run(fx(), "echo y >> a.txt", "git add a.txt", "echo z >> a.txt", "git switch f");
      expect(res.ok).toBe(true);
      expect(res.repo.workdir["a.txt"]).toBe("a\ny\nz\n");
      expect(G.status(res.repo).staged).toEqual([{ path: "a.txt", kind: "modified" }]);
      expect(G.status(res.repo).unstaged).toEqual([{ path: "a.txt", kind: "modified" }]);
    });
  });
});

describe("git rebase --continue com edição sem add", () => {
  const dois = () => run(G.createRepo({ user: "voce" }), "git init", "echo a > a.txt", "echo x > x.txt", "git add .", 'git commit -m "um"', "echo 2 > b.txt", "git add .", 'git commit -m "dois"').repo;
  const texto = (lines: string[]) => lines.join("\n");
  const mensagens = (r: Repo) => G.log(r).map((e) => e.commit.message);
  // f e main mudam x.txt; o segundo commit de f cria p.txt. O rebase já parou no conflito de x.txt
  const parado = () =>
    run(dois(), "git switch -c f", "echo F > x.txt", "git add .", 'git commit -m "F"', "echo p > p.txt", "git add .", 'git commit -m "P"', "git switch main", "echo M > x.txt", "git add .", 'git commit -m "M"', "git switch f", "git rebase main").repo;
  // só um commit em f: o conflito é no último commit a aplicar
  const paradoUltimo = () =>
    run(dois(), "git switch -c f", "echo F > x.txt", "git add .", 'git commit -m "F"', "git switch main", "echo M > x.txt", "git add .", 'git commit -m "M"', "git switch f", "git rebase main").repo;

  it("recusa a edição sem add em outro arquivo rastreado e nada muda", () => {
    const antes = run(parado(), "echo FM > x.txt", "git add x.txt", "echo sujo >> a.txt").repo;
    const res = run(antes, "git rebase --continue");
    expect(res.ok).toBe(false);
    expect(texto(res.lines)).toContain("a.txt");
    expect(texto(res.lines)).toContain("git add");
    expect(res.repo).toEqual(antes);
    expect(res.repo.workdir["a.txt"]).toBe("a\nsujo\n");
  });
  it("recusa também quando é o último commit a aplicar", () => {
    const antes = run(paradoUltimo(), "echo FM > x.txt", "git add x.txt", "echo sujo >> a.txt").repo;
    const res = run(antes, "git rebase --continue");
    expect(res.ok).toBe(false);
    expect(res.repo).toEqual(antes);
    expect(res.repo.rebase).not.toBeNull();
  });
  it("recusa a edição feita no arquivo resolvido depois do git add", () => {
    const antes = run(parado(), "echo FM > x.txt", "git add x.txt", "echo FM2 > x.txt").repo;
    const res = run(antes, "git rebase --continue");
    expect(res.ok).toBe(false);
    expect(texto(res.lines)).toContain("x.txt");
    expect(res.repo).toEqual(antes);
  });
  it("depois do git add, o --continue segue", () => {
    const res = run(parado(), "echo FM > x.txt", "git add x.txt", "echo sujo >> a.txt", "git add a.txt", "git rebase --continue");
    expect(res.ok).toBe(true);
    expect(res.repo.rebase).toBeNull();
    expect(mensagens(res.repo)).toEqual(["P", "F", "M", "dois", "um"]);
    expect(res.repo.workdir["a.txt"]).toBe("a\nsujo\n");
  });
  it("arquivo novo em staging entra no commit reaplicado", () => {
    const res = run(parado(), "echo FM > x.txt", "git add x.txt", "echo n > n.txt", "git add n.txt", "git rebase --continue");
    expect(res.ok).toBe(true);
    expect(res.repo.rebase).toBeNull();
    const f = G.log(res.repo).find((e) => e.commit.message === "F")!.commit;
    expect(f.tree["n.txt"]).toBe("n\n");
    expect(G.isCleanRepo(res.repo)).toBe(true);
  });
  it("arquivo não rastreado solto não atrapalha", () => {
    const res = run(parado(), "echo FM > x.txt", "git add x.txt", "echo u > u.txt", "git rebase --continue");
    expect(res.ok).toBe(true);
    expect(res.repo.rebase).toBeNull();
    expect(G.status(res.repo).untracked).toEqual(["u.txt"]);
  });
  it("o --abort continua descartando a edição, como no Git real", () => {
    const res = run(parado(), "echo FM > x.txt", "git add x.txt", "echo sujo >> a.txt", "git rebase --abort");
    expect(res.ok).toBe(true);
    expect(res.repo.rebase).toBeNull();
    expect(res.repo.workdir["a.txt"]).toBe("a\n");
    expect(res.repo.workdir["x.txt"]).toBe("F\n");
  });
});

describe("--abort com arquivo adicionado e editado depois", () => {
  const dois = () => run(G.createRepo({ user: "voce" }), "git init", "echo a > a.txt", "echo x > x.txt", "git add .", 'git commit -m "um"', "echo 2 > b.txt", "git add .", 'git commit -m "dois"').repo;
  const texto = (lines: string[]) => lines.join("\n");
  // merge parado: conflito em x.txt e em novo.txt, criado pelos dois lados
  const mergeParado = () =>
    run(dois(), "git switch -c f", "echo F > x.txt", "echo F > novo.txt", "git add .", 'git commit -m "F"', "git switch main", "echo M > x.txt", "echo M > novo.txt", "git add .", 'git commit -m "M"', "git merge f").repo;
  const pickParado = () => run(dois(), "git switch -c f", "echo F > x.txt", "git add .", 'git commit -m "F"', "git switch main", "echo M > x.txt", "git add .", 'git commit -m "M"', "git cherry-pick f").repo;
  const revertParado = () => run(dois(), "echo Z > b.txt", "git add .", 'git commit -m "z"', "git revert HEAD~1").repo;

  it("git merge --abort recusa e nada muda", () => {
    const antes = run(mergeParado(), "echo R > x.txt", "git add x.txt", "echo R2 > x.txt").repo;
    const res = run(antes, "git merge --abort");
    expect(res.ok).toBe(false);
    expect(texto(res.lines)).toContain("x.txt");
    expect(res.repo).toEqual(antes);
    expect(res.repo.workdir["x.txt"]).toBe("R2\n");
  });
  it("recusa também quando é outro arquivo, fora do conflito", () => {
    const antes = run(mergeParado(), "echo R >> a.txt", "git add a.txt", "echo R2 >> a.txt").repo;
    const res = run(antes, "git merge --abort");
    expect(res.ok).toBe(false);
    expect(texto(res.lines)).toContain("a.txt");
    expect(res.repo).toEqual(antes);
  });
  it("recusa arquivo novo em staging editado depois", () => {
    const antes = run(mergeParado(), "echo n > n.txt", "git add n.txt", "echo n2 > n.txt").repo;
    const res = run(antes, "git merge --abort");
    expect(res.ok).toBe(false);
    expect(res.repo.workdir["n.txt"]).toBe("n2\n");
  });
  it("git cherry-pick --abort e git revert --abort recusam", () => {
    const pick = run(pickParado(), "echo R > x.txt", "git add x.txt", "echo R2 > x.txt").repo;
    const res = run(pick, "git cherry-pick --abort");
    expect(res.ok).toBe(false);
    expect(res.repo).toEqual(pick);
    const rev = run(revertParado(), "echo R > b.txt", "git add b.txt", "echo R2 > b.txt").repo;
    const res2 = run(rev, "git revert --abort");
    expect(res2.ok).toBe(false);
    expect(res2.repo).toEqual(rev);
  });

  describe("o que continua aceito", () => {
    it("conflito resolvido com add e nada mais: aborta e volta ao HEAD", () => {
      const res = run(mergeParado(), "echo R > x.txt", "git add x.txt", "git merge --abort");
      expect(res.ok).toBe(true);
      expect(res.repo.inProgress).toBeNull();
      expect(res.repo.workdir["x.txt"]).toBe("M\n");
      expect(G.isCleanRepo(res.repo)).toBe(true);
    });
    it("arquivo em conflito editado sem add: aborta e descarta", () => {
      const res = run(mergeParado(), "echo R > x.txt", "git merge --abort");
      expect(res.ok).toBe(true);
      expect(res.repo.workdir["x.txt"]).toBe("M\n");
    });
    it("edição sem add em arquivo fora do conflito: aborta e mantém", () => {
      const res = run(mergeParado(), "echo sujo >> a.txt", "git merge --abort");
      expect(res.ok).toBe(true);
      expect(res.repo.inProgress).toBeNull();
      expect(res.repo.workdir["a.txt"]).toBe("a\nsujo\n");
      expect(G.status(res.repo).unstaged).toEqual([{ path: "a.txt", kind: "modified" }]);
    });
  });
});

describe("git rebase com commit que já está na base", () => {
  const dois = () => run(G.createRepo({ user: "voce" }), "git init", "echo a > a.txt", "echo x > x.txt", "git add .", 'git commit -m "um"', "echo 2 > b.txt", "git add .", 'git commit -m "dois"').repo;
  const texto = (lines: string[]) => lines.join("\n").replace(/<\/?\w>/g, "");
  const mensagens = (r: Repo) => G.log(r).map((e) => e.commit.message);
  const vazios = (r: Repo) => Object.values(r.commits).filter((c) => c.parents.length === 1 && JSON.stringify(c.tree) === JSON.stringify(r.commits[c.parents[0]].tree));
  // f e main criam i.txt com o mesmo conteúdo, em commits diferentes; estamos em f
  const igual = () => run(dois(), "git switch -c f", "echo igual > i.txt", "git add .", 'git commit -m "igual-f"', "git switch main", "echo igual > i.txt", "git add .", 'git commit -m "igual-m"', "git switch f").repo;

  it("descarta o commit em vez de criar um commit vazio, e avisa", () => {
    const res = run(igual(), "git rebase main");
    expect(res.ok).toBe(true);
    expect(res.event).toBe("rebase");
    expect(mensagens(res.repo)).toEqual(["igual-m", "dois", "um"]);
    expect(res.repo.branches.f).toBe(res.repo.branches.main);
    expect(vazios(res.repo)).toEqual([]);
    expect(texto(res.lines)).toContain("igual-f");
    expect(res.repo.rebase).toBeNull();
    expect(G.isCleanRepo(res.repo)).toBe(true);
  });
  it("reaplica só o commit que não está na base", () => {
    const r = run(dois(), "git switch -c f", "echo igual > i.txt", "git add .", 'git commit -m "igual-f"', "echo p > p.txt", "git add .", 'git commit -m "P"', "git switch main", "echo igual > i.txt", "git add .", 'git commit -m "igual-m"', "git switch f").repo;
    const res = run(r, "git rebase main");
    expect(mensagens(res.repo)).toEqual(["P", "igual-m", "dois", "um"]);
    expect(vazios(res.repo)).toEqual([]);
  });
  it("com todos os commits já na base, a branch anda para a base", () => {
    const r = run(igual(), "git switch main", "echo m > m.txt", "git add .", 'git commit -m "m"', "git switch f").repo;
    const res = run(r, "git rebase main");
    expect(res.ok).toBe(true);
    expect(res.repo.branches.f).toBe(res.repo.branches.main);
    expect(mensagens(res.repo)).toEqual(["m", "igual-m", "dois", "um"]);
    expect(G.status(res.repo).branch).toBe("f");
  });
  it("descarta o commit que fica vazio ao ser aplicado, mesmo sem ser idêntico a um da base", () => {
    const r = run(dois(), "git switch -c f", "echo igual > i.txt", "git add .", 'git commit -m "igual-f"', "git switch main", "echo quase > i.txt", "git add .", 'git commit -m "quase"', "echo igual > i.txt", "git add .", 'git commit -m "igual-m"', "git switch f").repo;
    const res = run(r, "git rebase main");
    expect(res.ok).toBe(true);
    expect(mensagens(res.repo)).toEqual(["igual-m", "quase", "dois", "um"]);
    expect(vazios(res.repo)).toEqual([]);
    expect(texto(res.lines)).toContain("igual-f");
  });
  it("pula o commit e ainda para no conflito do seguinte", () => {
    const r = run(dois(), "git switch -c f", "echo igual > i.txt", "git add .", 'git commit -m "igual-f"', "echo F > x.txt", "git add .", 'git commit -m "F"', "git switch main", "echo igual > i.txt", "git add .", 'git commit -m "igual-m"', "echo M > x.txt", "git add .", 'git commit -m "M"', "git switch f").repo;
    const res = run(r, "git rebase main");
    expect(res.event).toBe("conflict");
    expect(G.status(res.repo).conflicts).toEqual(["x.txt"]);
    const done = run(res.repo, "echo FM > x.txt", "git add x.txt", "git rebase --continue");
    expect(mensagens(done.repo)).toEqual(["F", "M", "igual-m", "dois", "um"]);
    expect(vazios(done.repo)).toEqual([]);
  });
  it("conflito resolvido igual à base não gera commit", () => {
    const r = run(dois(), "git switch -c f", "echo F > x.txt", "git add .", 'git commit -m "F"', "echo p > p.txt", "git add .", 'git commit -m "P"', "git switch main", "echo M > x.txt", "git add .", 'git commit -m "M"', "git switch f").repo;
    const res = run(r, "git rebase main", "echo M > x.txt", "git add x.txt", "git rebase --continue");
    expect(res.ok).toBe(true);
    expect(mensagens(res.repo)).toEqual(["P", "M", "dois", "um"]);
    expect(vazios(res.repo)).toEqual([]);
  });

  describe("git pull --rebase", () => {
    // main tem o commit local; o colega já enviou a mesma mudança, com outro commit
    const jaEnviado = () => {
      let r = G.addRemote(dois());
      r = G.push(r, { branch: "main" }).repo;
      r = run(r, "echo l > l.txt", "git add .", 'git commit -m "local"').repo;
      return G.remoteCommit(r, "main", "ana", "local", (t) => ({ ...t, "l.txt": "l\n" }));
    };
    it("descarta o commit local que o colega já enviou", () => {
      const r = G.remoteCommit(jaEnviado(), "main", "ana", "colega", (t) => ({ ...t, "n.txt": "n\n" }));
      const res = run(r, "git pull --rebase");
      expect(res.ok).toBe(true);
      expect(mensagens(res.repo)).toEqual(["colega", "local", "dois", "um"]);
      expect(vazios(res.repo)).toEqual([]);
      expect(res.repo.branches.main).toBe(res.repo.remoteRefs["origin/main"]);
      expect(G.status(res.repo).ahead).toBe(0);
      expect(texto(res.lines)).toContain("local");
    });
    it("só o commit já enviado: a branch fica igual ao remoto", () => {
      const res = run(jaEnviado(), "git pull --rebase");
      expect(res.ok).toBe(true);
      expect(mensagens(res.repo)).toEqual(["local", "dois", "um"]);
      expect(res.repo.branches.main).toBe(res.repo.remoteRefs["origin/main"]);
      expect(G.status(res.repo).ahead).toBe(0);
      expect(G.status(res.repo).behind).toBe(0);
    });
  });
});

// ---------- Etapa 1B4 ----------

const dois1b4 = () => run(G.createRepo({ user: "voce" }), "git init", "echo a > a.txt", "echo x > x.txt", "git add .", 'git commit -m "um"', "echo 2 > b.txt", "git add .", 'git commit -m "dois"').repo;
const texto1b4 = (lines: string[]) => lines.join("\n").replace(/<\/?\w>/g, "").replace(/&lt;/g, "<");
const mensagens1b4 = (r: Repo) => G.log(r).map((e) => e.commit.message.split("\n")[0]);
// f e main divergem em x.txt (F / M); estamos em main
const xconf1b4 = () => run(dois1b4(), "git switch -c f", "echo F > x.txt", "git add .", 'git commit -m "F"', "git switch main", "echo M > x.txt", "git add .", 'git commit -m "M"').repo;
// merge parado: conflito em x.txt e em novo.txt, criado pelos dois lados
const mergeParado1b4 = () =>
  run(dois1b4(), "git switch -c f", "echo F > x.txt", "echo F > novo.txt", "git add .", 'git commit -m "F"', "git switch main", "echo M > x.txt", "echo M > novo.txt", "git add .", 'git commit -m "M"', "git merge f").repo;
const pickParado1b4 = () => run(xconf1b4(), "git cherry-pick f").repo;
const revertParado1b4 = () => run(dois1b4(), "echo Z > x.txt", "git add .", 'git commit -m "z"', "echo Z2 > x.txt", "git add .", 'git commit -m "z2"', "git revert HEAD~1").repo;
// rebase de f sobre main parado em x.txt; f ainda tem o commit P depois
const rebaseParado1b4 = () => run(dois1b4(), "git switch -c f", "echo F > x.txt", "git add .", 'git commit -m "F"', "echo p > p.txt", "git add .", 'git commit -m "P"', "git switch main", "echo M > x.txt", "git add .", 'git commit -m "M"', "git switch f", "git rebase main").repo;

describe("N5: git reset sem arquivo durante um conflito", () => {
  const encerrado = (r: Repo) => {
    expect(r.inProgress).toBeNull();
    expect(r.conflicts).toEqual([]);
    expect(r.index).toEqual(G.headTree(r));
  };

  it("git reset encerra o merge e tira o conflito da staging, mas os marcadores ficam na pasta", () => {
    const antes = mergeParado1b4();
    const res = run(antes, "git reset");
    expect(res.ok).toBe(true);
    encerrado(res.repo);
    expect(res.repo.workdir["x.txt"]).toBe(antes.workdir["x.txt"]);
    expect(res.repo.workdir["x.txt"]).toContain("<<<<<<<");
    const s = G.status(res.repo);
    expect(s.unstaged.map((f) => f.path)).toEqual(["novo.txt", "x.txt"]);
    expect(s.staged).toEqual([]);
    expect(texto1b4(res.lines)).toContain("merge encerrado");
    expect(res.event).toBe("reset");
  });
  it("git reset HEAD faz o mesmo", () => {
    const res = run(mergeParado1b4(), "git reset HEAD");
    expect(res.ok).toBe(true);
    encerrado(res.repo);
    expect(G.status(res.repo).unstaged.map((f) => f.path)).toEqual(["novo.txt", "x.txt"]);
  });
  it("git reset HEAD~1 move a branch, encerra o merge e deixa novo.txt como não rastreado", () => {
    const antes = mergeParado1b4();
    const res = run(antes, "git reset HEAD~1");
    expect(res.ok).toBe(true);
    encerrado(res.repo);
    expect(res.repo.branches.main).toBe(antes.commits[antes.branches.main].parents[0]);
    const s = G.status(res.repo);
    expect(s.untracked).toEqual(["novo.txt"]);
    expect(s.unstaged.map((f) => f.path)).toEqual(["x.txt"]);
  });
  it("encerra também cherry-pick e revert", () => {
    for (const antes of [pickParado1b4(), revertParado1b4()]) {
      const res = run(antes, "git reset");
      expect(res.ok).toBe(true);
      encerrado(res.repo);
      expect(res.repo.workdir["x.txt"]).toContain("<<<<<<<");
    }
  });
  it("depois do reset, o commit do arquivo arrumado é um commit comum, com um pai só", () => {
    const res = run(mergeParado1b4(), "git reset", "echo R > x.txt", "echo R > novo.txt", "git add .", 'git commit -m "fim"');
    expect(res.ok).toBe(true);
    expect(res.repo.commits[res.repo.branches.main].parents).toHaveLength(1);
  });
  it("com o conflito já resolvido e outro arquivo em staging, o reset tira tudo e encerra o merge", () => {
    const res = run(mergeParado1b4(), "echo R > x.txt", "git add x.txt", "echo s >> a.txt", "git add a.txt", "git reset");
    encerrado(res.repo);
    expect(G.status(res.repo).unstaged.map((f) => f.path)).toEqual(["a.txt", "novo.txt", "x.txt"]);
    expect(res.repo.workdir["x.txt"]).toBe("R\n");
  });
  it("git reset --soft é recusado no meio de um merge ou com conflito", () => {
    for (const antes of [mergeParado1b4(), pickParado1b4(), revertParado1b4(), rebaseParado1b4()]) {
      for (const cmd of ["git reset --soft", "git reset --soft HEAD~1"]) {
        const res = run(antes, cmd);
        expect(res.ok).toBe(false);
        expect(texto1b4(res.lines)).toContain("--soft");
        expect(res.repo).toEqual(antes);
      }
    }
  });

  describe("durante um rebase", () => {
    it("tira o conflito da staging, mas o rebase continua parado", () => {
      const res = run(rebaseParado1b4(), "git reset");
      expect(res.ok).toBe(true);
      expect(res.repo.rebase).not.toBeNull();
      expect(res.repo.conflicts).toEqual([]);
      expect(res.repo.workdir["x.txt"]).toContain("<<<<<<<");
      expect(G.status(res.repo).unstaged.map((f) => f.path)).toEqual(["x.txt"]);
      expect(texto1b4(res.lines)).toContain("rebase continua");
    });
    it("o --continue é recusado até o add, e depois conclui com o commit", () => {
      const reset = run(rebaseParado1b4(), "git reset").repo;
      const recusa = run(reset, "git rebase --continue");
      expect(recusa.ok).toBe(false);
      const fim = run(reset, "echo FM > x.txt", "git add x.txt", "git rebase --continue");
      expect(fim.ok).toBe(true);
      expect(mensagens1b4(fim.repo)).toEqual(["P", "F", "M", "dois", "um"]);
      expect(fim.repo.rebase).toBeNull();
    });
    it("git reset --hard HEAD~1 move o ponto onde o rebase continua, como no Git real", () => {
      const res = run(rebaseParado1b4(), "git reset --hard HEAD~1", "git rebase --continue");
      expect(res.ok).toBe(true);
      expect(mensagens1b4(res.repo)).toEqual(["P", "dois", "um"]);
      expect(G.status(res.repo).branch).toBe("f");
    });
    it("git reset HEAD~1, add e --continue aplicam o commit parado sobre o novo HEAD", () => {
      const res = run(rebaseParado1b4(), "git reset HEAD~1", "echo FM > x.txt", "git add x.txt", "git rebase --continue");
      expect(res.ok).toBe(true);
      expect(mensagens1b4(res.repo)).toEqual(["P", "F", "dois", "um"]);
    });
  });

  describe("o que continua igual", () => {
    it("git reset sem conflito só limpa a staging, sem aviso de operação encerrada", () => {
      const res = run(dois1b4(), "echo y >> a.txt", "git add .", "git reset");
      expect(res.ok).toBe(true);
      expect(G.status(res.repo).staged).toEqual([]);
      expect(G.status(res.repo).unstaged.map((f) => f.path)).toEqual(["a.txt"]);
      expect(texto1b4(res.lines)).not.toContain("encerrado");
    });
    it("git reset --hard continua encerrando o merge e limpando a pasta", () => {
      const res = run(mergeParado1b4(), "git reset --hard HEAD");
      encerrado(res.repo);
      expect(G.isCleanRepo(res.repo)).toBe(true);
    });
    it("git reset HEAD arquivo tira só o arquivo do conflito e mantém o merge", () => {
      const res = run(mergeParado1b4(), "git reset HEAD x.txt");
      expect(res.repo.inProgress?.kind).toBe("merge");
      expect(res.repo.conflicts).toEqual(["novo.txt"]);
    });
  });
});

describe("N6: git diff durante um conflito", () => {
  const diff = (r: Repo, cmd: string) => {
    const res = run(r, cmd);
    expect(res.ok).toBe(true);
    return res.lines.length ? texto1b4(res.lines).split("\n") : [];
  };
  // no merge, o Dojo rotula o lado de cá com o nome da branch; o Git real usa HEAD (desvio N19, registrado no plano)
  const cc = (label: string, ours = "main") => ["diff --cc x.txt", "--- a/x.txt", "+++ b/x.txt", `++<<<<<<< ${ours}`, " +M", "++=======", "+ F", `++>>>>>>> ${label}`];

  it("git diff mostra o diff combinado do arquivo em conflito, como no Git real", () => {
    const lines = diff(run(xconf1b4(), "git merge f").repo, "git diff");
    expect(lines).toEqual(cc("f"));
  });
  it("com dois arquivos em conflito, mostra os dois, em ordem", () => {
    const lines = diff(mergeParado1b4(), "git diff");
    expect(lines.filter((l) => l.startsWith("diff --cc"))).toEqual(["diff --cc novo.txt", "diff --cc x.txt"]);
    expect(lines).not.toContain("(sem diferenças)");
    expect(lines.filter((l) => l === "++=======")).toHaveLength(2);
  });
  it("git diff --staged lista o arquivo em conflito como Unmerged path", () => {
    const lines = diff(mergeParado1b4(), "git diff --staged");
    expect(lines).toEqual(["* Unmerged path novo.txt", "* Unmerged path x.txt"]);
  });
  it("alterações em outros arquivos aparecem junto, em ordem de caminho", () => {
    const r = run(mergeParado1b4(), "echo s >> a.txt", "git add a.txt", "echo t >> b.txt").repo;
    const work = diff(r, "git diff");
    expect(work.filter((l) => /^(diff|\*)/.test(l))).toEqual(["diff --git a/b.txt b/b.txt", "diff --cc novo.txt", "diff --cc x.txt"]);
    const staged = diff(r, "git diff --staged");
    expect(staged.filter((l) => /^(diff|\*)/.test(l))).toEqual(["diff --git a/a.txt b/a.txt", "* Unmerged path novo.txt", "* Unmerged path x.txt"]);
  });
  it("depois de editar o arquivo sem add, o diff combinado compara com os dois lados", () => {
    const lines = diff(run(xconf1b4(), "git merge f", "echo R > x.txt").repo, "git diff");
    expect(lines).toEqual(["diff --cc x.txt", "--- a/x.txt", "+++ b/x.txt", "- M", " -F", "++R"]);
  });
  it("depois do add que resolve, git diff fica vazio e --staged vira um diff comum", () => {
    const r = run(xconf1b4(), "git merge f", "echo R > x.txt", "git add x.txt").repo;
    expect(diff(r, "git diff")).toEqual(["(sem diferenças)"]);
    expect(diff(r, "git diff --staged")).toEqual(["diff --git a/x.txt b/x.txt", "--- a/x.txt", "+++ b/x.txt", "-M", "+R"]);
  });
  it("vale para conflito de cherry-pick, de revert e de rebase, com o rótulo de cada um", () => {
    const pick = diff(pickParado1b4(), "git diff");
    expect(pick.slice(0, 7)).toEqual(cc("", "HEAD").slice(0, 7));
    expect(pick[7]).toMatch(/^\+\+>>>>>>> [0-9a-f]{7} \(F\)$/);
    const rev = diff(revertParado1b4(), "git diff");
    expect(rev.slice(3, 5)).toEqual(["++<<<<<<< HEAD", " +Z2"]);
    expect(rev[7]).toMatch(/^\+\+>>>>>>> parent of [0-9a-f]{7} \(z\)$/);
    const rb = diff(rebaseParado1b4(), "git diff");
    expect(rb.slice(0, 7)).toEqual(cc("", "HEAD").slice(0, 7));
    expect(rb[7]).toMatch(/^\+\+>>>>>>> [0-9a-f]{7} \(F\)$/);
  });
  it("conflito de stash pop também mostra o diff combinado", () => {
    const r = run(dois1b4(), "echo S > x.txt", "git stash", "echo M > x.txt", "git add .", 'git commit -m "M"', "git stash pop").repo;
    expect(r.conflicts).toEqual(["x.txt"]);
    const lines = diff(r, "git diff");
    expect(lines.slice(0, 5)).toEqual(["diff --cc x.txt", "--- a/x.txt", "+++ b/x.txt", "++<<<<<<< Updated upstream", " +M"]);
    expect(lines).toContain("+ S");
  });
  it("conflito entre modificar e apagar aparece só como Unmerged path", () => {
    const r = run(dois1b4(), "git switch -c f", "git rm b.txt", 'git commit -m "tira"', "git switch main", "echo B > b.txt", "git add .", 'git commit -m "B"', "git merge f").repo;
    expect(r.conflicts).toEqual(["b.txt"]);
    expect(diff(r, "git diff")).toEqual(["* Unmerged path b.txt"]);
    expect(diff(r, "git diff --staged")).toEqual(["* Unmerged path b.txt"]);
    expect(diff(r, "git diff HEAD")).toEqual(["(sem diferenças)"]);
  });
  it("com arquivo: só o pedido, e arquivo fora do conflito não mostra nada", () => {
    const r = run(xconf1b4(), "git merge f").repo;
    expect(diff(r, "git diff x.txt")).toEqual(cc("f"));
    expect(diff(r, "git diff -- x.txt")).toEqual(cc("f"));
    expect(diff(r, "git diff --staged x.txt")).toEqual(["* Unmerged path x.txt"]);
    expect(diff(r, "git diff a.txt")).toEqual([]);
  });

  describe("o que continua igual", () => {
    it("git diff HEAD durante o conflito é um diff comum, com os marcadores como linhas novas", () => {
      const lines = diff(run(xconf1b4(), "git merge f").repo, "git diff HEAD");
      expect(lines).toEqual(["diff --git a/x.txt b/x.txt", "--- a/x.txt", "+++ b/x.txt", "+<<<<<<< main", " M", "+=======", "+F", "+>>>>>>> f"]);
    });
    it("git diff entre duas referências ignora o conflito", () => {
      const lines = diff(run(xconf1b4(), "git merge f").repo, "git diff HEAD~1 HEAD");
      expect(lines).toEqual(["diff --git a/x.txt b/x.txt", "--- a/x.txt", "+++ b/x.txt", "-x", "+M"]);
    });
    it("o lado 'deles' do conflito some quando o conflito é resolvido ou abortado", () => {
      const r = run(xconf1b4(), "git merge f").repo;
      expect(r.theirs).toEqual({ "x.txt": "F\n" });
      expect(run(r, "echo R > x.txt", "git add x.txt").repo.theirs).toEqual({});
      expect(run(r, "git merge --abort").repo.theirs).toEqual({});
      expect(run(r, "git reset").repo.theirs).toEqual({});
      expect(run(r, "git restore --staged x.txt").repo.theirs).toEqual({});
    });
  });
});

// f e main criam i.txt com o mesmo conteúdo, em commits diferentes; estamos em main
const noop1b4 = () => run(dois1b4(), "git switch -c f", "echo igual > i.txt", "git add .", 'git commit -m "igual-f"', "git switch main", "echo igual > i.txt", "git add .", 'git commit -m "igual-m"').repo;
// main tem um commit de merge de f
const mrg1b4 = () => run(dois1b4(), "git switch -c f", "echo f > f.txt", "git add .", 'git commit -m "f"', "git switch main", "echo m > m.txt", "git add .", 'git commit -m "m"', "git merge f").repo;

describe("N8: cherry-pick e revert sem efeito", () => {
  describe("git cherry-pick", () => {
    it("para com erro e fica em andamento, sem criar commit, como no Git real", () => {
      const antes = noop1b4();
      const res = run(antes, "git cherry-pick f");
      expect(res.ok).toBe(false);
      expect(texto1b4(res.lines)).toContain("vazio");
      expect(texto1b4(res.lines)).toContain("git cherry-pick --abort");
      expect(res.repo.inProgress?.kind).toBe("cherry-pick");
      expect(mensagens1b4(res.repo)).toEqual(mensagens1b4(antes));
      expect(res.repo.workdir).toEqual(antes.workdir);
      expect(res.repo.index).toEqual(antes.index);
      const st = texto1b4(run(res.repo, "git status").lines);
      expect(st).toContain("cherry-pick em andamento");
      expect(st).not.toContain("unmerged");
      expect(st).toContain("nothing to commit");
    });
    it("git commit durante o cherry-pick vazio é recusado, e --abort encerra", () => {
      const antes = noop1b4();
      const parado = run(antes, "git cherry-pick f").repo;
      const commit = run(parado, 'git commit -m "x"');
      expect(commit.ok).toBe(false);
      expect(texto1b4(commit.lines)).toContain("vazio");
      expect(mensagens1b4(commit.repo)).toEqual(mensagens1b4(antes));
      expect(commit.repo.inProgress?.kind).toBe("cherry-pick");
      const abort = run(parado, "git cherry-pick --abort");
      expect(abort.ok).toBe(true);
      expect(abort.repo.inProgress).toBeNull();
      expect(G.isCleanRepo(abort.repo)).toBe(true);
      expect(mensagens1b4(abort.repo)).toEqual(mensagens1b4(antes));
    });
    it("git reset também encerra o cherry-pick vazio", () => {
      const res = run(noop1b4(), "git cherry-pick f", "git reset");
      expect(res.ok).toBe(true);
      expect(res.repo.inProgress).toBeNull();
      expect(G.isCleanRepo(res.repo)).toBe(true);
    });
    it("trocar de branch durante o cherry-pick vazio é recusado", () => {
      const res = run(noop1b4(), "git cherry-pick f", "git switch f");
      expect(res.ok).toBe(false);
      expect(res.repo.inProgress?.kind).toBe("cherry-pick");
    });
    it("git cherry-pick HEAD fica vazio do mesmo jeito", () => {
      const res = run(dois1b4(), "git cherry-pick HEAD");
      expect(res.ok).toBe(false);
      expect(res.repo.inProgress?.kind).toBe("cherry-pick");
      expect(Object.keys(res.repo.commits)).toHaveLength(2);
    });
    it("conflito resolvido igual ao HEAD: git commit é recusado, e --abort encerra sem perder nada", () => {
      const antes = pickParado1b4();
      const commit = run(antes, "echo M > x.txt", "git add x.txt", 'git commit -m "x"');
      expect(commit.ok).toBe(false);
      expect(texto1b4(commit.lines)).toContain("vazio");
      expect(commit.repo.inProgress?.kind).toBe("cherry-pick");
      expect(mensagens1b4(commit.repo)).toEqual(mensagens1b4(antes));
      const abort = run(commit.repo, "git cherry-pick --abort");
      expect(abort.ok).toBe(true);
      expect(G.isCleanRepo(abort.repo)).toBe(true);
      expect(abort.repo.workdir["x.txt"]).toBe("M\n");
    });
  });

  describe("git revert", () => {
    it("sem efeito, para com erro e não fica em andamento", () => {
      const antes = run(dois1b4(), "echo F > x.txt", "git add .", 'git commit -m "F"', "echo x > x.txt", "git add .", 'git commit -m "volta"').repo;
      const res = run(antes, "git revert HEAD~1");
      expect(res.ok).toBe(false);
      expect(texto1b4(res.lines)).toContain("nada para reverter");
      expect(res.repo).toEqual(antes);
    });
    it("conflito resolvido igual ao HEAD: git commit é recusado, e --abort encerra", () => {
      const antes = revertParado1b4();
      const commit = run(antes, "echo Z2 > x.txt", "git add x.txt", 'git commit -m "x"');
      expect(commit.ok).toBe(false);
      expect(texto1b4(commit.lines)).toContain("vazio");
      expect(commit.repo.inProgress?.kind).toBe("revert");
      expect(mensagens1b4(commit.repo)).toEqual(mensagens1b4(antes));
      const abort = run(commit.repo, "git revert --abort");
      expect(abort.ok).toBe(true);
      expect(G.isCleanRepo(abort.repo)).toBe(true);
    });
  });

  describe("o que continua igual", () => {
    it("cherry-pick de commit que só em parte já está presente cria o commit com o resto", () => {
      const r = run(dois1b4(), "git switch -c f", "echo igual > i.txt", "echo p > p.txt", "git add .", 'git commit -m "ip"', "git switch main", "echo igual > i.txt", "git add .", 'git commit -m "igual-m"').repo;
      const res = run(r, "git cherry-pick f");
      expect(res.ok).toBe(true);
      expect(mensagens1b4(res.repo)).toEqual(["ip", "igual-m", "dois", "um"]);
      expect(res.repo.workdir["p.txt"]).toBe("p\n");
    });
    it("merge com conflito resolvido igual ao HEAD ainda gera o commit de merge", () => {
      const res = run(xconf1b4(), "git merge f", "echo M > x.txt", "git add x.txt", 'git commit -m "merge"');
      expect(res.ok).toBe(true);
      expect(res.repo.commits[res.repo.branches.main].parents).toHaveLength(2);
    });
    it("a colisão com arquivo não rastreado vem antes, e nada fica em andamento", () => {
      const r = run(noop1b4(), "git switch -c g HEAD~1", "echo outro > i.txt").repo;
      const res = run(r, "git cherry-pick f");
      expect(res.ok).toBe(false);
      expect(texto1b4(res.lines)).toContain("não rastreados");
      expect(res.repo.inProgress).toBeNull();
      expect(res.repo.workdir["i.txt"]).toBe("outro\n");
    });
  });
});

describe("N9: cherry-pick e revert de commit de merge", () => {
  it("git cherry-pick recusa, sem mexer em nada", () => {
    const antes = run(mrg1b4(), "git switch -c outra HEAD~2").repo;
    const res = run(antes, "git cherry-pick main");
    expect(res.ok).toBe(false);
    expect(texto1b4(res.lines)).toContain("-m");
    expect(texto1b4(res.lines)).toContain("merge");
    expect(res.repo).toEqual(antes);
  });
  it("git revert recusa, sem mexer em nada", () => {
    const antes = mrg1b4();
    const res = run(antes, "git revert HEAD");
    expect(res.ok).toBe(false);
    expect(texto1b4(res.lines)).toContain("-m");
    expect(res.repo).toEqual(antes);
  });
  it("a recusa vem antes da checagem de alteração local, como no Git real", () => {
    const pick = run(mrg1b4(), "git switch -c outra HEAD~2", "echo s >> a.txt", "git cherry-pick main");
    expect(pick.ok).toBe(false);
    expect(texto1b4(pick.lines)).toContain("-m");
    expect(texto1b4(pick.lines)).not.toContain("alterações locais");
    const rev = run(mrg1b4(), "echo s >> a.txt", "git revert HEAD");
    expect(rev.ok).toBe(false);
    expect(texto1b4(rev.lines)).toContain("-m");
    expect(texto1b4(rev.lines)).not.toContain("alterações locais");
  });
  it("hash desconhecido continua com o erro de referência", () => {
    const res = run(mrg1b4(), "git cherry-pick 0000abcd");
    expect(res.ok).toBe(false);
    expect(texto1b4(res.lines)).toContain("referência desconhecida");
  });
  it("durante um cherry-pick parado, a recusa é pela operação em andamento", () => {
    const res = run(pickParado1b4(), "git cherry-pick HEAD~1");
    expect(res.ok).toBe(false);
    expect(texto1b4(res.lines)).toContain("em andamento");
  });
  it("cherry-pick e revert de commit comum continuam funcionando", () => {
    const r = mrg1b4();
    expect(run(r, "git switch -c outra HEAD~2", "git cherry-pick f").ok).toBe(true);
    expect(run(r, "git revert HEAD~1").ok).toBe(true);
  });
});
