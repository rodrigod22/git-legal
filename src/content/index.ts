import type { Mission, Module } from "./types";
import { fundamentos } from "./modules/fundamentos";
import { branches } from "./modules/branches";
import { merge } from "./modules/merge";
import { conflitos } from "./modules/conflitos";
import { trunk } from "./modules/trunk";
import { perigo } from "./modules/perigo";
import { sc } from "./helpers";
import { xpFor } from "./gamification";

export const MODULES: Module[] = [fundamentos, branches, merge, conflitos, trunk, perigo];

export const ALL_MISSIONS: Mission[] = MODULES.flatMap((m) => m.missions);

export function findMission(id: string): { mission: Mission; module: Module; index: number } | null {
  for (const module of MODULES) {
    const index = module.missions.findIndex((m) => m.id === id);
    if (index !== -1) return { mission: module.missions[index], module, index };
  }
  return null;
}

export function nextMission(id: string): Mission | null {
  const i = ALL_MISSIONS.findIndex((m) => m.id === id);
  return ALL_MISSIONS[i + 1] ?? null;
}

/** XP de quem conclui todas as missões com 3 estrelas. */
export const MAX_XP = ALL_MISSIONS.reduce((s, m) => s + xpFor(m.xp, 3), 0);

/** Modo livre: repositório de brinquedo com remoto, sem objetivos. */
export const PLAYGROUND: Mission = {
  id: "playground",
  title: "Playground",
  tagline: "Repositório livre para experimentar qualquer comando. Nada aqui conta pontos — nem quebra nada.",
  story: [
    "Este é o seu laboratório. O repositório já tem alguns commits, duas branches e um remoto `origin` simulado.",
    "Experimente: crie branches, provoque conflitos, faça rebase, `reset --hard`, o que quiser. Para começar de novo, use **Reiniciar**.",
    "Dica: a Ana e o Carlos não trabalham aqui — o remoto só muda quando você faz `git push`.",
  ],
  setup: () =>
    sc()
      .file("README.md", "# Portal RPA\n\nIntranet da RPA Tecnologia.\n")
      .file("index.php", "<?php\necho 'Portal RPA';\n")
      .commit("versão inicial")
      .file("config.php", "<?php\n$db_port = 3306;\n")
      .commit("adiciona config")
      .remote()
      .push("main")
      .switch("feature/relatorio", true)
      .file("relatorio.php", "<?php // relatório\n")
      .commit("inicia relatório")
      .switch("main")
      .file("index.php", "<?php\necho 'Portal RPA — Intranet';\n")
      .commit("ajusta título", "ana")
      .done(),
  objectives: [],
  hints: [],
  xp: 0,
  cheatsheet: ["git log --oneline --graph --all", "git switch feature/relatorio", "git rebase main", "git merge feature/relatorio", "git push"],
};
