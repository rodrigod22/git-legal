import { motion } from "framer-motion";
import { useStore } from "@/state/store";
import { BADGES, LEVELS, levelFor } from "@/content/gamification";
import { ALL_MISSIONS } from "@/content";

export function Badges() {
  const { badges, xp, progress, totalCommands } = useStore();
  const lv = levelFor(xp);
  const stars = Object.values(progress).reduce((s, e) => s + e.stars, 0);
  return (
    <div className="map">
      <div className="map-head">
        <div>
          <h2>Conquistas</h2>
          <div className="muted" style={{ marginTop: 6 }}>
            {badges.length}/{BADGES.length} desbloqueadas · {stars}/{ALL_MISSIONS.length * 3} estrelas · {totalCommands} comandos digitados
          </div>
        </div>
      </div>

      <div className="section-title">Níveis</div>
      <div className="row" style={{ flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
        {LEVELS.map((l, i) => (
          <span key={l.name} className="pill" style={i <= lv.index ? { borderColor: "var(--accent)", color: "#fbd5cb" } : {}}>
            {i <= lv.index ? "✓" : "○"} {l.name} <span className="muted">· {l.min} XP</span>
          </span>
        ))}
      </div>

      <div className="badges-grid">
        {BADGES.map((b, i) => {
          const has = badges.includes(b.id);
          return (
            <motion.div key={b.id} className={`card badge-card ${has ? "" : "locked"}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <div className="emoji">{b.emoji}</div>
              <b>{b.name}</b>
              <span>{b.description}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
