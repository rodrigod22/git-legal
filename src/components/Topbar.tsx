import { GitBranch, Map, Award, BookOpen, Volume2, VolumeX, FlaskConical } from "lucide-react";
import { motion } from "framer-motion";
import { useStore } from "@/state/store";
import { levelFor } from "@/content/gamification";

export function Topbar() {
  const { view, go, xp, badges, sound, toggleSound, playerName, startPlayground } = useStore();
  const lv = levelFor(xp);
  return (
    <header className="topbar">
      <button className="brand" onClick={() => go(playerName ? "map" : "home")} aria-label="Início">
        <span className="brand-logo">
          <GitBranch size={18} />
        </span>
        Git Dojo <small>RPA Tecnologia</small>
      </button>
      <span className="grow" />
      {playerName && (
        <>
          <div className="xpbar" title={`${xp} XP`}>
            <div className="level-chip">
              <b>{lv.level.name}</b>
              <span>{lv.level.title}</span>
            </div>
            <div className="track">
              <motion.div className="fill" initial={false} animate={{ width: `${Math.round(lv.progress * 100)}%` }} transition={{ type: "spring", stiffness: 80, damping: 20 }} />
            </div>
            <span className="small muted mono">
              {xp}
              {lv.next ? `/${lv.next.min}` : ""} XP
            </span>
          </div>
          <nav className="row" style={{ gap: 4 }}>
            <button className={`btn btn-ghost btn-sm ${view === "map" ? "active" : ""}`} onClick={() => go("map")} title="Trilha">
              <Map size={15} /> <span className="nav-label">Trilha</span>
            </button>
            <button className="btn btn-ghost btn-sm" onClick={startPlayground} title="Playground">
              <FlaskConical size={15} /> <span className="nav-label">Playground</span>
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => go("badges")} title="Conquistas">
              <Award size={15} /> <span className="nav-label">Conquistas</span> {badges.length > 0 && <span className="pill" style={{ padding: "0 6px" }}>{badges.length}</span>}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => go("cheatsheet")} title="Cola de comandos">
              <BookOpen size={15} /> <span className="nav-label">Cola</span>
            </button>
            <button className="btn btn-ghost btn-sm" onClick={toggleSound} aria-label="Som" title={sound ? "Desligar som" : "Ligar som"}>
              {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
            </button>
          </nav>
        </>
      )}
    </header>
  );
}
