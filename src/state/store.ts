import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ALL_MISSIONS, findMission, MODULES, PLAYGROUND } from "@/content";
import type { Mission } from "@/content/types";
import { startSession, runCommand, editFile, evaluate } from "@/content/session";
import type { Session } from "@/content/session";
import { BADGES, starsFor, xpFor } from "@/content/gamification";
import { playSound } from "@/lib/sound";

export type View = "home" | "map" | "mission" | "badges" | "certificate" | "cheatsheet";

export interface ProgressEntry {
  completedAt: number;
  stars: 1 | 2 | 3;
  xp: number;
  hintsUsed: number;
  errors: number;
  commands: number;
  seconds: number;
}

export interface Toast {
  id: number;
  kind: "xp" | "badge" | "colleague" | "info" | "error";
  title: string;
  text?: string;
  actor?: string;
  /** tempo em ms até sumir sozinho; o relógio para enquanto o toast tem foco ou o mouse em cima */
  duration: number;
}

export interface Completion {
  missionId: string;
  xp: number;
  stars: 1 | 2 | 3;
  newBadges: string[];
  seconds: number;
  commands: number;
  errors: number;
  hintsUsed: number;
}

interface State {
  // persistido
  playerName: string;
  progress: Record<string, ProgressEntry>;
  xp: number;
  badges: string[];
  totalCommands: number;
  // sessão
  view: View;
  currentMission: Mission | null;
  session: Session | null;
  objectives: boolean[];
  hintsRevealed: number;
  editorPath: string | null;
  toasts: Toast[];
  completion: Completion | null;
  sound: boolean;
  /** texto aguardando entrar na linha de comando (ex.: hash clicado no grafo) */
  terminalInsert: string | null;

  insertInTerminal: (text: string) => void;
  setPlayerName: (n: string) => void;
  go: (v: View) => void;
  startMission: (id: string) => void;
  startPlayground: () => void;
  restartMission: () => void;
  run: (input: string) => void;
  openEditor: (path: string | null) => void;
  saveFile: (path: string, content: string) => void;
  revealHint: () => void;
  dismissToast: (id: number) => void;
  closeCompletion: () => void;
  toggleSound: () => void;
  resetProgress: () => void;
  pushToast: (t: Omit<Toast, "id" | "duration">) => void;
  /** interno: fecha a missão, calcula XP/estrelas/conquistas */
  _complete: (s: Session) => void;
}

let toastSeq = 1;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      playerName: "",
      progress: {},
      xp: 0,
      badges: [],
      totalCommands: 0,
      view: "home",
      currentMission: null,
      session: null,
      objectives: [],
      hintsRevealed: 0,
      editorPath: null,
      toasts: [],
      completion: null,
      sound: true,
      terminalInsert: null,

      insertInTerminal: (terminalInsert) => set({ terminalInsert }),
      setPlayerName: (playerName) => set({ playerName }),
      go: (view) => set({ view, editorPath: null }),

      pushToast: (t) => {
        const id = toastSeq++;
        // quem conta o tempo é o componente Toasts, para poder parar o relógio com foco ou mouse em cima
        set((s) => ({ toasts: [...s.toasts, { ...t, id, duration: t.kind === "badge" ? 7000 : 5000 }] }));
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      startMission: (id) => {
        const found = findMission(id);
        if (!found) return;
        const session = startSession(found.mission);
        set({ currentMission: found.mission, session, objectives: evaluate(found.mission, session), hintsRevealed: 0, view: "mission", editorPath: null, completion: null });
      },
      startPlayground: () => {
        const session = startSession(PLAYGROUND);
        set({ currentMission: PLAYGROUND, session, objectives: [], hintsRevealed: 0, view: "mission", editorPath: null, completion: null });
      },
      restartMission: () => {
        const m = get().currentMission;
        if (!m) return;
        const session = startSession(m);
        set({ session, objectives: evaluate(m, session), editorPath: null });
      },

      run: (input) => {
        const { currentMission, session } = get();
        if (!currentMission || !session) return;
        const step = runCommand(currentMission, session, input);
        set({ session: step.session, objectives: step.objectives, totalCommands: get().totalCommands + 1 });
        if (step.result.action?.type === "edit") set({ editorPath: step.result.action.path });
        for (const n of step.notifications) {
          get().pushToast({ kind: "colleague", title: n.actor ? `${cap(n.actor)} fez push` : "Evento", text: n.text, actor: n.actor });
          playSound("notify", get().sound);
        }
        if (step.result.event === "conflict") playSound("conflict", get().sound);
        else if (step.result.ok && step.result.event) playSound("tick", get().sound);
        if (step.justCompleted && currentMission.id !== PLAYGROUND.id) get()._complete(step.session);
      },

      openEditor: (editorPath) => set({ editorPath }),
      saveFile: (path, content) => {
        const { currentMission, session } = get();
        if (!currentMission || !session) return;
        const step = editFile(currentMission, session, path, content);
        set({ session: step.session, objectives: step.objectives });
        if (step.justCompleted && currentMission.id !== PLAYGROUND.id) get()._complete(step.session);
      },

      revealHint: () => {
        const { currentMission, hintsRevealed, session } = get();
        if (!currentMission || !session) return;
        if (hintsRevealed >= currentMission.hints.length) return;
        set({ hintsRevealed: hintsRevealed + 1, session: { ...session, hintsUsed: session.hintsUsed + 1 } });
      },

      closeCompletion: () => set({ completion: null }),
      toggleSound: () => set((s) => ({ sound: !s.sound })),
      resetProgress: () => set({ progress: {}, xp: 0, badges: [], totalCommands: 0, view: "home", currentMission: null, session: null }),

      // interno
      _complete: (session: Session) => {
        const s = get();
        const m = s.currentMission!;
        const already = s.progress[m.id];
        const stars = starsFor(session.hintsUsed, session.errors);
        const seconds = Math.round((Date.now() - session.startedAt) / 1000);
        const gained = xpFor(m.xp, stars);
        const prevXp = already?.xp ?? 0;
        const delta = Math.max(0, gained - prevXp);
        const entry: ProgressEntry = {
          completedAt: Date.now(),
          stars: already && already.stars > stars ? already.stars : stars,
          xp: Math.max(gained, prevXp),
          hintsUsed: session.hintsUsed,
          errors: session.errors,
          commands: session.commands.length,
          seconds,
        };
        const progress = { ...s.progress, [m.id]: entry };
        const newBadges: string[] = [];
        const has = (id: string) => s.badges.includes(id) || newBadges.includes(id);
        if (m.badge && !has(m.badge)) newBadges.push(m.badge);
        const entries = Object.values(progress);
        if (!has("sem-dicas") && entries.filter((e) => e.hintsUsed === 0).length >= 5) newBadges.push("sem-dicas");
        if (!has("sem-erros") && entries.filter((e) => e.errors === 0).length >= 5) newBadges.push("sem-erros");
        if (!has("dojo-master") && ALL_MISSIONS.every((x) => progress[x.id])) newBadges.push("dojo-master");
        set({
          progress,
          xp: s.xp + delta,
          badges: [...s.badges, ...newBadges],
          completion: { missionId: m.id, xp: gained, stars, newBadges, seconds, commands: session.commands.length, errors: session.errors, hintsUsed: session.hintsUsed },
        });
        playSound("complete", s.sound);
        for (const b of newBadges) {
          const def = BADGES.find((x) => x.id === b);
          if (def) s.pushToast({ kind: "badge", title: `Conquista: ${def.emoji} ${def.name}`, text: def.description });
        }
      },
    }),
    {
      name: "git-dojo-v1",
      partialize: (s) => ({ playerName: s.playerName, progress: s.progress, xp: s.xp, badges: s.badges, totalCommands: s.totalCommands, sound: s.sound }),
    },
  ),
);

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function isUnlocked(progress: Record<string, ProgressEntry>, missionId: string): boolean {
  const idx = ALL_MISSIONS.findIndex((m) => m.id === missionId);
  if (idx <= 0) return true;
  // desbloqueia a missão seguinte à última concluída; módulos anteriores sempre liberados
  const prev = ALL_MISSIONS[idx - 1];
  return !!progress[prev.id];
}

export function moduleProgress(progress: Record<string, ProgressEntry>, moduleId: string) {
  const mod = MODULES.find((m) => m.id === moduleId)!;
  const done = mod.missions.filter((m) => progress[m.id]).length;
  return { done, total: mod.missions.length, pct: done / mod.missions.length };
}
