export type Sha = string;

/** Árvore simplificada: caminho -> conteúdo do arquivo. */
export type Tree = Record<string, string>;

export interface Commit {
  sha: Sha;
  parents: Sha[];
  message: string;
  tree: Tree;
  author: string;
  /** Contador determinístico (não é hora real). */
  timestamp: number;
}

export type Head = { type: "branch"; name: string } | { type: "detached"; sha: Sha };

/** Operação em andamento que termina com um commit (merge, revert, cherry-pick). */
export interface InProgress {
  kind: "merge" | "revert" | "cherry-pick";
  /** Segundo pai (merge) — ausente em revert/cherry-pick. */
  other: Sha | null;
  message: string;
  label: string;
}

export interface RebaseState {
  branch: string | null;
  originalTip: Sha;
  onto: Sha;
  /** commits ainda por aplicar (ordem de aplicação) */
  todo: Sha[];
  /** commit parado em conflito; null quando o rebase parou antes dele, por causa de um arquivo não rastreado */
  current: Sha | null;
  /** sha atual de HEAD durante o rebase */
  head: Sha;
}

export interface StashEntry {
  message: string;
  base: Sha;
  workdir: Tree;
  index: Tree;
}

export interface Remote {
  name: string;
  branches: Record<string, Sha>;
  commits: Record<Sha, Commit>;
}

export interface Repo {
  initialized: boolean;
  commits: Record<Sha, Commit>;
  branches: Record<string, Sha>;
  head: Head;
  index: Tree;
  workdir: Tree;
  conflicts: string[];
  inProgress: InProgress | null;
  rebase: RebaseState | null;
  stash: StashEntry[];
  remote: Remote | null;
  /** refs remotas locais, ex.: "origin/main" -> sha */
  remoteRefs: Record<string, Sha>;
  user: { name: string };
  clock: number;
  /** histórico de posições de HEAD (reflog simplificado) */
  reflog: { sha: Sha; action: string }[];
}

export class GitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitError";
  }
}

export interface FileStatus {
  path: string;
  kind: "new" | "modified" | "deleted";
}

export interface Status {
  branch: string | null;
  detachedSha: Sha | null;
  staged: FileStatus[];
  unstaged: FileStatus[];
  untracked: string[];
  conflicts: string[];
  inProgress: InProgress | null;
  rebase: RebaseState | null;
  /** quantos commits à frente/atrás da ref remota de mesmo nome */
  ahead: number;
  behind: number;
  hasUpstream: boolean;
}
