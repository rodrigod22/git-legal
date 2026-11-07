/**
 * Sessão de uma missão: estado do repositório + histórico de comandos/eventos,
 * gatilhos (colegas) e avaliação dos objetivos. Puro, sem React.
 */
import { execute } from "@/engine/commands";
import type { CommandResult, TerminalEvent } from "@/engine/commands";
import * as G from "@/engine/repo";
import type { Repo } from "@/engine/types";
import type { CheckCtx, Mission } from "./types";

export interface TerminalLine {
  id: number;
  kind: "input" | "output" | "system";
  text: string;
  ok?: boolean;
  prompt?: string;
}

export interface Notification {
  id: number;
  text: string;
  actor?: string;
}

export interface Session {
  missionId: string;
  repo: Repo;
  commands: string[];
  events: TerminalEvent[];
  shown: string[];
  firedTriggers: string[];
  lines: TerminalLine[];
  errors: number;
  hintsUsed: number;
  startedAt: number;
  completed: boolean;
  seq: number;
}

export function promptFor(repo: Repo): string {
  if (!repo.initialized) return "projeto-rpa";
  const b = G.currentBranch(repo);
  const state = repo.rebase ? "|REBASE" : repo.inProgress ? `|${repo.inProgress.kind.toUpperCase()}` : "";
  const dirty = repo.initialized && !G.isCleanRepo(repo) ? "*" : "";
  return `projeto-rpa (${b ?? "HEAD desanexado"}${state})${dirty}`;
}

export function startSession(mission: Mission): Session {
  const repo = mission.setup();
  return {
    missionId: mission.id,
    repo,
    commands: [],
    events: [],
    shown: [],
    firedTriggers: [],
    lines: [{ id: 1, kind: "system", text: `Missão: ${mission.title}. Digite <c>help</c> para ver os comandos.` }],
    errors: 0,
    hintsUsed: 0,
    startedAt: Date.now(),
    completed: false,
    seq: 2,
  };
}

export function ctxOf(s: Session): CheckCtx {
  return { repo: s.repo, commands: s.commands, events: s.events, shown: s.shown };
}

export function evaluate(mission: Mission, s: Session): boolean[] {
  const ctx = ctxOf(s);
  return mission.objectives.map((o) => {
    try {
      return o.check(ctx);
    } catch {
      return false;
    }
  });
}

/** Aplica gatilhos pendentes cuja condição ficou verdadeira. */
function applyTriggers(mission: Mission, s: Session): Notification[] {
  const notes: Notification[] = [];
  for (const t of mission.triggers ?? []) {
    if (s.firedTriggers.includes(t.id)) continue;
    if (t.when(ctxOf(s))) {
      s.repo = t.apply(s.repo);
      s.firedTriggers.push(t.id);
      notes.push({ id: s.seq++, text: t.message, actor: t.actor });
      s.lines.push({ id: s.seq++, kind: "system", text: `<m>⚡ ${t.message}</m>` });
    }
  }
  return notes;
}

export interface StepResult {
  session: Session;
  result: CommandResult;
  notifications: Notification[];
  objectives: boolean[];
  justCompleted: boolean;
}

export function runCommand(mission: Mission, session: Session, input: string): StepResult {
  const s: Session = { ...session, commands: [...session.commands], events: [...session.events], firedTriggers: [...session.firedTriggers], lines: [...session.lines] };
  const prompt = promptFor(s.repo);
  s.lines.push({ id: s.seq++, kind: "input", text: input, prompt });
  const result = execute(s.repo, input);
  s.repo = result.repo;
  s.commands.push(input.trim());
  s.events.push(result.event ?? (result.ok ? ("ok" as TerminalEvent) : "error"));
  if (result.shown) s.shown = [...s.shown, result.shown];
  if (!result.ok) s.errors++;
  if (result.action?.type === "clear") s.lines = [];
  else for (const l of result.lines) s.lines.push({ id: s.seq++, kind: "output", text: l, ok: result.ok });
  const notifications = applyTriggers(mission, s);
  const objectives = evaluate(mission, s);
  const allDone = objectives.every(Boolean);
  const justCompleted = allDone && !s.completed;
  if (allDone) s.completed = true;
  if (s.lines.length > 400) s.lines = s.lines.slice(-400);
  return { session: s, result, notifications, objectives, justCompleted };
}

export function editFile(mission: Mission, session: Session, path: string, content: string): StepResult {
  const s: Session = { ...session, lines: [...session.lines], firedTriggers: [...session.firedTriggers] };
  s.repo = G.writeFile(s.repo, path, content);
  s.lines.push({ id: s.seq++, kind: "system", text: `<d>✎ ${path} salvo no editor</d>` });
  const notifications = applyTriggers(mission, s);
  const objectives = evaluate(mission, s);
  const allDone = objectives.every(Boolean);
  const justCompleted = allDone && !s.completed;
  if (allDone) s.completed = true;
  return { session: s, result: { repo: s.repo, lines: [], ok: true }, notifications, objectives, justCompleted };
}
