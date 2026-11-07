/**
 * Motor Git do Dojo — um Git "de verdade" simplificado, 100% em memória.
 * Todas as operações são puras: recebem um Repo e devolvem um novo Repo.
 */
import { hashString, short } from "./hash";
import { merge3, hasConflictMarkers, diffLines, splitLines } from "./diff";
import { GitError } from "./types";
import type { Commit, FileStatus, Head, InProgress, Repo, Sha, Status, Tree } from "./types";

export { GitError, short };

// ---------- utilidades ----------

export function clone(repo: Repo): Repo {
  return structuredClone(repo);
}

export function createRepo(opts: { user?: string; initialized?: boolean } = {}): Repo {
  return {
    initialized: opts.initialized ?? false,
    commits: {},
    branches: {},
    head: { type: "branch", name: "main" },
    index: {},
    workdir: {},
    conflicts: [],
    inProgress: null,
    rebase: null,
    stash: [],
    remote: null,
    remoteRefs: {},
    user: { name: opts.user ?? "voce" },
    clock: 0,
    reflog: [],
  };
}

export function headSha(repo: Repo): Sha | null {
  if (repo.head.type === "detached") return repo.head.sha;
  return repo.branches[repo.head.name] ?? null;
}

export function headTree(repo: Repo): Tree {
  const sha = headSha(repo);
  return sha ? repo.commits[sha].tree : {};
}

export function currentBranch(repo: Repo): string | null {
  return repo.head.type === "branch" ? repo.head.name : null;
}

export function getCommit(repo: Repo, sha: Sha): Commit {
  const c = repo.commits[sha];
  if (!c) throw new GitError(`fatal: objeto ${short(sha)} não encontrado`);
  return c;
}

function assertInit(repo: Repo) {
  if (!repo.initialized) throw new GitError("fatal: não é um repositório git (nem nenhum dos diretórios pai): .git");
}

function assertBranchName(name: string) {
  if (!/^[A-Za-z0-9._\-/]+$/.test(name) || name.startsWith("-") || name.endsWith("/") || name.includes("..")) {
    throw new GitError(`fatal: '${name}' não é um nome de branch válido`);
  }
}

function assertNoInProgress(repo: Repo, what: string) {
  if (repo.inProgress) {
    throw new GitError(
      `erro: ${what} não é possível porque existe um ${repo.inProgress.kind} em andamento.\ndica: resolva os conflitos e faça 'git commit', ou use 'git ${repo.inProgress.kind} --abort'.`,
    );
  }
  if (repo.rebase) {
    throw new GitError(`erro: ${what} não é possível durante um rebase.\ndica: 'git rebase --continue' ou 'git rebase --abort'.`);
  }
}

/** Resolve uma referência: HEAD, HEAD~2, HEAD^, branch, origin/main, sha ou prefixo. */
export function resolve(repo: Repo, ref: string): Sha {
  assertInit(repo);
  const m = ref.match(/^(.+?)((?:[~^]\d*)+)$/);
  if (m) {
    let sha = resolve(repo, m[1]);
    const mods = m[2].match(/[~^]\d*/g) ?? [];
    for (const mod of mods) {
      const n = mod.length > 1 ? parseInt(mod.slice(1), 10) : 1;
      if (mod[0] === "~") {
        for (let i = 0; i < n; i++) {
          const c = getCommit(repo, sha);
          if (!c.parents[0]) throw new GitError(`fatal: '${ref}' aponta para antes do primeiro commit`);
          sha = c.parents[0];
        }
      } else {
        const c = getCommit(repo, sha);
        const p = c.parents[n - 1];
        if (!p) throw new GitError(`fatal: '${ref}' não existe (o commit não tem o pai ${n})`);
        sha = p;
      }
    }
    return sha;
  }
  if (ref === "HEAD" || ref === "@") {
    const sha = headSha(repo);
    if (!sha) throw new GitError("fatal: HEAD ainda não aponta para nenhum commit (faça o primeiro commit)");
    return sha;
  }
  if (ref === "MERGE_HEAD" && repo.inProgress?.other) return repo.inProgress.other;
  if (repo.branches[ref]) return repo.branches[ref];
  if (repo.remoteRefs[ref]) return repo.remoteRefs[ref];
  if (/^[0-9a-f]{4,40}$/.test(ref)) {
    const matches = Object.keys(repo.commits).filter((s) => s.startsWith(ref));
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) throw new GitError(`erro: '${ref}' é ambíguo — use mais caracteres do hash`);
  }
  if (/^[0-9a-f]{1,3}$/.test(ref)) {
    throw new GitError(`fatal: referência desconhecida: '${ref}'\ndica: um hash abreviado precisa de pelo menos 4 caracteres.`);
  }
  throw new GitError(`fatal: referência desconhecida: '${ref}'`);
}

export function ancestors(repo: Repo, sha: Sha, includeSelf = true): Set<Sha> {
  const seen = new Set<Sha>();
  const stack = [sha];
  while (stack.length) {
    const s = stack.pop()!;
    if (seen.has(s)) continue;
    seen.add(s);
    const c = repo.commits[s];
    if (c) stack.push(...c.parents);
  }
  if (!includeSelf) seen.delete(sha);
  return seen;
}

export function isAncestor(repo: Repo, maybeAncestor: Sha, of: Sha): boolean {
  return ancestors(repo, of).has(maybeAncestor);
}

export function mergeBase(repo: Repo, a: Sha, b: Sha): Sha | null {
  const aa = ancestors(repo, a);
  const bb = ancestors(repo, b);
  let best: Commit | null = null;
  for (const s of aa) {
    if (!bb.has(s)) continue;
    const c = repo.commits[s];
    if (!best || c.timestamp > best.timestamp) best = c;
  }
  return best?.sha ?? null;
}

/** Commits alcançáveis a partir de `from` que não são alcançáveis a partir de `exclude`. Ordem cronológica. */
export function commitsBetween(repo: Repo, exclude: Sha | null, from: Sha): Commit[] {
  const ex = exclude ? ancestors(repo, exclude) : new Set<Sha>();
  return [...ancestors(repo, from)]
    .filter((s) => !ex.has(s))
    .map((s) => repo.commits[s])
    .sort((x, y) => x.timestamp - y.timestamp);
}

function treeDiff(from: Tree, to: Tree): FileStatus[] {
  const out: FileStatus[] = [];
  const paths = new Set([...Object.keys(from), ...Object.keys(to)]);
  for (const p of [...paths].sort()) {
    if (!(p in from)) out.push({ path: p, kind: "new" });
    else if (!(p in to)) out.push({ path: p, kind: "deleted" });
    else if (from[p] !== to[p]) out.push({ path: p, kind: "modified" });
  }
  return out;
}

function isClean(repo: Repo): boolean {
  const s = status(repo);
  return s.staged.length === 0 && s.unstaged.length === 0 && s.conflicts.length === 0;
}

function assertClean(repo: Repo, what: string) {
  const s = status(repo);
  if (s.conflicts.length) throw new GitError(`erro: ${what} não é possível com conflitos não resolvidos.`);
  if (s.staged.length || s.unstaged.length) {
    const files = [...s.staged, ...s.unstaged].map((f) => `\t${f.path}`).join("\n");
    throw new GitError(
      `erro: suas alterações locais seriam sobrescritas por ${what}:\n${files}\ndica: faça commit ou 'git stash' antes de ${what}.`,
    );
  }
}

/** Arquivo em conflito sai do index, mas continua rastreado. */
function untrackedPaths(repo: Repo): string[] {
  return Object.keys(repo.workdir)
    .filter((p) => !(p in repo.index) && !repo.conflicts.includes(p))
    .sort();
}

function untrackedCollisions(repo: Repo, tree: Tree): string[] {
  return untrackedPaths(repo).filter((p) => p in tree);
}

function collisionMessage(files: string[], what: string): string {
  return `erro: estes arquivos não rastreados seriam sobrescritos por ${what}:\n${files.map((p) => `\t${p}`).join("\n")}\ndica: mova ou apague esses arquivos antes do ${what}.`;
}

/** Como no Git real, a recusa vale mesmo com o conteúdo idêntico. */
function assertNoUntrackedCollision(repo: Repo, tree: Tree, what: string) {
  const files = untrackedCollisions(repo, tree);
  if (files.length) throw new GitError(collisionMessage(files, what));
}

/** Troca a staging e a parte rastreada da pasta por `tree`. O que não é rastreado fica, salvo se `tree` tiver o mesmo caminho. */
function replaceTracked(r: Repo, tree: Tree, conflicts: string[] = []) {
  const workdir: Tree = { ...tree };
  for (const p of untrackedPaths(r)) if (!(p in tree)) workdir[p] = r.workdir[p];
  r.workdir = workdir;
  r.index = { ...tree };
  for (const p of conflicts) delete r.index[p];
  r.conflicts = conflicts;
}

function makeCommit(repo: Repo, parents: Sha[], message: string, tree: Tree, author = repo.user.name): Commit {
  const timestamp = repo.clock + 1;
  const sha = hashString(JSON.stringify({ parents, message, tree, author, timestamp }));
  return { sha, parents, message, tree: { ...tree }, author, timestamp };
}

function pushReflog(repo: Repo, action: string) {
  const sha = headSha(repo);
  if (sha) repo.reflog.unshift({ sha, action });
  if (repo.reflog.length > 50) repo.reflog.length = 50;
}

// ---------- sistema de arquivos ----------

export function writeFile(repo: Repo, path: string, content: string): Repo {
  const r = clone(repo);
  r.workdir[path] = content;
  return r;
}

export function appendFile(repo: Repo, path: string, content: string): Repo {
  const r = clone(repo);
  const prev = r.workdir[path] ?? "";
  r.workdir[path] = prev + (prev && !prev.endsWith("\n") ? "\n" : "") + content;
  return r;
}

export function deleteFile(repo: Repo, path: string): Repo {
  if (!(path in repo.workdir)) throw new GitError(`rm: ${path}: arquivo não encontrado`);
  const r = clone(repo);
  delete r.workdir[path];
  return r;
}

export function readFile(repo: Repo, path: string): string {
  if (!(path in repo.workdir)) throw new GitError(`cat: ${path}: arquivo não encontrado`);
  return repo.workdir[path];
}

// ---------- comandos git ----------

export function init(repo: Repo): Repo {
  if (repo.initialized) throw new GitError("Repositório Git já inicializado nesta pasta.");
  const r = clone(repo);
  r.initialized = true;
  r.head = { type: "branch", name: "main" };
  return r;
}

export function status(repo: Repo): Status {
  assertInit(repo);
  const head = headTree(repo);
  const staged = treeDiff(head, repo.index).filter((f) => !repo.conflicts.includes(f.path));
  const unstaged = treeDiff(repo.index, repo.workdir).filter((f) => f.kind !== "new" && !repo.conflicts.includes(f.path));
  const untracked = untrackedPaths(repo);
  const branch = currentBranch(repo);
  let ahead = 0;
  let behind = 0;
  let hasUpstream = false;
  if (branch && repo.remote) {
    const upstream = repo.remoteRefs[`${repo.remote.name}/${branch}`];
    const local = repo.branches[branch];
    if (upstream && local) {
      hasUpstream = true;
      ahead = commitsBetween(repo, upstream, local).length;
      behind = commitsBetween(repo, local, upstream).length;
    }
  }
  return {
    branch,
    detachedSha: repo.head.type === "detached" ? repo.head.sha : null,
    staged,
    unstaged,
    untracked,
    conflicts: [...repo.conflicts],
    inProgress: repo.inProgress,
    rebase: repo.rebase,
    ahead,
    behind,
    hasUpstream,
  };
}

export function add(repo: Repo, paths: string[]): Repo {
  assertInit(repo);
  const r = clone(repo);
  const all = paths.includes(".") || paths.includes("-A") || paths.includes("--all");
  const targets = all ? new Set([...Object.keys(r.workdir), ...Object.keys(r.index)]) : new Set(paths);
  for (const p of targets) {
    if (p in r.workdir) {
      if (r.conflicts.includes(p) && hasConflictMarkers(r.workdir[p])) {
        throw new GitError(
          `erro: '${p}' ainda contém marcadores de conflito (<<<<<<<, =======, >>>>>>>).\ndica: edite o arquivo, escolha o conteúdo final e remova os marcadores antes do 'git add'.\natenção: este bloqueio é uma proteção do Dojo. O Git real aceitaria o 'git add', e os marcadores iriam para o commit.`,
        );
      }
      r.index[p] = r.workdir[p];
      r.conflicts = r.conflicts.filter((c) => c !== p);
    } else if (p in r.index) {
      delete r.index[p];
      r.conflicts = r.conflicts.filter((c) => c !== p);
    } else {
      throw new GitError(`fatal: pathspec '${p}' não corresponde a nenhum arquivo`);
    }
  }
  return r;
}

export function unstage(repo: Repo, paths: string[]): Repo {
  assertInit(repo);
  const r = clone(repo);
  const head = headTree(r);
  const targets = paths.length === 0 || paths.includes(".") ? Object.keys({ ...r.index, ...head }) : paths;
  for (const p of targets) {
    if (p in head) r.index[p] = head[p];
    else delete r.index[p];
  }
  return r;
}

export function commit(repo: Repo, message: string, opts: { author?: string; allowEmpty?: boolean } = {}): Repo {
  assertInit(repo);
  if (!message.trim()) throw new GitError("Abortando commit: mensagem vazia. Use: git commit -m \"sua mensagem\"");
  if (repo.conflicts.length) {
    throw new GitError(
      `erro: commit não é possível: você tem arquivos com conflito não resolvido.\n${repo.conflicts.map((c) => `\t${c}`).join("\n")}\ndica: resolva o conflito, rode 'git add <arquivo>' e depois 'git commit'.`,
    );
  }
  if (repo.rebase) throw new GitError("erro: você está no meio de um rebase. Use 'git rebase --continue'.");
  const r = clone(repo);
  const parent = headSha(r);
  const parents = parent ? [parent] : [];
  if (r.inProgress?.other) parents.push(r.inProgress.other);
  const stagedChanges = treeDiff(headTree(r), r.index);
  if (!stagedChanges.length && !r.inProgress && !opts.allowEmpty) {
    const s = status(r);
    if (s.unstaged.length || s.untracked.length) {
      throw new GitError(
        "nada adicionado ao commit, mas há arquivos modificados ou não rastreados.\ndica: use 'git add <arquivo>' para incluir o que vai no commit.",
      );
    }
    throw new GitError("nada para commitar, árvore de trabalho limpa");
  }
  const c = makeCommit(r, parents, message.trim(), r.index, opts.author);
  r.commits[c.sha] = c;
  r.clock = c.timestamp;
  if (r.head.type === "branch") r.branches[r.head.name] = c.sha;
  else r.head = { type: "detached", sha: c.sha };
  r.inProgress = null;
  pushReflog(r, `commit: ${c.message}`);
  return r;
}

export function branchCreate(repo: Repo, name: string, startPoint?: string): Repo {
  assertInit(repo);
  assertBranchName(name);
  if (repo.branches[name]) throw new GitError(`fatal: a branch '${name}' já existe`);
  const sha = startPoint ? resolve(repo, startPoint) : headSha(repo);
  if (!sha) throw new GitError("fatal: não é possível criar branch antes do primeiro commit");
  const r = clone(repo);
  r.branches[name] = sha;
  return r;
}

export function branchDelete(repo: Repo, name: string, force = false): Repo {
  assertInit(repo);
  if (!repo.branches[name]) throw new GitError(`erro: a branch '${name}' não foi encontrada`);
  if (currentBranch(repo) === name) throw new GitError(`erro: não é possível apagar a branch '${name}' — você está nela agora.`);
  const head = headSha(repo);
  if (!force && head && !isAncestor(repo, repo.branches[name], head)) {
    throw new GitError(
      `erro: a branch '${name}' tem commits que ainda não foram mergeados.\ndica: se tem certeza, use 'git branch -D ${name}'.`,
    );
  }
  const r = clone(repo);
  delete r.branches[name];
  return r;
}

export function branchRename(repo: Repo, from: string, to: string): Repo {
  assertInit(repo);
  if (!repo.branches[from]) throw new GitError(`erro: a branch '${from}' não existe`);
  assertBranchName(to);
  if (repo.branches[to]) throw new GitError(`fatal: a branch '${to}' já existe`);
  const r = clone(repo);
  r.branches[to] = r.branches[from];
  delete r.branches[from];
  if (r.head.type === "branch" && r.head.name === from) r.head = { type: "branch", name: to };
  return r;
}

/** Troca a árvore de trabalho para `targetSha`, preservando alterações locais que não conflitem. */
function switchTree(r: Repo, targetSha: Sha | null, what: string) {
  const oldHead = headTree(r);
  const target = targetSha ? r.commits[targetSha].tree : {};
  const localWork = treeDiff(oldHead, r.workdir);
  const localIndex = treeDiff(oldHead, r.index);
  const touched = new Set([...localWork, ...localIndex].map((f) => f.path));
  const blocked = [...touched].filter((p) => (oldHead[p] ?? null) !== (target[p] ?? null) && p in oldHead);
  if (r.conflicts.length) throw new GitError(`erro: ${what} não é possível com conflitos não resolvidos.`);
  if (blocked.length) {
    throw new GitError(
      `erro: suas alterações locais nos arquivos abaixo seriam sobrescritas por ${what}:\n${blocked.map((p) => `\t${p}`).join("\n")}\ndica: faça commit ou 'git stash' antes de trocar de branch.`,
    );
  }
  const newWork: Tree = { ...target };
  const newIndex: Tree = { ...target };
  for (const p of touched) {
    if (p in r.workdir) newWork[p] = r.workdir[p];
    else delete newWork[p];
    if (p in r.index) newIndex[p] = r.index[p];
    else delete newIndex[p];
  }
  // arquivos não rastreados continuam
  for (const p of Object.keys(r.workdir)) if (!(p in r.index) && !(p in target)) newWork[p] = r.workdir[p];
  r.workdir = newWork;
  r.index = newIndex;
}

export function checkout(repo: Repo, target: string, opts: { create?: boolean; force?: boolean; startPoint?: string; detach?: boolean } = {}): Repo {
  assertInit(repo);
  assertNoInProgress(repo, "trocar de branch");
  let r = clone(repo);
  if (opts.create) {
    r = branchCreate(r, target, opts.startPoint);
  }
  if (!opts.detach && currentBranch(r) === target) {
    throw new GitError(`Você já está em '${target}'`);
  }
  const isBranch = !opts.detach && target in r.branches;
  const sha = target in r.branches ? r.branches[target] : resolve(r, target);
  if (opts.force) {
    r.workdir = { ...r.commits[sha].tree };
    r.index = { ...r.commits[sha].tree };
    r.conflicts = [];
  } else {
    switchTree(r, sha, "checkout");
  }
  r.head = isBranch ? { type: "branch", name: target } : { type: "detached", sha };
  pushReflog(r, `checkout: ${target}`);
  return r;
}

/** Restaura um arquivo do index (descartando mudanças locais) ou do HEAD. */
export function restoreFile(repo: Repo, path: string, opts: { staged?: boolean; source?: string } = {}): Repo {
  assertInit(repo);
  const r = clone(repo);
  if (opts.staged) return unstage(r, [path]);
  const src: Tree = opts.source ? r.commits[resolve(r, opts.source)].tree : r.index;
  if (!(path in src)) throw new GitError(`erro: pathspec '${path}' não corresponde a nenhum arquivo conhecido pelo git`);
  r.workdir[path] = src[path];
  return r;
}

// ---------- merge ----------

export interface MergeResult {
  repo: Repo;
  kind: "up-to-date" | "fast-forward" | "merge-commit" | "conflict";
  conflicts: string[];
  from: Sha;
  to: Sha;
}

/** Faz o merge 3-way de duas árvores. Devolve a árvore resultante e os arquivos em conflito. */
function mergeTrees(base: Tree, ours: Tree, theirs: Tree, labels: { ours: string; theirs: string }) {
  const tree: Tree = {};
  const conflicts: string[] = [];
  const paths = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
  for (const p of [...paths].sort()) {
    const b = base[p];
    const o = ours[p];
    const t = theirs[p];
    if (o === t) {
      if (o !== undefined) tree[p] = o;
    } else if (o === b) {
      if (t !== undefined) tree[p] = t;
    } else if (t === b) {
      if (o !== undefined) tree[p] = o;
    } else if (o === undefined || t === undefined) {
      // modificado de um lado, apagado do outro
      conflicts.push(p);
      tree[p] = (o ?? t) as string;
    } else {
      const m = merge3(b ?? "", o, t, labels);
      tree[p] = m.text;
      if (m.conflict) conflicts.push(p);
    }
  }
  return { tree, conflicts };
}

/** Como no Git real, o merge só recusa trabalho local que ele sobrescreveria. */
function assertMergeKeepsLocalWork(repo: Repo, merged: Tree, conflicts: string[] = []) {
  const s = status(repo);
  const head = headTree(repo);
  const touched = (p: string) => conflicts.includes(p) || head[p] !== merged[p];
  const dirty = [...new Set([...s.staged, ...s.unstaged].map((f) => f.path))].filter(touched);
  if (dirty.length) {
    throw new GitError(`erro: suas alterações locais seriam sobrescritas por merge:\n${dirty.map((p) => `\t${p}`).join("\n")}\ndica: faça commit ou 'git stash' antes do merge.`);
  }
  assertNoUntrackedCollision(repo, merged, "merge");
}

export function merge(repo: Repo, ref: string, opts: { noFf?: boolean; message?: string } = {}): MergeResult {
  assertInit(repo);
  assertNoInProgress(repo, "merge");
  if (repo.conflicts.length) throw new GitError("erro: merge não é possível com conflitos não resolvidos.");
  const head = headSha(repo);
  if (!head) throw new GitError("fatal: faça o primeiro commit antes de um merge");
  const target = resolve(repo, ref);
  if (target === head || isAncestor(repo, target, head)) {
    return { repo, kind: "up-to-date", conflicts: [], from: head, to: target };
  }
  const r = clone(repo);
  if (isAncestor(r, head, target) && !opts.noFf) {
    assertMergeKeepsLocalWork(r, r.commits[target].tree);
    switchTree(r, target, "merge");
    if (r.head.type === "branch") r.branches[r.head.name] = target;
    else r.head = { type: "detached", sha: target };
    pushReflog(r, `merge ${ref}: fast-forward`);
    return { repo: r, kind: "fast-forward", conflicts: [], from: head, to: target };
  }
  const baseSha = mergeBase(r, head, target);
  const base = baseSha ? r.commits[baseSha].tree : {};
  const label = currentBranch(r) ?? short(head);
  const ours = r.commits[head].tree;
  const { tree, conflicts } = mergeTrees(base, ours, r.commits[target].tree, { ours: label, theirs: ref });
  const staged = status(r).staged;
  if (staged.length) {
    // só o merge de três vias exige a staging limpa: o commit de merge não pode levar outra coisa junto
    throw new GitError(`erro: suas alterações locais seriam sobrescritas por merge:\n${staged.map((f) => `\t${f.path}`).join("\n")}\ndica: este merge cria um commit, então a staging precisa estar limpa. Faça commit ou 'git stash' antes.`);
  }
  assertMergeKeepsLocalWork(r, tree, conflicts);
  const message = opts.message ?? `Merge branch '${ref}'${currentBranch(r) && currentBranch(r) !== "main" ? ` into ${currentBranch(r)}` : ""}`;
  const touched = [...new Set([...Object.keys(ours), ...Object.keys(tree)])].filter((p) => ours[p] !== tree[p] || conflicts.includes(p));
  for (const p of touched) {
    if (p in tree) r.workdir[p] = tree[p];
    else delete r.workdir[p];
  }
  r.index = { ...tree };
  for (const c of conflicts) delete r.index[c];
  r.conflicts = conflicts;
  r.inProgress = { kind: "merge", other: target, message, label: ref, touched };
  if (conflicts.length) return { repo: r, kind: "conflict", conflicts, from: head, to: target };
  const done = commit(r, message);
  return { repo: done, kind: "merge-commit", conflicts: [], from: head, to: target };
}

export function abortInProgress(repo: Repo, kind: InProgress["kind"]): Repo {
  if (!repo.inProgress || repo.inProgress.kind !== kind) throw new GitError(`fatal: não há ${kind} em andamento`);
  const r = clone(repo);
  const head = headTree(r);
  const touched = r.inProgress!.touched;
  if (touched) {
    for (const p of touched) {
      if (p in head) r.workdir[p] = head[p];
      else delete r.workdir[p];
    }
  } else {
    r.workdir = { ...head };
  }
  r.index = { ...head };
  r.conflicts = [];
  r.inProgress = null;
  return r;
}

// ---------- rebase ----------

export interface RebaseResult {
  repo: Repo;
  /** blocked: um arquivo não rastreado está no caminho. Antes de começar, nada muda; no meio, o rebase fica parado. */
  kind: "up-to-date" | "fast-forward" | "rebased" | "conflict" | "done" | "blocked";
  applied: number;
  conflicts: string[];
  /** explicação de um resultado blocked */
  message?: string;
}

function applyCommitOnto(r: Repo, c: Commit, ontoTree: Tree): { tree: Tree; conflicts: string[] } {
  const parentTree = c.parents[0] ? r.commits[c.parents[0]].tree : {};
  return mergeTrees(parentTree, ontoTree, c.tree, { ours: "HEAD", theirs: `${short(c.sha)} (${c.message})` });
}

function continueRebaseLoop(r: Repo): RebaseResult {
  const rb = r.rebase!;
  while (rb.todo.length) {
    const sha = rb.todo[0];
    const c = r.commits[sha];
    const ontoTree = r.commits[rb.head].tree;
    const { tree, conflicts } = applyCommitOnto(r, c, ontoTree);
    const collisions = untrackedCollisions(r, tree);
    if (collisions.length) {
      r.head = { type: "detached", sha: rb.head };
      const message = `${collisionMessage(collisions, "rebase")}\nO rebase parou antes do commit ${short(sha)} (${c.message}).\ndica: depois disso, 'git rebase --continue' tenta de novo. Para desistir: 'git rebase --abort'.`;
      return { repo: r, kind: "blocked", applied: 0, conflicts: [], message };
    }
    replaceTracked(r, tree, conflicts);
    if (conflicts.length) {
      rb.current = sha;
      r.head = { type: "detached", sha: rb.head };
      return { repo: r, kind: "conflict", applied: 0, conflicts };
    }
    const nc = makeCommit(r, [rb.head], c.message, tree, c.author);
    // evita colisão com commit idêntico já existente
    r.commits[nc.sha] = nc;
    r.clock = nc.timestamp;
    rb.head = nc.sha;
    rb.todo.shift();
  }
  // terminou
  if (rb.branch) {
    r.branches[rb.branch] = rb.head;
    r.head = { type: "branch", name: rb.branch };
  } else {
    r.head = { type: "detached", sha: rb.head };
  }
  r.rebase = null;
  pushReflog(r, "rebase: finished");
  return { repo: r, kind: "done", applied: 0, conflicts: [] };
}

export function rebase(repo: Repo, upstreamRef: string): RebaseResult {
  assertInit(repo);
  assertNoInProgress(repo, "rebase");
  assertClean(repo, "rebase");
  const head = headSha(repo);
  if (!head) throw new GitError("fatal: faça o primeiro commit antes de um rebase");
  const upstream = resolve(repo, upstreamRef);
  if (upstream === head || isAncestor(repo, upstream, head)) {
    return { repo, kind: "up-to-date", applied: 0, conflicts: [] };
  }
  const collisions = untrackedCollisions(repo, repo.commits[upstream].tree);
  if (collisions.length) return { repo, kind: "blocked", applied: 0, conflicts: [], message: collisionMessage(collisions, "rebase") };
  const r = clone(repo);
  if (isAncestor(r, head, upstream)) {
    switchTree(r, upstream, "rebase");
    if (r.head.type === "branch") r.branches[r.head.name] = upstream;
    else r.head = { type: "detached", sha: upstream };
    return { repo: r, kind: "fast-forward", applied: 0, conflicts: [] };
  }
  const todo = commitsBetween(r, upstream, head)
    .filter((c) => c.parents.length <= 1) // merges são descartados no rebase simples, como no git
    .map((c) => c.sha);
  r.rebase = { branch: currentBranch(r), originalTip: head, onto: upstream, todo, current: null, head: upstream };
  replaceTracked(r, r.commits[upstream].tree);
  const res = continueRebaseLoop(r);
  if (res.kind === "done") return { ...res, kind: "rebased", applied: todo.length };
  return res;
}

export function rebaseContinue(repo: Repo): RebaseResult {
  if (!repo.rebase) throw new GitError("fatal: não há rebase em andamento");
  if (repo.conflicts.length) {
    throw new GitError(
      `erro: ainda há conflitos não resolvidos:\n${repo.conflicts.map((c) => `\t${c}`).join("\n")}\ndica: edite, 'git add <arquivo>' e então 'git rebase --continue'.`,
    );
  }
  const r = clone(repo);
  const rb = r.rebase!;
  if (rb.current) {
    const cur = r.commits[rb.current];
    const stagedChanges = treeDiff(r.commits[rb.head].tree, r.index);
    if (stagedChanges.length) {
      const nc = makeCommit(r, [rb.head], cur.message, r.index, cur.author);
      r.commits[nc.sha] = nc;
      r.clock = nc.timestamp;
      rb.head = nc.sha;
    }
    rb.todo.shift();
    rb.current = null;
  } else if (!isClean(r)) {
    // parado por colisão: nenhum commit ficou pela metade, e o próximo sobrescreveria essas alterações
    throw new GitError("erro: há alterações pendentes, e o rebase parou antes de aplicar o próximo commit.\ndica: 'git status' mostra o que mudou. 'git restore --staged <arquivo>' tira da staging.");
  }
  return continueRebaseLoop(r);
}

export function rebaseAbort(repo: Repo): Repo {
  if (!repo.rebase) throw new GitError("fatal: não há rebase em andamento");
  assertNoUntrackedCollision(repo, repo.commits[repo.rebase.originalTip].tree, "rebase --abort");
  const r = clone(repo);
  const rb = r.rebase!;
  if (rb.branch) {
    r.branches[rb.branch] = rb.originalTip;
    r.head = { type: "branch", name: rb.branch };
  } else r.head = { type: "detached", sha: rb.originalTip };
  replaceTracked(r, r.commits[rb.originalTip].tree);
  r.rebase = null;
  return r;
}

// ---------- reset / revert / cherry-pick ----------

export function reset(repo: Repo, ref: string, mode: "soft" | "mixed" | "hard" = "mixed"): Repo {
  assertInit(repo);
  const sha = resolve(repo, ref);
  const r = clone(repo);
  if (r.head.type === "branch") r.branches[r.head.name] = sha;
  else r.head = { type: "detached", sha };
  const tree = r.commits[sha].tree;
  if (mode !== "soft") r.index = { ...tree };
  if (mode === "hard") {
    r.workdir = { ...tree };
    r.conflicts = [];
    r.inProgress = null;
  }
  pushReflog(r, `reset: moving to ${ref}`);
  return r;
}

export function revert(repo: Repo, ref: string): MergeResult {
  assertInit(repo);
  assertNoInProgress(repo, "revert");
  assertClean(repo, "revert");
  const sha = resolve(repo, ref);
  const c = getCommit(repo, sha);
  if (c.parents.length > 1) throw new GitError("erro: reverter um commit de merge exige escolher o pai (-m) — fora do escopo deste treinamento.");
  const head = headSha(repo)!;
  const r = clone(repo);
  const parentTree = c.parents[0] ? r.commits[c.parents[0]].tree : {};
  const { tree, conflicts } = mergeTrees(c.tree, r.commits[head].tree, parentTree, { ours: "HEAD", theirs: `parent of ${short(sha)}` });
  const message = `Revert "${c.message}"\n\nThis reverts commit ${sha}.`;
  r.workdir = { ...tree };
  r.index = { ...tree };
  for (const p of conflicts) delete r.index[p];
  r.conflicts = conflicts;
  r.inProgress = { kind: "revert", other: null, message, label: short(sha) };
  if (conflicts.length) return { repo: r, kind: "conflict", conflicts, from: head, to: sha };
  return { repo: commit(r, message), kind: "merge-commit", conflicts: [], from: head, to: sha };
}

export function cherryPick(repo: Repo, ref: string): MergeResult {
  assertInit(repo);
  assertNoInProgress(repo, "cherry-pick");
  assertClean(repo, "cherry-pick");
  const sha = resolve(repo, ref);
  const c = getCommit(repo, sha);
  const head = headSha(repo)!;
  const r = clone(repo);
  const { tree, conflicts } = applyCommitOnto(r, c, r.commits[head].tree);
  r.workdir = { ...tree };
  r.index = { ...tree };
  for (const p of conflicts) delete r.index[p];
  r.conflicts = conflicts;
  r.inProgress = { kind: "cherry-pick", other: null, message: c.message, label: short(sha) };
  if (conflicts.length) return { repo: r, kind: "conflict", conflicts, from: head, to: sha };
  return { repo: commit(r, c.message), kind: "merge-commit", conflicts: [], from: head, to: sha };
}

// ---------- stash ----------

export function stashPush(repo: Repo, message?: string): Repo {
  assertInit(repo);
  const s = status(repo);
  if (!s.staged.length && !s.unstaged.length) throw new GitError("Nenhuma alteração local para guardar (stash)");
  const head = headSha(repo)!;
  const r = clone(repo);
  const tracked: Tree = {};
  for (const p of Object.keys(r.workdir)) if (p in r.index) tracked[p] = r.workdir[p];
  r.stash.unshift({
    message: message ?? `WIP on ${currentBranch(r) ?? short(head)}: ${short(head)} ${r.commits[head].message}`,
    base: head,
    workdir: tracked,
    index: { ...r.index },
  });
  const tree = headTree(r);
  const untracked: Tree = {};
  for (const p of Object.keys(r.workdir)) if (!(p in r.index)) untracked[p] = r.workdir[p];
  r.workdir = { ...tree, ...untracked };
  r.index = { ...tree };
  return r;
}

export function stashPop(repo: Repo, apply = false): Repo {
  assertInit(repo);
  if (!repo.stash.length) throw new GitError("Nenhuma entrada de stash encontrada.");
  const r = clone(repo);
  const entry = apply ? r.stash[0] : r.stash.shift()!;
  const head = headTree(r);
  const baseTree = r.commits[entry.base].tree;
  const { tree, conflicts } = mergeTrees(baseTree, head, entry.workdir, { ours: "Updated upstream", theirs: "Stashed changes" });
  r.workdir = { ...r.workdir, ...tree };
  r.conflicts = conflicts;
  return r;
}

// ---------- remoto simulado ----------

export function addRemote(repo: Repo, name = "origin"): Repo {
  const r = clone(repo);
  r.remote = { name, branches: {}, commits: {} };
  return r;
}

export function fetch(repo: Repo): Repo {
  assertInit(repo);
  if (!repo.remote) throw new GitError("fatal: nenhum remoto configurado (origin)");
  const r = clone(repo);
  for (const [sha, c] of Object.entries(r.remote!.commits)) if (!r.commits[sha]) r.commits[sha] = c;
  for (const [b, sha] of Object.entries(r.remote!.branches)) r.remoteRefs[`${r.remote!.name}/${b}`] = sha;
  r.clock = Math.max(r.clock, ...Object.values(r.commits).map((c) => c.timestamp));
  return r;
}

export function push(repo: Repo, opts: { setUpstream?: boolean; force?: boolean; branch?: string } = {}): { repo: Repo; branch: string; from: Sha | null; to: Sha; newBranch: boolean } {
  assertInit(repo);
  if (!repo.remote) throw new GitError("fatal: nenhum remoto configurado (origin)");
  const branch = opts.branch ?? currentBranch(repo);
  if (!branch) throw new GitError("fatal: você está com HEAD desanexado (detached). Faça checkout de uma branch antes do push.");
  const local = repo.branches[branch];
  if (!local) throw new GitError(`erro: a branch '${branch}' não existe localmente`);
  const r = clone(repo);
  const remoteSha = r.remote!.branches[branch] ?? null;
  if (remoteSha && remoteSha !== local && !isAncestor(r, remoteSha, local) && !opts.force) {
    throw new GitError(
      ` ! [rejected]        ${branch} -> ${branch} (fetch first)\nerror: falha ao enviar para 'origin'\ndica: o remoto tem commits que você ainda não tem. Integre-os antes de enviar:\ndica:   git pull --rebase   (ou git pull) e depois git push.`,
    );
  }
  for (const s of ancestors(r, local)) r.remote!.commits[s] = r.commits[s];
  r.remote!.branches[branch] = local;
  r.remoteRefs[`${r.remote!.name}/${branch}`] = local;
  return { repo: r, branch, from: remoteSha, to: local, newBranch: !remoteSha };
}

export interface PullResult {
  repo: Repo;
  kind: "up-to-date" | "fast-forward" | "merge-commit" | "conflict" | "rebased" | "blocked";
  conflicts: string[];
  /** explicação de um resultado blocked */
  message?: string;
}

export function pull(repo: Repo, opts: { rebase?: boolean } = {}): PullResult {
  assertInit(repo);
  if (!repo.remote) throw new GitError("fatal: nenhum remoto configurado (origin)");
  const branch = currentBranch(repo);
  if (!branch) throw new GitError("fatal: HEAD desanexado — faça checkout de uma branch antes do pull.");
  const r = fetch(repo);
  const ref = `${r.remote!.name}/${branch}`;
  if (!r.remoteRefs[ref]) throw new GitError(`fatal: a branch '${branch}' não existe no remoto 'origin'`);
  if (opts.rebase) {
    const res = rebase(r, ref);
    if (res.kind === "blocked") return { repo: res.repo, kind: "blocked", conflicts: [], message: res.message };
    if (res.kind === "conflict") return { repo: res.repo, kind: "conflict", conflicts: res.conflicts };
    if (res.kind === "up-to-date") return { repo: res.repo, kind: "up-to-date", conflicts: [] };
    if (res.kind === "fast-forward") return { repo: res.repo, kind: "fast-forward", conflicts: [] };
    return { repo: res.repo, kind: "rebased", conflicts: [] };
  }
  const res = merge(r, ref, { message: `Merge branch '${branch}' of origin` });
  return { repo: res.repo, kind: res.kind, conflicts: res.conflicts };
}

/** Simula um colega enviando um commit para o remoto (usado pelas missões). */
export function remoteCommit(repo: Repo, branch: string, author: string, message: string, changes: (tree: Tree) => Tree): Repo {
  const r = clone(repo);
  if (!r.remote) r.remote = { name: "origin", branches: {}, commits: {} };
  const parent = r.remote.branches[branch] ?? null;
  const parentTree = parent ? r.remote.commits[parent].tree : {};
  const tree = changes({ ...parentTree });
  const maxTs = Math.max(r.clock, ...Object.values(r.remote.commits).map((c) => c.timestamp), 0);
  const timestamp = maxTs + 1;
  const sha = hashString(JSON.stringify({ parents: parent ? [parent] : [], message, tree, author, timestamp }));
  r.remote.commits[sha] = { sha, parents: parent ? [parent] : [], message, tree, author, timestamp };
  r.remote.branches[branch] = sha;
  r.clock = timestamp;
  return r;
}

// ---------- consultas ----------

export interface LogEntry {
  commit: Commit;
  refs: string[];
}

export function log(repo: Repo, opts: { all?: boolean; from?: string; limit?: number } = {}): LogEntry[] {
  assertInit(repo);
  const starts: Sha[] = [];
  if (opts.all) {
    starts.push(...Object.values(repo.branches), ...Object.values(repo.remoteRefs));
    const h = headSha(repo);
    if (h) starts.push(h);
  } else {
    const sha = opts.from ? resolve(repo, opts.from) : headSha(repo);
    if (!sha) throw new GitError("fatal: sua branch atual 'main' ainda não possui nenhum commit");
    starts.push(sha);
  }
  const seen = new Set<Sha>();
  for (const s of starts) for (const a of ancestors(repo, s)) seen.add(a);
  const entries = [...seen]
    .map((s) => repo.commits[s])
    .sort((a, b) => b.timestamp - a.timestamp)
    .map((c) => ({ commit: c, refs: refsAt(repo, c.sha) }));
  return opts.limit ? entries.slice(0, opts.limit) : entries;
}

export function refsAt(repo: Repo, sha: Sha): string[] {
  const refs: string[] = [];
  const head = headSha(repo);
  if (head === sha) refs.push(repo.head.type === "branch" ? `HEAD -> ${repo.head.name}` : "HEAD");
  for (const [b, s] of Object.entries(repo.branches)) if (s === sha && !(repo.head.type === "branch" && repo.head.name === b)) refs.push(b);
  for (const [b, s] of Object.entries(repo.remoteRefs)) if (s === sha) refs.push(b);
  return refs;
}

export function diffText(repo: Repo, opts: { staged?: boolean; from?: string; to?: string } = {}): string[] {
  assertInit(repo);
  let a: Tree;
  let b: Tree;
  if (opts.from) {
    a = repo.commits[resolve(repo, opts.from)].tree;
    b = opts.to ? repo.commits[resolve(repo, opts.to)].tree : repo.workdir;
  } else if (opts.staged) {
    a = headTree(repo);
    b = repo.index;
  } else {
    a = repo.index;
    b = repo.workdir;
  }
  return renderDiff(a, b, !opts.from && !opts.staged);
}

/** O que um commit mudou em relação ao primeiro pai. No commit-raiz, todos os arquivos aparecem como novos. */
export function commitDiff(repo: Repo, sha: Sha): string[] {
  const c = getCommit(repo, sha);
  return renderDiff(c.parents[0] ? repo.commits[c.parents[0]].tree : {}, c.tree);
}

function renderDiff(a: Tree, b: Tree, skipUntracked = false): string[] {
  const lines: string[] = [];
  for (const f of treeDiff(a, b)) {
    if (skipUntracked && f.kind === "new") continue; // untracked não aparece em git diff
    lines.push(`diff --git a/${f.path} b/${f.path}`);
    if (f.kind === "new") lines.push("new file mode 100644");
    if (f.kind === "deleted") lines.push("deleted file mode 100644");
    lines.push(f.kind === "new" ? "--- /dev/null" : `--- a/${f.path}`, f.kind === "deleted" ? "+++ /dev/null" : `+++ b/${f.path}`);
    const ops = diffLines(splitLines(a[f.path] ?? ""), splitLines(b[f.path] ?? ""));
    for (const op of ops) lines.push(op.kind === "same" ? ` ${op.text}` : op.kind === "add" ? `+${op.text}` : `-${op.text}`);
  }
  return lines;
}

export function allBranches(repo: Repo): string[] {
  return Object.keys(repo.branches).sort();
}

export function isCleanRepo(repo: Repo): boolean {
  return repo.initialized && isClean(repo);
}

export function headRef(repo: Repo): Head {
  return repo.head;
}
