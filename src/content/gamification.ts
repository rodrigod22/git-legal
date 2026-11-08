export interface Level {
  min: number;
  name: string;
  title: string;
}

export const LEVELS: Level[] = [
  { min: 0, name: "Estagiário", title: "Iniciante no Dojo" },
  { min: 250, name: "Dev Júnior", title: "Aprendiz de Branch" },
  { min: 650, name: "Dev Pleno", title: "Mestre do Merge" },
  { min: 1200, name: "Dev Sênior", title: "Pacificador de Conflitos" },
  { min: 1800, name: "Git Sensei", title: "Guardião da Main" },
];

export function levelFor(xp: number): { level: Level; next: Level | null; progress: number; index: number } {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) if (xp >= LEVELS[i].min) index = i;
  const level = LEVELS[index];
  const next = LEVELS[index + 1] ?? null;
  const progress = next ? (xp - level.min) / (next.min - level.min) : 1;
  return { level, next, progress, index };
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  emoji: string;
}

export const BADGES: Badge[] = [
  { id: "first-commit", name: "Primeiro Commit", description: "Fez o primeiro commit da carreira no Dojo.", emoji: "🌱" },
  { id: "branch-master", name: "Mestre das Branches", description: "Concluiu o módulo de branches.", emoji: "🌿" },
  { id: "merge-master", name: "Mestre do Merge", description: "Concluiu o módulo de merges.", emoji: "🔀" },
  { id: "pacificador", name: "Pacificador", description: "Venceu o chefão dos conflitos.", emoji: "🕊️" },
  { id: "trunk-hero", name: "Herói da Main", description: "Dominou o fluxo trunk-based da Iron Systems.", emoji: "🚀" },
  { id: "resgate", name: "Equipe de Resgate", description: "Recuperou trabalho perdido com o reflog.", emoji: "🛟" },
  { id: "sem-dicas", name: "Autodidata", description: "Concluiu 5 missões sem usar dicas.", emoji: "🧠" },
  { id: "sem-erros", name: "Mão Firme", description: "Concluiu 5 missões sem nenhum comando com erro.", emoji: "🎯" },
  { id: "dojo-master", name: "Git Sensei", description: "Concluiu todas as missões do Dojo.", emoji: "🥋" },
];

/** Estrelas de uma missão: 3 = sem dicas e sem erros, 2 = uma das duas, 1 = concluída. */
export function starsFor(hintsUsed: number, errors: number): 1 | 2 | 3 {
  if (hintsUsed === 0 && errors === 0) return 3;
  if (hintsUsed === 0 || errors <= 1) return 2;
  return 1;
}

export function xpFor(baseXp: number, stars: number): number {
  return Math.round(baseXp * (stars === 3 ? 1.25 : stars === 2 ? 1.1 : 1));
}
