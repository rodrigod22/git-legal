import { motion } from "framer-motion";
import { Sprout, GitBranch, GitMerge, Flame, Rocket, Shield, Lock, Check, Award, RotateCcw } from "lucide-react";
import { useStore, isUnlocked, moduleProgress } from "@/state/store";
import { ALL_MISSIONS, MODULES, MAX_XP } from "@/content";
import type { Module } from "@/content/types";
import { levelFor } from "@/content/gamification";

const ICONS: Record<Module["icon"], React.ReactNode> = {
  sprout: <Sprout size={20} />,
  "git-branch": <GitBranch size={20} />,
  "git-merge": <GitMerge size={20} />,
  flame: <Flame size={20} />,
  rocket: <Rocket size={20} />,
  shield: <Shield size={20} />,
};

export function Stars({ n, size = 12 }: { n: number; size?: number }) {
  return (
    <span className="stars" style={{ fontSize: size }} role="img" aria-label={`${n} de 3 estrelas`}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= n ? "" : "off"} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

export function DojoMap() {
  const { playerName, progress, xp, startMission, go, resetProgress } = useStore();
  const done = Object.keys(progress).length;
  const allDone = done >= ALL_MISSIONS.length;
  const lv = levelFor(xp);
  const nextMission = ALL_MISSIONS.find((m) => !progress[m.id] && isUnlocked(progress, m.id));

  return (
    <div className="map">
      <div className="map-head">
        <div>
          <div className="muted small">Olá, {playerName} · {lv.level.name} — {lv.level.title}</div>
          <h1>Trilha do Dojo</h1>
          <div className="muted" style={{ marginTop: 6 }}>
            {done}/{ALL_MISSIONS.length} missões · {xp}/{MAX_XP} XP possíveis
          </div>
        </div>
        <div className="row" style={{ flexWrap: "wrap" }}>
          {nextMission && (
            <button className="btn btn-primary" onClick={() => startMission(nextMission.id)}>
              <span aria-hidden="true">▶ </span>Continuar: {nextMission.title}
            </button>
          )}
          {allDone && (
            <button className="btn btn-primary" onClick={() => go("certificate")}>
              <Award size={16} aria-hidden="true" /> Ver certificado
            </button>
          )}
          {done > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                if (confirm("Apagar todo o progresso e começar do zero?")) resetProgress();
              }}
              title="Zerar progresso"
            >
              <RotateCcw size={14} aria-hidden="true" /> zerar progresso
            </button>
          )}
        </div>
      </div>

      <div className="modules">
        {MODULES.map((mod, mi) => {
          const mp = moduleProgress(progress, mod.id);
          return (
            <motion.div key={mod.id} className="card module" style={{ ["--mc" as string]: mod.color }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: mi * 0.06 }}>
              <div className="module-head">
                <span className="module-icon" aria-hidden="true">{ICONS[mod.icon]}</span>
                <div>
                  <h2>
                    {mi + 1}. {mod.title}
                  </h2>
                  <div className="sub">{mod.subtitle}</div>
                </div>
                <span className="grow" />
                <span className="pill">
                  {mp.done}/{mp.total}
                  <span className="sr-only"> missões concluídas</span>
                </span>
              </div>
              <p className="desc">{mod.description}</p>
              <div className="missions">
                {mod.missions.map((m, i) => {
                  const entry = progress[m.id];
                  const unlocked = isUnlocked(progress, m.id);
                  return (
                    <button key={m.id} className={`mission-row ${entry ? "done" : ""} ${m.boss ? "boss" : ""}`} disabled={!unlocked} onClick={() => startMission(m.id)} title={unlocked ? m.tagline : "Conclua a missão anterior para desbloquear"}>
                      <span className="num" aria-hidden="true">{entry ? <Check size={14} /> : unlocked ? (m.boss ? "👑" : i + 1) : <Lock size={12} />}</span>
                      <span className="t">
                        <b>
                          {m.title}
                          <span className="sr-only">{entry ? " (concluída)" : unlocked ? (m.boss ? " (chefão)" : "") : " (bloqueada: conclua a missão anterior)"}</span>
                        </b>
                        <span>{m.tagline}</span>
                      </span>
                      {entry ? <Stars n={entry.stars} /> : <span className="small muted mono">+{m.xp} XP</span>}
                    </button>
                  );
                })}
              </div>
              <div className="module-progress" role="progressbar" aria-label={`Progresso do módulo ${mod.title}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(mp.pct * 100)}>
                <motion.i initial={false} animate={{ width: `${mp.pct * 100}%` }} />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
