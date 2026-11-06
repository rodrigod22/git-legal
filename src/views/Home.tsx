import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Terminal as TerminalIcon, GitMerge, Trophy } from "lucide-react";
import { useStore } from "@/state/store";
import { ALL_MISSIONS, MODULES } from "@/content";

const DEMO = [
  { p: "projeto-rpa (main)", c: "git merge feature/titulo" },
  { o: "<r>CONFLICT (content): Merge conflict in README.md</r>" },
  { o: "<y>Automatic merge failed; fix conflicts and then commit the result.</y>" },
  { p: "projeto-rpa (main|MERGE)*", c: "edit README.md" },
  { p: "projeto-rpa (main|MERGE)*", c: "git add README.md" },
  { o: "<g>Conflito marcado como resolvido.</g>" },
  { p: "projeto-rpa (main|MERGE)", c: 'git commit -m "merge: título unificado"' },
  { o: "[<g>main</g> <y>a91f3c2</y>] merge: título unificado" },
  { o: "<g>✔ Missão concluída · +125 XP · 🕊️ Pacificador</g>" },
];

export function Home() {
  const { playerName, setPlayerName, go, progress } = useStore();
  const [name, setName] = useState(playerName);
  const done = Object.keys(progress).length;

  const start = () => {
    const n = name.trim();
    if (!n) return;
    setPlayerName(n);
    go("map");
  };

  return (
    <div className="home">
      <motion.div className="hero" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
        <span className="pill" style={{ marginBottom: 16 }}>
          🥋 Treinamento oficial de Git · RPA Tecnologia
        </span>
        <h1>
          Aprenda Git <span className="grad">fazendo</span>, não lendo.
        </h1>
        <p className="lead">
          Um terminal de verdade no navegador, um grafo que reage a cada comando e {ALL_MISSIONS.length} missões sobre o que importa no dia a dia: <b>branches, merges e conflitos</b> — no fluxo que a RPA usa.
        </p>
        <div className="cta">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && start()}
            placeholder="Como você quer ser chamado?"
            aria-label="Seu nome"
            maxLength={40}
          />
          <button className="btn btn-primary" onClick={start} disabled={!name.trim()}>
            {done > 0 ? "Continuar treinamento" : "Começar o treinamento"} <ArrowRight size={16} />
          </button>
        </div>
        <div className="feature-grid">
          <div className="card feature">
            <TerminalIcon size={18} color="var(--cyan)" />
            <b>Terminal real</b>
            <span>Digite os comandos de verdade. Erros viram aprendizado, não estrago.</span>
          </div>
          <div className="card feature">
            <GitMerge size={18} color="var(--violet)" />
            <b>Grafo ao vivo</b>
            <span>Veja branches nascerem, HEAD se mover e merges formarem losangos.</span>
          </div>
          <div className="card feature">
            <Trophy size={18} color="var(--yellow)" />
            <b>XP, níveis e chefões</b>
            <span>{MODULES.length} módulos, conquistas e um certificado no final.</span>
          </div>
        </div>
      </motion.div>

      <motion.div className="hero-visual" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15, duration: 0.5 }}>
        <div className="terminal-preview">
          <div className="dots">
            <i />
            <i />
            <i />
          </div>
          {DEMO.map((l, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.28 }} style={{ whiteSpace: "pre-wrap" }}>
              {"p" in l ? (
                <>
                  <span style={{ color: "#4ade80" }}>{l.p}</span> $ {l.c}
                </>
              ) : (
                <Term text={l.o!} />
              )}
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

import { TermText } from "@/components/Rich";
function Term({ text }: { text: string }) {
  return <TermText text={text} />;
}
