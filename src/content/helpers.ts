import * as G from "@/engine/repo";
import type { Repo, Sha, Tree } from "@/engine/types";
import type { CheckCtx } from "./types";

/** Construtor fluente de cenários iniciais. */
export class Scenario {
  repo: Repo;
  constructor(user = "voce", initialized = true) {
    this.repo = G.createRepo({ user, initialized });
  }
  file(path: string, content: string) {
    this.repo = G.writeFile(this.repo, path, content.endsWith("\n") ? content : content + "\n");
    return this;
  }
  rm(path: string) {
    this.repo = G.deleteFile(this.repo, path);
    return this;
  }
  add(...paths: string[]) {
    this.repo = G.add(this.repo, paths.length ? paths : ["."]);
    return this;
  }
  commit(message: string, author?: string) {
    this.repo = G.add(this.repo, ["."]);
    this.repo = G.commit(this.repo, message, { author });
    return this;
  }
  branch(name: string, start?: string) {
    this.repo = G.branchCreate(this.repo, name, start);
    return this;
  }
  switch(name: string, create = false) {
    this.repo = G.checkout(this.repo, name, { create });
    return this;
  }
  merge(ref: string) {
    this.repo = G.merge(this.repo, ref).repo;
    return this;
  }
  remote() {
    this.repo = G.addRemote(this.repo);
    return this;
  }
  push(branch?: string) {
    this.repo = G.push(this.repo, { branch }).repo;
    return this;
  }
  /** colega envia commit direto no remoto */
  remoteCommit(branch: string, author: string, message: string, changes: (t: Tree) => Tree) {
    this.repo = G.remoteCommit(this.repo, branch, author, message, changes);
    return this;
  }
  fetch() {
    this.repo = G.fetch(this.repo);
    return this;
  }
  detach(ref: string) {
    this.repo = G.checkout(this.repo, G.resolve(this.repo, ref));
    return this;
  }
  stashAll() {
    this.repo = G.stashPush(this.repo);
    return this;
  }
  done() {
    return this.repo;
  }
}

export const sc = (user?: string, initialized?: boolean) => new Scenario(user, initialized);

// ---------- verificações ----------

export const hasBranch = (r: Repo, name: string) => name in r.branches;
export const onBranch = (r: Repo, name: string) => G.currentBranch(r) === name;
export const commitCount = (r: Repo) => Object.keys(r.commits).length;
export const headSha = (r: Repo) => G.headSha(r);
export const headCommit = (r: Repo) => {
  const s = G.headSha(r);
  return s ? r.commits[s] : null;
};
export const file = (r: Repo, path: string) => r.workdir[path];
export const committedFile = (r: Repo, path: string, ref = "HEAD") => {
  try {
    return r.commits[G.resolve(r, ref)].tree[path];
  } catch {
    return undefined;
  }
};
export const clean = (r: Repo) => G.isCleanRepo(r);
export const noConflicts = (r: Repo) => r.conflicts.length === 0 && !r.inProgress && !r.rebase;
export const used = (ctx: CheckCtx, re: RegExp) => ctx.commands.some((c) => re.test(c));
export const happened = (ctx: CheckCtx, ev: CheckCtx["events"][number]) => ctx.events.includes(ev);
export const commitsOn = (r: Repo, ref: string) => {
  try {
    return [...G.ancestors(r, G.resolve(r, ref))].map((s) => r.commits[s]);
  } catch {
    return [];
  }
};
export const branchHasCommitMsg = (r: Repo, ref: string, re: RegExp) => commitsOn(r, ref).some((c) => re.test(c.message));
export const isAncestor = (r: Repo, a: string, of: string) => {
  try {
    return G.isAncestor(r, G.resolve(r, a), G.resolve(r, of));
  } catch {
    return false;
  }
};
/** histórico sem commits de merge a partir de ref */
export const isLinear = (r: Repo, ref: string) => commitsOn(r, ref).every((c) => c.parents.length <= 1);
export const hasMergeCommit = (r: Repo, ref: string) => commitsOn(r, ref).some((c) => c.parents.length > 1);
export const countCommitsBetween = (r: Repo, exclude: string | null, from: string) => {
  try {
    return G.commitsBetween(r, exclude ? G.resolve(r, exclude) : null, G.resolve(r, from)).length;
  } catch {
    return 0;
  }
};
export const remoteBranch = (r: Repo, b: string): Sha | undefined => r.remote?.branches[b];
export const remoteHas = (r: Repo, b: string, re: RegExp) => {
  const tip = r.remote?.branches[b];
  if (!tip) return false;
  const seen = new Set<string>();
  const st = [tip];
  while (st.length) {
    const s = st.pop()!;
    if (seen.has(s)) continue;
    seen.add(s);
    const c = r.remote!.commits[s];
    if (c) {
      if (re.test(c.message)) return true;
      st.push(...c.parents);
    }
  }
  return false;
};
export const pushedUpToDate = (r: Repo, b = "main") => !!r.remote && r.remote.branches[b] === r.branches[b];
export const noMarkers = (s: string | undefined) => !!s && !/<<<<<<<|=======|>>>>>>>/.test(s);
export const includesAll = (s: string | undefined, ...parts: string[]) => !!s && parts.every((p) => s.includes(p));
