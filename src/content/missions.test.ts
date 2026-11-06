/**
 * Garante que TODA missão é resolvível com os comandos ensinados.
 * Cada solução é uma sequência de comandos; `edit:<arquivo>=<conteúdo>` simula o editor.
 */
import { describe, it, expect } from "vitest";
import { ALL_MISSIONS, findMission } from "./index";
import { startSession, runCommand, editFile, evaluate } from "./session";
import type { Session } from "./session";
import * as G from "@/engine/repo";

type Step = string | ((s: Session) => string);

const solutions: Record<string, Step[]> = {
  "primeiro-dia": ["git init", 'echo "# Portal RPA" > README.md', "git status", "git add README.md", 'git commit -m "primeiro commit"'],
  "ciclo-de-vida": ["git status", "git add contato.php", 'git commit -m "adiciona contato"', "git add README.md", 'git commit -m "corrige README"'],
  investigacao: [
    "git log --oneline",
    (s) => `git show ${Object.values(s.repo.commits).find((c) => c.message === "ajusta configuração")!.sha.slice(0, 7)}`,
    "edit:config.php=<?php\n$db_host = 'localhost';\n$db_port = 3306;\n",
    "git add config.php",
    'git commit -m "fix: porta do banco"',
  ],
  "primeira-branch": ["git switch -c feature/login", 'echo "<?php // login" > login.php', "git add login.php", 'git commit -m "adiciona login"'],
  "troca-de-contexto": [
    "git switch main",
    "git stash",
    "git switch main",
    "edit:index.php=<?php\necho 'Portal RPA';\n",
    "git add index.php",
    'git commit -m "fix: ponto e vírgula"',
    "git switch feature/relatorio",
    "git stash pop",
  ],
  "viagem-no-tempo": ["git log --oneline", "git checkout HEAD~2", "cat style.css", "git switch -c legado", "git switch main"],
  faxina: ["git branch", "git branch -d feature/cadastro", "git branch -d spike/teste-api", "git branch -D spike/teste-api", "git branch -m feture-relatorio feature/relatorio"],
  "fast-forward": ["git switch main", "git merge feature/login", "git log --oneline --graph --all"],
  "merge-de-verdade": ["git merge feature/relatorio", "git log --oneline --graph --all"],
  "no-ff": ["git merge --no-ff feature/exportacao", "git branch -d feature/exportacao"],
  "primeiro-conflito": ["git merge feature/titulo", "git status", "edit:README.md=# Portal RPA v2 — Intranet\n\nSistema interno.\n", "git add README.md", 'git commit -m "merge"'],
  "escolhendo-lado": ["git merge feature/cache", "edit:config.php=<?php\n$db_host = 'localhost';\n$db_port = 3306;\n$cache = true;\n", "git add config.php", 'git commit -m "merge cache"'],
  abortar: ["git merge spike/experimental", "git status", "git merge --abort", "git merge feature/pagamento"],
  "conflito-no-rebase": [
    "git rebase main",
    "git status",
    "edit:menu.php=<?php\n$menu = [\n  'Início',\n  'Configurações',\n  'Relatórios',\n];\n// menu dinâmico\n",
    "git add menu.php",
    "git rebase --continue",
    "git log --oneline --graph",
  ],
  "chefao-conflitos": [
    "git merge release/sprint-12",
    "git status",
    "edit:CHANGELOG.md=# Changelog\n\n## 1.1.0\n- exportação em PDF\n\n## 1.0.1\n- hotfix de login\n\n## 1.0.0\n- versão inicial\n",
    "edit:config.php=<?php\n$timeout = 30;\n",
    "edit:style.css=:root { --primary: #0ea5e9; }\n",
    "git add .",
    'git commit -m "merge release"',
  ],
  "push-rejeitado": ['echo "<?php // sobre" > sobre.php', "git add .", 'git commit -m "adiciona sobre"', "git push", "git pull --rebase", "git push", "git status"],
  "ritmo-de-integracao": [
    'echo "<?php // rodapé" > rodape.php',
    "git add .",
    'git commit -m "adiciona rodape"',
    "git push",
    "edit:index.php=<?php\necho 'Portal RPA';\nrequire 'rodape.php';\n",
    "git add .",
    'git commit -m "inclui rodape no index"',
    "git pull --rebase",
    "git push",
    'echo "footer { padding: 16px; }" >> style.css',
    "git add .",
    'git commit -m "css do rodape"',
    "git pull --rebase",
    "git push",
  ],
  "conflito-no-pull": ["git pull --rebase", "edit:index.php=<?php\necho 'Portal RPA 2026 — Intranet';\n", "git add index.php", "git rebase --continue", "git push"],
  "branch-curta": [
    "git switch -c feat/modo-escuro",
    'echo ":root { color-scheme: dark; }" > tema.css',
    "git add .",
    'git commit -m "modo escuro"',
    "git switch main",
    "git pull",
    "git switch feat/modo-escuro",
    "git rebase main",
    "git switch main",
    "git merge feat/modo-escuro",
    "git push",
    "git branch -d feat/modo-escuro",
  ],
  "revert-em-producao": ["git log --oneline", "git revert HEAD", "cat pagamento.php", "git push"],
  "squash-local": ["git log --oneline", "git reset --soft HEAD~3", "git status", 'git commit -m "adiciona filtro de busca"'],
  "cherry-pick": ["git log --oneline feature/dashboard", (s) => `git cherry-pick ${Object.values(s.repo.commits).find((c) => c.message === "fix: formato de data")!.sha.slice(0, 7)}`],
  resgate: ["git reflog", (s) => `git branch feature/importacao ${Object.values(s.repo.commits).find((c) => c.message === "importa planilha")!.sha.slice(0, 7)}`],
};

describe("todas as missões são resolvíveis", () => {
  for (const mission of ALL_MISSIONS) {
    it(`${mission.id} — ${mission.title}`, () => {
      const steps = solutions[mission.id];
      expect(steps, `faltou solução para ${mission.id}`).toBeDefined();
      let session = startSession(mission);
      // nenhuma missão pode começar já concluída
      expect(evaluate(mission, session).every(Boolean), "missão já começa completa").toBe(false);
      for (const step of steps) {
        const cmd = typeof step === "function" ? step(session) : step;
        if (cmd.startsWith("edit:")) {
          const eq = cmd.indexOf("=");
          const path = cmd.slice(5, eq);
          const content = cmd.slice(eq + 1);
          session = editFile(mission, session, path, content).session;
        } else {
          session = runCommand(mission, session, cmd).session;
        }
      }
      const objectives = evaluate(mission, session);
      const failed = mission.objectives.filter((_, i) => !objectives[i]).map((o) => o.text);
      expect(failed, `objetivos não cumpridos em ${mission.id}`).toEqual([]);
      expect(session.completed).toBe(true);
    });
  }

  it("ids de missão são únicos e findMission funciona", () => {
    const ids = ALL_MISSIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findMission("chefao-conflitos")?.module.id).toBe("conflitos");
  });

  it("cenários iniciais começam com árvore consistente", () => {
    for (const m of ALL_MISSIONS) {
      const repo = m.setup();
      if (repo.initialized) expect(() => G.status(repo)).not.toThrow();
    }
  });
});
