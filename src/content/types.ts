import type { Repo } from "@/engine/types";
import type { TerminalEvent } from "@/engine/commands";

export interface CheckCtx {
  repo: Repo;
  /** comandos digitados nesta missão, na ordem */
  commands: string[];
  events: TerminalEvent[];
  /** commits exibidos com git show, na ordem */
  shown: string[];
}

export interface Objective {
  id: string;
  text: string;
  check: (ctx: CheckCtx) => boolean;
}

export type DiagramId = "three-areas" | "branch" | "fast-forward" | "three-way" | "conflict" | "rebase" | "trunk" | "stash" | "detached" | "revert";

export interface Concept {
  title: string;
  points: string[];
  diagram?: DiagramId;
}

/** Evento "do mundo real" que acontece durante a missão (ex.: colega faz push). */
export interface Trigger {
  id: string;
  when: (ctx: CheckCtx) => boolean;
  apply: (repo: Repo) => Repo;
  /** mensagem mostrada como notificação */
  message: string;
  actor?: string;
}

export interface Mission {
  id: string;
  title: string;
  tagline: string;
  /** parágrafos; aceita **negrito** e `código` */
  story: string[];
  concept?: Concept;
  setup: () => Repo;
  objectives: Objective[];
  hints: string[];
  xp: number;
  badge?: string;
  triggers?: Trigger[];
  /** comandos sugeridos exibidos na "cola" da missão */
  cheatsheet?: string[];
  boss?: boolean;
}

export interface Module {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  color: string;
  icon: "sprout" | "git-branch" | "git-merge" | "flame" | "rocket" | "shield";
  missions: Mission[];
}
