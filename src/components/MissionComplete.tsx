import { motion } from "framer-motion";
import { useStore } from "@/state/store";
import { findMission, nextMission, ALL_MISSIONS } from "@/content";
import { BADGES } from "@/content/gamification";
import { Confetti } from "./Confetti";
import { Stars } from "@/views/DojoMap";

export function MissionComplete() {
  const { completion, closeCompletion, startMission, go, progress } = useStore();
  if (!completion) return null;
  const found = findMission(completion.missionId);
  const next = nextMission(completion.missionId);
  const allDone = ALL_MISSIONS.every((m) => progress[m.id]);
  const mins = Math.floor(completion.seconds / 60);
  const secs = completion.seconds % 60;

  return (
    <>
      <Confetti run />
      <div className="overlay">
        <motion.div className="card complete" initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 220, damping: 20 }}>
          <div className="pill" style={{ borderColor: found?.module.color, color: found?.module.color }}>
            {found?.module.title}
          </div>
          <h2>{found?.mission.boss ? "Chefão derrotado!" : "Missão concluída!"}</h2>
          <div className="muted">{found?.mission.title}</div>
          <div className="big-stars" style={{ marginTop: 14 }}>
            <Stars n={completion.stars} size={34} />
          </div>
          <div className="small muted" style={{ marginTop: 4 }}>
            {completion.stars === 3 ? "Perfeito: sem dicas e sem erros." : completion.stars === 2 ? "Muito bom. Sem dicas ou quase sem erros." : "Concluída. Tente de novo sem dicas para 3 estrelas."}
          </div>
          <div className="stats">
            <div className="stat">
              <b style={{ color: "var(--green)" }}>+{completion.xp}</b>
              <span>XP</span>
            </div>
            <div className="stat">
              <b>{completion.commands}</b>
              <span>comandos</span>
            </div>
            <div className="stat">
              <b>
                {mins}m{String(secs).padStart(2, "0")}s
              </b>
              <span>tempo</span>
            </div>
          </div>
          {completion.newBadges.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              {completion.newBadges.map((b) => {
                const def = BADGES.find((x) => x.id === b)!;
                return (
                  <motion.div key={b} className="pill" style={{ fontSize: 14, padding: "8px 14px", margin: 4, borderColor: "var(--yellow)", color: "#fde68a" }} initial={{ scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.3 }}>
                    {def.emoji} Nova conquista: {def.name}
                  </motion.div>
                );
              })}
            </div>
          )}
          <div className="row" style={{ justifyContent: "center", flexWrap: "wrap" }}>
            <button className="btn" onClick={() => { closeCompletion(); go("map"); }}>
              Voltar à trilha
            </button>
            {allDone ? (
              <button className="btn btn-primary" onClick={() => { closeCompletion(); go("certificate"); }}>
                🎓 Pegar o certificado
              </button>
            ) : next ? (
              <button className="btn btn-primary" onClick={() => { closeCompletion(); startMission(next.id); }}>
                Próxima: {next.title} →
              </button>
            ) : null}
          </div>
        </motion.div>
      </div>
    </>
  );
}
