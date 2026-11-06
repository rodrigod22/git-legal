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
  it("bloqueia checkout que sobrescreveria alterações locais", () => {
    const r = run(base(), "git switch -c feature", 'echo "F" > README.md', "git add .", 'git commit -m "F"', "git switch main", 'echo "local" > README.md');
    const res = run(r.repo, "git switch feature");
    expect(res.ok).toBe(false);
    expect(res.lines.join("")).toContain("stash");
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
