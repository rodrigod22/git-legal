/** Roda a mesma sequência aleatória no Git real e no Dojo, comparando passo a passo.
 * Uso: npx vite-node scripts/comparar-dojo-git-real.ts <pasta-temporária> <sequências> <semente> [diff] */
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as G from "../src/engine/repo";
import { execute } from "../src/engine/commands";

const ROOT = process.argv[2];
const N = parseInt(process.argv[3] ?? "100", 10);
const SEED = parseInt(process.argv[4] ?? "1", 10);
const STEPS = 14;
let seed = SEED;
const rnd = (n: number) => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return (seed >> 8) % n;
};
const pick = <T,>(a: T[]) => a[rnd(a.length)];

const env = { ...process.env, GIT_EDITOR: "true", GIT_MERGE_AUTOEDIT: "no" };
const gitArgs = ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "init.defaultBranch=main", "-c", "core.autocrlf=false", "-c", "status.renames=false", "-c", "advice.detachedHead=false", "-c", "merge.conflictStyle=merge"];
let lastOut = "";
// o lado de cá do marcador é comparado literalmente (N19 corrigido na Etapa 1G); o de lá traz o hash curto do commit, que difere entre Git e Dojo
const marcador = (l: string) => l.replace(/^([-+ ]*)>>>>>>> .*$/, "$1>>>>>>>");
const cabecalhos = (t: string[]) => t.map((l) => marcador(l.replace(/<\/?\w>/g, "").replace(/&lt;/g, "<"))).filter((l) => /^(diff --git|diff --cc|\* Unmerged path|new file|deleted file|[-+])/.test(l)).join("\n");
function real(cwd: string, cmd: string): number {
  const a = cmd.split(" ");
  if (a[0] === "echo") {
    fs.writeFileSync(path.join(cwd, a[3]), a[1] + "\n");
    return 0;
  }
  if (a[0] === "rm") {
    const p = path.join(cwd, a[1]);
    if (!fs.existsSync(p)) return 1;
    fs.unlinkSync(p);
    return 0;
  }
  const r = spawnSync("git", [...gitArgs, ...a.slice(1)], { cwd, env, encoding: "utf8" });
  lastOut = r.stdout ?? "";
  return r.status ?? 1;
}
const norm = (c: string) => (c.includes("<<<<<<<") ? "<conflito>" : c);
function realState(cwd: string) {
  const files: Record<string, string> = {};
  for (const f of fs.readdirSync(cwd)) if (f !== ".git") files[f] = norm(fs.readFileSync(path.join(cwd, f), "utf8"));
  const st = new Set<string>();
  const out = spawnSync("git", [...gitArgs, "status", "--porcelain=v1"], { cwd, env, encoding: "utf8" }).stdout;
  for (const l of out.split("\n").filter(Boolean)) {
    const xy = l.slice(0, 2);
    const p = l.slice(3);
    if (xy === "??") st.add(`?:${p}`);
    else if (["UU", "AA", "DU", "UD", "AU", "UA", "DD"].includes(xy)) st.add(`U:${p}`);
    else {
      if (xy[0] !== " ") st.add(`S:${p}`);
      if (xy[1] !== " ") st.add(`W:${p}`);
    }
  }
  const g = path.join(cwd, ".git");
  const prog = fs.existsSync(path.join(g, "rebase-merge")) ? "rebase" : fs.existsSync(path.join(g, "MERGE_HEAD")) ? "merge" : fs.existsSync(path.join(g, "CHERRY_PICK_HEAD")) ? "cherry-pick" : fs.existsSync(path.join(g, "REVERT_HEAD")) ? "revert" : "";
  const head = spawnSync("git", [...gitArgs, "log", "-1", "--format=%s"], { cwd, env, encoding: "utf8" }).stdout.trim();
  return { files, st: [...st].sort(), prog, head };
}
function dojoState(r: any) {
  const files: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.workdir)) files[k] = norm(v as string);
  const s = G.status(r);
  const st = new Set<string>();
  for (const p of s.untracked) st.add(`?:${p}`);
  for (const p of s.conflicts) st.add(`U:${p}`);
  for (const f of s.staged) st.add(`S:${f.path}`);
  for (const f of s.unstaged) st.add(`W:${f.path}`);
  const prog = r.rebase ? "rebase" : (r.inProgress?.kind ?? "");
  const sha = G.headSha(r);
  return { files, st: [...st].sort(), prog, head: sha ? r.commits[sha].message.split("\n")[0] : "" };
}
const SETUP = ["git init -q", "echo a > a.txt", "echo x > x.txt", "git add .", "git commit -m c0", "echo b > b.txt", "git add .", "git commit -m c1", "git switch -c f", "echo F > x.txt", "echo f > f.txt", "git add .", "git commit -m c2", "echo g > g.txt", "git add .", "git commit -m c3", "git switch main", "echo m > m.txt", "git add .", "git commit -m c4"];
const NOMES = ["a.txt", "x.txt", "b.txt", "f.txt", "g.txt", "m.txt", "u.txt"];
let cc = 10;
function gerar(): string {
  const n = pick(NOMES);
  if (process.argv[5] === "diff" && rnd(2)) return `git diff ${pick(["", "HEAD ", "--staged ", "-- ", "HEAD -- ", "HEAD~1 ", "--staged -- ", "HEAD~1 HEAD ", "HEAD~1 HEAD -- ", "--staged HEAD~1 "])}${pick([n, n, ".", "a.txt x.txt"])}`;
  return pick([
    () => `echo ${pick(["v1", "v2", "a", "F"])} > ${n}`,
    () => `echo ${pick(["v1", "v2"])} > u.txt`,
    () => `rm ${n}`,
    () => "git add .",
    () => `git add ${n}`,
    () => `git commit -m c${cc++}`,
    () => `git switch ${pick(["main", "f"])}`,
    () => `git rebase ${pick(["main", "f"])}`,
    () => "git rebase --continue",
    () => "git rebase --abort",
    () => `git reset --hard ${pick(["HEAD", "HEAD~1", "main", "f"])}`,
    () => `git reset ${pick(["HEAD ", "HEAD~1 ", "", "-- ", "HEAD -- "])}${n}`,
    () => `git reset${pick(["", " HEAD", " HEAD~1", " --soft", " --soft HEAD~1"])}`,
    () => `git reset --${pick(["hard", "soft"])} HEAD ${n}`,
    () => `git revert --no-edit ${pick(["HEAD", "HEAD~1", "f"])}`,
    () => "git revert --abort",
    () => `git cherry-pick ${pick(["f", "f~1", "main", "HEAD~1"])}`,
    () => "git cherry-pick --abort",
    () => `git merge --no-edit ${pick(["main", "f"])}`,
    () => "git merge --abort",
    () => `git diff ${pick(["", "HEAD ", "--staged ", "-- ", "HEAD -- ", "HEAD~1 "])}${n}`,
    () => `git switch ${pick(["HEAD~1", "--detach HEAD~1"])}`,
  ])();
}
/** Desvios já registrados: pular para enxergar o resto. */
function conhecido(r: any, c: string): boolean {
  const st = G.status(r);
  const dirty = st.staged.length + st.unstaged.length > 0;
  if (/^git (revert --no-edit|cherry-pick) [^-]/.test(c) && dirty) return true;
  return false;
}
const dif: { key: string; hist: string[]; detail: string }[] = [];
let total = 0;
let vazios = 0;
let iguais = 0;
for (let i = 0; i < N; i++) {
  const cwd = path.join(ROOT, `s${SEED}_${i}`);
  fs.rmSync(cwd, { recursive: true, force: true });
  fs.mkdirSync(cwd, { recursive: true });
  let repo: any = G.createRepo({ user: "t" });
  for (const c of SETUP) {
    real(cwd, c);
    repo = execute(repo, c.replace(" -q", "")).repo;
  }
  const hist: string[] = [];
  for (let k = 0; k < STEPS; k++) {
    const c = gerar();
    if (repo.rebase && c.startsWith("git commit")) continue;
    if (conhecido(repo, c)) continue;
    hist.push(c);
    total++;
    const rc = real(cwd, c);
    const res = execute(repo, c);
    repo = res.repo;
    const a = realState(cwd);
    const b = dojoState(repo);
    const tipo: string[] = [];
    // conflito: o Git real sai com 1, e o Dojo responde ok com o evento "conflict"
    if ((rc === 0) !== (res.ok && res.event !== "conflict")) tipo.push(`rc real=${rc} dojo ok=${res.ok}`);
    if (JSON.stringify(sortObj(a.files)) !== JSON.stringify(sortObj(b.files))) tipo.push(`arquivos real=${JSON.stringify(sortObj(a.files))} dojo=${JSON.stringify(sortObj(b.files))}`);
    if (a.st.join() !== b.st.join()) tipo.push(`status real=${a.st} dojo=${b.st}`);
    if (a.prog !== b.prog) tipo.push(`andamento real=${a.prog} dojo=${b.prog}`);
    if (a.head !== b.head) tipo.push(`HEAD real=${a.head} dojo=${b.head}`);
    if (c.startsWith("git diff") && rc === 0) {
      const x = cabecalhos(lastOut.split("\n"));
      const y = cabecalhos(res.lines);
      if (x !== y) tipo.push(`saida real=${x.slice(0, 200)} dojo=${y.slice(0, 200)}`);
      else iguais++;
    }
    if (/^git (revert|cherry-pick) /.test(c) && rc !== 0 && !a.st.some((x) => x.startsWith("U:"))) vazios++;
    if (tipo.length) {
      dif.push({ key: c.split(" ").slice(0, 3).join(" ").replace(/[a-z]\.txt/, "ARQ").replace(/c\d+/, "") + " | " + tipo.map((t) => t.split(" ")[0]).join(","), hist: [...hist], detail: tipo.join("\n    ") });
      break;
    }
  }
  fs.rmSync(cwd, { recursive: true, force: true });
}
function sortObj(o: Record<string, string>) {
  return Object.fromEntries(Object.entries(o).sort());
}
const grupos = new Map<string, typeof dif>();
for (const d of dif) grupos.set(d.key, [...(grupos.get(d.key) ?? []), d]);
console.log(`passos=${total} sequências=${N} divergências=${dif.length} revert/cherry-pick sem efeito=${vazios} diffs iguais=${iguais}`);
for (const [k, v] of [...grupos].sort((x, y) => y[1].length - x[1].length)) {
  const ex = v.sort((x, y) => x.hist.length - y.hist.length)[0];
  console.log(`\n[${v.length}x] ${k}\n  ${ex.hist.join(" ; ")}\n    ${ex.detail}`);
}
