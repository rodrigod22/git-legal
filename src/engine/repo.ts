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
    theirs: {},
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

function collisionMessage(files: string[], what: string, verb = "sobrescritos"): string {
  return `erro: estes arquivos não rastreados seriam ${verb} por ${what}:\n${files.map((p) => `\t${p}`).join("\n")}\ndica: mova ou apague esses arquivos antes do ${what}.`;
}

/** Não rastreado em caminho que a troca de `from` para `to` muda: o Git recusa sobrescrevê-lo ou removê-lo. O que a troca não muda fica como está. */
function assertNoUntrackedInChangedPaths(repo: Repo, from: Tree, to: Tree, what: string) {
  const files = untrackedPaths(repo).filter((p) => (from[p] ?? null) !== (to[p] ?? null));
  if (files.length) throw new GitError(collisionMessage(files, what, files.every((p) => p in to) ? "sobrescritos" : "removidos"));
}

/** Como no Git real, a recusa vale mesmo com o conteúdo idêntico. */
function assertNoUntrackedCollision(repo: Repo, tree: Tree, what: string) {
  const files = untrackedCollisions(repo, tree);
  if (files.length) throw new GitError(collisionMessage(files, what));
}

/** Troca a staging e a parte rastreada da pasta por `tree`. O que não é rastreado fica, salvo se `tree` tiver o mesmo caminho. */
function replaceTracked(r: Repo, tree: Tree, conflicts: string[] = [], theirs: Theirs = {}) {
  const workdir: Tree = { ...tree };
  for (const p of untrackedPaths(r)) if (!(p in tree)) workdir[p] = r.workdir[p];
  r.workdir = workdir;
  r.index = { ...tree };
  for (const p of conflicts) delete r.index[p];
  r.conflicts = conflicts;
  r.theirs = theirs;
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

/** O caminho está no que foi pedido: o próprio arquivo, uma pasta ou `.`, que é tudo. */
export function matchesPath(path: string, spec: string): boolean {
  const dir = spec.replace(/\/+$/, "");
  return spec === "." || path === dir || path.startsWith(`${dir}/`);
}

export function existsInWorkdir(repo: Repo, spec: string): boolean {
  return spec === "." || Object.keys(repo.workdir).some((p) => matchesPath(p, spec));
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
      delete r.theirs[p];
    } else if (p in r.index) {
      delete r.index[p];
      r.conflicts = r.conflicts.filter((c) => c !== p);
      delete r.theirs[p];
    } else {
      throw new GitError(`fatal: pathspec '${p}' não corresponde a nenhum arquivo`);
    }
  }
  return r;
}

/** Copia para a staging a versão dos arquivos em `source`, sem mover a branch. Sem `paths`, vale para todos. */
export function unstage(repo: Repo, paths: string[], source?: string): Repo {
  assertInit(repo);
  const r = clone(repo);
  const from = source ? r.commits[resolve(r, source)].tree : headTree(r);
  const known = [...new Set([...Object.keys(r.index), ...Object.keys(from), ...r.conflicts])];
  const targets = paths.length ? known.filter((p) => paths.some((spec) => matchesPath(p, spec))) : known;
  for (const p of targets) {
    if (p in from) r.index[p] = from[p];
    else delete r.index[p];
  }
  if (paths.length) {
    r.conflicts = r.conflicts.filter((c) => !targets.includes(c));
    for (const p of targets) delete r.theirs[p];
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
  // como no Git real: um cherry-pick ou revert que ficou vazio não vira commit; só o merge pode ser commitado sem mudança
  if (!stagedChanges.length && r.inProgress && r.inProgress.kind !== "merge" && !opts.allowEmpty) {
    const kind = r.inProgress.kind;
    throw new GitError(
      `erro: o ${kind} de ${r.inProgress.label} ficou vazio: nada mudou em relação ao HEAD, então não há o que commitar.\ndica: 'git ${kind} --abort' encerra o ${kind}. Nada se perde, porque não havia mudança.\nNo Git real, 'git ${kind} --skip' faz o mesmo neste caso.`,
    );
  }
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

/**
 * Troca a árvore de trabalho para `targetSha`, levando junto o trabalho local que o destino não sobrescreveria.
 * Como no Git real: alteração em staging, inclusive arquivo novo, e edição sem add são recusadas se o destino
 * muda o arquivo; arquivo apagado da pasta sem add não é recusado, e o destino repõe a versão dele se for outra;
 * arquivo não rastreado fica, mas é recusado se colide com o destino.
 */
function switchTree(r: Repo, targetSha: Sha | null, what: string) {
  if (r.conflicts.length) throw new GitError(`erro: ${what} não é possível com conflitos não resolvidos.`);
  const oldHead = headTree(r);
  const target = targetSha ? r.commits[targetSha].tree : {};
  const changes = (p: string) => (oldHead[p] ?? null) !== (target[p] ?? null);
  const staged = treeDiff(oldHead, r.index).map((f) => f.path);
  const unstaged = treeDiff(r.index, r.workdir).filter((f) => f.kind !== "new");
  const edited = unstaged.filter((f) => f.kind === "modified").map((f) => f.path);
  const removed = unstaged.filter((f) => f.kind === "deleted").map((f) => f.path);
  // o que está em staging igual ao destino não é sobrescrito, então passa
  const blocked = [...new Set([...staged.filter((p) => (r.index[p] ?? null) !== (target[p] ?? null)), ...edited])].filter(changes).sort();
  if (blocked.length) {
    throw new GitError(
      `erro: suas alterações locais nos arquivos abaixo seriam sobrescritas por ${what}:\n${blocked.map((p) => `\t${p}`).join("\n")}\ndica: faça commit ou 'git stash' antes de trocar de branch.`,
    );
  }
  assertNoUntrackedInChangedPaths(r, oldHead, target, what);
  const workdir: Tree = { ...target };
  const index: Tree = { ...target };
  for (const p of staged) {
    if (p in r.index) index[p] = r.index[p];
    else delete index[p];
  }
  for (const p of [...staged, ...edited]) {
    if (p in r.workdir) workdir[p] = r.workdir[p];
    else delete workdir[p];
  }
  // apagado sem add: continua apagado se o destino tem a mesma versão; se não, fica a versão do destino
  for (const p of removed) if (!changes(p)) delete workdir[p];
  for (const p of untrackedPaths(r)) workdir[p] = r.workdir[p];
  r.workdir = workdir;
  r.index = index;
}

/** A ref remota que `git switch nome` usaria para criar a branch local: só quando não há branch local com esse nome. */
export function remoteBranchFor(repo: Repo, name: string): string | null {
  if (name in repo.branches) return null;
  const ref = `${repo.remote?.name ?? "origin"}/${name}`;
  return ref in repo.remoteRefs ? ref : null;
}

export function checkout(repo: Repo, target: string, opts: { create?: boolean; force?: boolean; startPoint?: string; detach?: boolean } = {}): Repo {
  assertInit(repo);
  assertNoInProgress(repo, "trocar de branch");
  let r = clone(repo);
  if (opts.create) {
    r = branchCreate(r, target, opts.startPoint);
  }
  if (!opts.detach && currentBranch(r) === target) {
    // como no Git real: "Already on", sem erro; com -f, ainda descarta o trabalho rastreado
    if (opts.force) replaceTracked(r, headTree(r));
    return r;
  }
  // como no Git real: nome que só existe no remoto vira branch local rastreando origin/nome
  const remoteRef = remoteBranchFor(r, target);
  if (!opts.create && !opts.detach && remoteRef) r = branchCreate(r, target, remoteRef);
  const isBranch = !opts.detach && target in r.branches;
  const sha = target in r.branches ? r.branches[target] : resolve(r, target);
  if (opts.force) {
    // como no Git real, -f descarta o trabalho rastreado, mas mantém o que não é rastreado
    replaceTracked(r, r.commits[sha].tree);
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
  /** empty: revert ou cherry-pick sem efeito; o Git real para com erro */
  kind: "up-to-date" | "fast-forward" | "merge-commit" | "conflict" | "empty";
  conflicts: string[];
  from: Sha;
  to: Sha;
}

type Theirs = Repo["theirs"];

/** Faz o merge 3-way de duas árvores. Devolve a árvore resultante, os arquivos em conflito e o lado "deles" de cada um. */
function mergeTrees(base: Tree, ours: Tree, theirs: Tree, labels: { ours: string; theirs: string }): { tree: Tree; conflicts: string[]; theirs: Theirs } {
  const tree: Tree = {};
  const conflicts: string[] = [];
  const stage3: Theirs = {};
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
      stage3[p] = t ?? null;
      tree[p] = (o ?? t) as string;
    } else {
      const m = merge3(b ?? "", o, t, labels);
      tree[p] = m.text;
      if (m.conflict) {
        conflicts.push(p);
        stage3[p] = t;
      }
    }
  }
  return { tree, conflicts, theirs: stage3 };
}

/** Como no Git real, o merge só recusa trabalho local que ele sobrescreveria. Arquivo apagado da pasta sem add não conta: o merge repõe a versão dele. */
function assertMergeKeepsLocalWork(repo: Repo, merged: Tree, conflicts: string[] = []) {
  const s = status(repo);
  const head = headTree(repo);
  const touched = (p: string) => conflicts.includes(p) || head[p] !== merged[p];
  // staging igual ao resultado do merge não é sobrescrita, então passa
  const staged = s.staged.filter((f) => (repo.index[f.path] ?? null) !== (merged[f.path] ?? null) || conflicts.includes(f.path));
  const local = [...staged, ...s.unstaged.filter((f) => f.kind !== "deleted")].map((f) => f.path);
  const dirty = [...new Set(local)].filter(touched);
  if (dirty.length) {
    throw new GitError(`erro: suas alterações locais seriam sobrescritas por merge:\n${dirty.map((p) => `\t${p}`).join("\n")}\ndica: faça commit ou 'git stash' antes do merge.`);
  }
  assertNoUntrackedInChangedPaths(repo, head, merged, "merge");
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
  const ours = r.commits[head].tree;
  // como no Git real, o lado de cá do marcador é sempre HEAD, mesmo numa branch (desvio N19, corrigido na Etapa 1G)
  const { tree, conflicts, theirs } = mergeTrees(base, ours, r.commits[target].tree, { ours: "HEAD", theirs: ref });
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
  r.theirs = theirs;
  r.inProgress = { kind: "merge", other: target, message, label: ref };
  if (conflicts.length) return { repo: r, kind: "conflict", conflicts, from: head, to: target };
  const done = commit(r, message);
  return { repo: done, kind: "merge-commit", conflicts: [], from: head, to: target };
}

/** Como no Git real, `revert --abort` e `cherry-pick --abort` valem um pelo outro: os dois encerram a mesma operação. */
export function abortInProgress(repo: Repo, kind: InProgress["kind"]): Repo {
  const sequencer = kind !== "merge" && repo.inProgress?.kind !== "merge";
  if (!repo.inProgress || (repo.inProgress.kind !== kind && !sequencer)) throw new GitError(`fatal: não há ${kind} em andamento`);
  kind = repo.inProgress.kind;
  assertNoUntrackedCollision(repo, headTree(repo), `${kind} --abort`);
  // como git reset --merge: arquivo em staging que foi editado depois do add seria perdido, então é recusado
  const s = status(repo);
  const stale = s.staged.map((f) => f.path).filter((p) => s.unstaged.some((f) => f.path === p));
  if (stale.length) {
    throw new GitError(
      `erro: estes arquivos têm alteração em staging e outra feita depois do 'git add':\n${stale.map((p) => `\t${p}`).join("\n")}\nfatal: ${kind} --abort não é possível sem perder essa edição.\ndica: 'git add <arquivo>' para juntar as duas, ou 'git restore <arquivo>' para voltar ao que está em staging.`,
    );
  }
  const r = clone(repo);
  const head = headTree(r);
  // como git reset --merge: volta o que está em conflito ou na staging; o resto do trabalho local fica
  for (const p of new Set([...Object.keys(r.index), ...Object.keys(head), ...r.conflicts])) {
    if (r.index[p] === head[p] && !r.conflicts.includes(p)) continue;
    if (p in head) r.workdir[p] = head[p];
    else delete r.workdir[p];
  }
  r.index = { ...head };
  r.conflicts = [];
  r.theirs = {};
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
  /** commits não reaplicados, como no Git real: já estavam na base, ou ficaram vazios ao serem aplicados */
  skipped?: SkippedCommit[];
}

export interface SkippedCommit {
  sha: Sha;
  message: string;
  reason: "na-base" | "vazio";
}

function applyCommitOnto(r: Repo, c: Commit, ontoTree: Tree): ReturnType<typeof mergeTrees> {
  const parentTree = c.parents[0] ? r.commits[c.parents[0]].tree : {};
  return mergeTrees(parentTree, ontoTree, c.tree, { ours: "HEAD", theirs: `${short(c.sha)} (${c.message})` });
}

/** O que o commit mudou, com conteúdo: dois commits com a mesma assinatura trazem a mesma mudança, como o patch-id do Git. */
function patchSignature(r: Repo, c: Commit): string {
  const parent = c.parents[0] ? r.commits[c.parents[0]].tree : {};
  return JSON.stringify(treeDiff(parent, c.tree).map((f) => [f.path, parent[f.path] ?? null, c.tree[f.path] ?? null]));
}

function continueRebaseLoop(r: Repo, skipped: SkippedCommit[] = []): RebaseResult {
  const rb = r.rebase!;
  let applied = 0;
  while (rb.todo.length) {
    const sha = rb.todo[0];
    const c = r.commits[sha];
    const ontoTree = r.commits[rb.head].tree;
    const { tree, conflicts, theirs } = applyCommitOnto(r, c, ontoTree);
    const collisions = untrackedCollisions(r, tree);
    if (collisions.length) {
      r.head = { type: "detached", sha: rb.head };
      const message = `${collisionMessage(collisions, "rebase")}\nO rebase parou antes do commit ${short(sha)} (${c.message}).\ndica: depois disso, 'git rebase --continue' tenta de novo. Para desistir: 'git rebase --abort'.`;
      return { repo: r, kind: "blocked", applied, conflicts: [], message, skipped };
    }
    replaceTracked(r, tree, conflicts, theirs);
    if (conflicts.length) {
      rb.current = sha;
      r.head = { type: "detached", sha: rb.head };
      return { repo: r, kind: "conflict", applied, conflicts, skipped };
    }
    if (!treeDiff(ontoTree, tree).length) {
      // a base já tem essa mudança: o Git descarta o commit em vez de criar um vazio
      skipped.push({ sha, message: c.message, reason: "vazio" });
      rb.todo.shift();
      continue;
    }
    const nc = makeCommit(r, [rb.head], c.message, tree, c.author);
    // evita colisão com commit idêntico já existente
    r.commits[nc.sha] = nc;
    r.clock = nc.timestamp;
    rb.head = nc.sha;
    rb.todo.shift();
    applied++;
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
  return { repo: r, kind: "done", applied, conflicts: [], skipped };
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
  // merges são descartados no rebase simples, como no git
  const candidates = commitsBetween(r, upstream, head).filter((c) => c.parents.length <= 1);
  // commit com a mesma mudança de um commit que só existe na base é pulado, como o Git faz pelo patch-id
  const naBase = new Set(commitsBetween(r, head, upstream).filter((c) => c.parents.length <= 1).map((c) => patchSignature(r, c)));
  const skipped: SkippedCommit[] = candidates.filter((c) => naBase.has(patchSignature(r, c))).map((c) => ({ sha: c.sha, message: c.message, reason: "na-base" }));
  const todo = candidates.filter((c) => !skipped.some((s) => s.sha === c.sha)).map((c) => c.sha);
  r.rebase = { branch: currentBranch(r), originalTip: head, onto: upstream, todo, current: null, head: upstream };
  replaceTracked(r, r.commits[upstream].tree);
  const res = continueRebaseLoop(r, skipped);
  if (res.kind === "done") return { ...res, kind: "rebased" };
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
    // como no Git real, só segue com tudo adicionado: edição sem add seria descartada pelo próximo commit
    const pending = status(r).unstaged.map((f) => f.path);
    if (pending.length) {
      throw new GitError(
        `erro: ainda há alterações sem 'git add':\n${pending.map((p) => `\t${p}`).join("\n")}\ndica: o rebase só continua com tudo adicionado. Use 'git add <arquivo>' para levar a alteração, ou 'git restore <arquivo>' para descartá-la.`,
      );
    }
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

/**
 * Como no Git real: `--mixed` e `--hard` encerram merge, revert e cherry-pick e tiram o conflito da staging;
 * no `--mixed`, a pasta não muda, então os marcadores ficam. Um rebase parado continua, e segue do novo HEAD.
 * `--soft` é recusado no meio de um merge ou com conflito.
 */
export function reset(repo: Repo, ref: string, mode: "soft" | "mixed" | "hard" = "mixed"): Repo {
  assertInit(repo);
  if (mode === "soft" && (repo.inProgress?.kind === "merge" || repo.conflicts.length)) {
    const what = repo.rebase ? "rebase" : (repo.inProgress?.kind ?? "merge");
    throw new GitError(`fatal: não é possível fazer 'reset --soft' no meio de um ${what}.\ndica: 'git reset' tira o conflito da staging, e 'git ${what} --abort' desfaz tudo.`);
  }
  const sha = resolve(repo, ref);
  const r = clone(repo);
  if (r.head.type === "branch") r.branches[r.head.name] = sha;
  else r.head = { type: "detached", sha };
  if (r.rebase) r.rebase.head = sha;
  const tree = r.commits[sha].tree;
  if (mode === "mixed") {
    r.index = { ...tree };
    r.conflicts = [];
    r.theirs = {};
  }
  // sem arquivo, o reset encerra o que estava em andamento em qualquer modo, inclusive --soft num cherry-pick ou revert sem conflito
  r.inProgress = null;
  if (mode === "hard") replaceTracked(r, tree);
  pushReflog(r, `reset: moving to ${ref}`);
  return r;
}

/** Como no Git real, commit de merge é recusado sem a opção -m, antes de olhar alterações locais. O Dojo não tem -m. */
function assertNotMergeCommit(c: Commit, what: "revert" | "cherry-pick") {
  if (c.parents.length <= 1) return;
  const dica =
    what === "cherry-pick"
      ? "dica: o Dojo não tem a opção -m. Para trazer a branch inteira, use 'git merge'; para trazer uma mudança, escolha um commit comum."
      : `dica: o Dojo não tem a opção -m. No Git real, 'git revert -m 1 ${short(c.sha)}' desfaz o merge mantendo o lado da branch que o recebeu.`;
  throw new GitError(`erro: o commit ${short(c.sha)} é um commit de merge, e o ${what} precisa saber qual lado seguir (opção -m).\nfatal: ${what} falhou.\n${dica}`);
}

/**
 * Sem efeito (o HEAD já não tem a mudança), o revert para com erro e não fica em andamento, como no Git real.
 * O resultado "empty" vem com o repositório inalterado.
 */
/** Como no Git real, um cherry-pick ou revert aberto sem conflito (o que ficou vazio) não impede outro revert ou cherry-pick, que o substitui. */
function assertSequencerFree(repo: Repo, what: string) {
  if (repo.rebase || repo.inProgress?.kind === "merge") assertNoInProgress(repo, what);
}

export function revert(repo: Repo, ref: string): MergeResult {
  assertInit(repo);
  assertSequencerFree(repo, "revert");
  const sha = resolve(repo, ref);
  const c = getCommit(repo, sha);
  assertNotMergeCommit(c, "revert");
  assertClean(repo, "revert");
  const head = headSha(repo)!;
  const r = clone(repo);
  const parentTree = c.parents[0] ? r.commits[c.parents[0]].tree : {};
  const { tree, conflicts, theirs } = mergeTrees(c.tree, r.commits[head].tree, parentTree, { ours: "HEAD", theirs: `parent of ${short(sha)} (${c.message})` });
  assertNoUntrackedCollision(r, tree, "revert");
  if (!conflicts.length && !treeDiff(r.commits[head].tree, tree).length) return { repo, kind: "empty", conflicts: [], from: head, to: sha };
  const message = `Revert "${c.message}"\n\nThis reverts commit ${sha}.`;
  replaceTracked(r, tree, conflicts, theirs);
  r.inProgress = { kind: "revert", other: null, message, label: short(sha) };
  if (conflicts.length) return { repo: r, kind: "conflict", conflicts, from: head, to: sha };
  return { repo: commit(r, message), kind: "merge-commit", conflicts: [], from: head, to: sha };
}

/**
 * Sem efeito (a branch já tem a mudança), o cherry-pick para com erro e fica em andamento, como no Git real:
 * o resultado "empty" vem com o cherry-pick aberto, e o aluno sai dele com --abort.
 */
export function cherryPick(repo: Repo, ref: string): MergeResult {
  assertInit(repo);
  assertSequencerFree(repo, "cherry-pick");
  const sha = resolve(repo, ref);
  const c = getCommit(repo, sha);
  assertNotMergeCommit(c, "cherry-pick");
  assertClean(repo, "cherry-pick");
  const head = headSha(repo)!;
  const r = clone(repo);
  const { tree, conflicts, theirs } = applyCommitOnto(r, c, r.commits[head].tree);
  assertNoUntrackedCollision(r, tree, "cherry-pick");
  replaceTracked(r, tree, conflicts, theirs);
  r.inProgress = { kind: "cherry-pick", other: null, message: c.message, label: short(sha) };
  if (conflicts.length) return { repo: r, kind: "conflict", conflicts, from: head, to: sha };
  if (!treeDiff(r.commits[head].tree, tree).length) return { repo: r, kind: "empty", conflicts: [], from: head, to: sha };
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
  const { tree, conflicts, theirs } = mergeTrees(baseTree, head, entry.workdir, { ours: "Updated upstream", theirs: "Stashed changes" });
  r.workdir = { ...r.workdir, ...tree };
  r.conflicts = conflicts;
  r.theirs = theirs;
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
  /** no --rebase: commits locais não reaplicados, porque o remoto já tinha a mudança */
  skipped?: SkippedCommit[];
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
    if (res.kind === "conflict") return { repo: res.repo, kind: "conflict", conflicts: res.conflicts, skipped: res.skipped };
    if (res.kind === "up-to-date") return { repo: res.repo, kind: "up-to-date", conflicts: [] };
    if (res.kind === "fast-forward") return { repo: res.repo, kind: "fast-forward", conflicts: [] };
    return { repo: res.repo, kind: "rebased", conflicts: [], skipped: res.skipped };
  }
  const res = merge(r, ref, { message: `Merge branch '${branch}' of origin` });
  // o merge nunca devolve "empty"; isso é só do revert e do cherry-pick
  return { repo: res.repo, kind: res.kind as Exclude<MergeResult["kind"], "empty">, conflicts: res.conflicts };
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

/**
 * Como no Git real, arquivo em conflito aparece no `git diff` como diff combinado (`diff --cc`), comparando a pasta
 * com os dois lados; no `--staged`, como `* Unmerged path`. Comparações com um commit ignoram o conflito.
 */
export function diffText(repo: Repo, opts: { staged?: boolean; from?: string; to?: string; paths?: string[] } = {}): string[] {
  assertInit(repo);
  let a: Tree;
  let b: Tree;
  let unmerged: UnmergedRender | undefined;
  if (opts.from) {
    a = repo.commits[resolve(repo, opts.from)].tree;
    if (opts.to) b = repo.commits[resolve(repo, opts.to)].tree;
    else if (opts.staged) {
      b = repo.index;
      unmerged = { paths: repo.conflicts };
    } else {
      b = { ...repo.workdir };
      for (const p of untrackedPaths(repo)) delete b[p];
    }
  } else if (opts.staged) {
    a = headTree(repo);
    b = repo.index;
    unmerged = { paths: repo.conflicts };
  } else {
    a = repo.index;
    b = repo.workdir;
    unmerged = { paths: repo.conflicts, combined: { ours: headTree(repo), theirs: repo.theirs, work: repo.workdir } };
  }
  return renderDiff(a, b, { skipUntracked: !opts.from && !opts.staged, paths: opts.paths, unmerged });
}

/** O que um commit mudou em relação ao primeiro pai. No commit-raiz, todos os arquivos aparecem como novos. */
export function commitDiff(repo: Repo, sha: Sha): string[] {
  const c = getCommit(repo, sha);
  return renderDiff(c.parents[0] ? repo.commits[c.parents[0]].tree : {}, c.tree);
}

interface UnmergedRender {
  paths: string[];
  /** com os dois lados, o arquivo sai como diff combinado; sem isso, como "* Unmerged path" */
  combined?: { ours: Tree; theirs: Theirs; work: Tree };
}

function renderDiff(a: Tree, b: Tree, opts: { skipUntracked?: boolean; paths?: string[]; unmerged?: UnmergedRender } = {}): string[] {
  const paths = opts.paths ?? [];
  const wanted = (p: string) => !paths.length || paths.some((spec) => matchesPath(p, spec));
  const unmerged = (opts.unmerged?.paths ?? []).filter(wanted);
  const lines: string[] = [];
  const entries: { path: string; render: () => void }[] = [];
  for (const f of treeDiff(a, b)) {
    if (opts.skipUntracked && f.kind === "new") continue; // untracked não aparece em git diff
    if (!wanted(f.path) || unmerged.includes(f.path)) continue;
    entries.push({
      path: f.path,
      render: () => {
        lines.push(`diff --git a/${f.path} b/${f.path}`);
        if (f.kind === "new") lines.push("new file mode 100644");
        if (f.kind === "deleted") lines.push("deleted file mode 100644");
        lines.push(f.kind === "new" ? "--- /dev/null" : `--- a/${f.path}`, f.kind === "deleted" ? "+++ /dev/null" : `+++ b/${f.path}`);
        const ops = diffLines(splitLines(a[f.path] ?? ""), splitLines(b[f.path] ?? ""));
        for (const op of ops) lines.push(op.kind === "same" ? ` ${op.text}` : op.kind === "add" ? `+${op.text}` : `-${op.text}`);
      },
    });
  }
  for (const p of unmerged) {
    const c = opts.unmerged?.combined;
    const ours = c?.ours[p];
    const theirs = c?.theirs[p];
    entries.push({
      path: p,
      render: () => {
        if (!c || ours === undefined || theirs == null || !(p in c.work)) {
          lines.push(`* Unmerged path ${p}`);
          return;
        }
        lines.push(`diff --cc ${p}`, `--- a/${p}`, `+++ b/${p}`, ...combinedDiff([ours, theirs], c.work[p]));
      },
    });
  }
  for (const e of entries.sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0))) e.render();
  return lines;
}

/** Diff combinado do Git: cada linha do resultado ganha uma coluna por lado (`+` se não estava nele), e o que um lado perdeu sai com `-` na coluna dele. */
function combinedDiff(parents: string[], result: string): string[] {
  const work = splitLines(result);
  const added = parents.map(() => new Set<number>());
  const lost = parents.map(() => new Map<number, string[]>());
  parents.forEach((parent, k) => {
    let i = 0;
    for (const op of diffLines(splitLines(parent), work)) {
      if (op.kind === "del") lost[k].set(i, [...(lost[k].get(i) ?? []), op.text]);
      else {
        if (op.kind === "add") added[k].add(i);
        i++;
      }
    }
  });
  const col = (k: number, mark: string) => parents.map((_, j) => (j === k ? mark : " ")).join("");
  const lines: string[] = [];
  for (let i = 0; i <= work.length; i++) {
    parents.forEach((_, k) => {
      for (const text of lost[k].get(i) ?? []) lines.push(`${col(k, "-")}${text}`);
    });
    if (i < work.length) lines.push(`${parents.map((_, k) => (added[k].has(i) ? "+" : " ")).join("")}${work[i]}`);
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
