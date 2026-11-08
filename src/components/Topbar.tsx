import { GitBranch, Map, Award, BookOpen, Volume2, VolumeX, FlaskConical } from "lucide-react";
import { motion } from "framer-motion";
import { useStore } from "@/state/store";
import { levelFor } from "@/content/gamification";

export function Topbar() {
  const { view, go, xp, badges, sound, toggleSound, playerName, startPlayground } = useStore();
  const lv = levelFor(xp);
  return (
    <header className="topbar">
      <button className="brand" onClick={() => go(playerName ? "map" : "home")} title="Início">
        <span className="brand-logo" aria-hidden="true">
          <GitBranch size={18} />
        </span>
        Git Dojo <small>RPA Tecnologia</small>
        <span className="sr-only">, início</span>
      </button>
      <span className="grow" />
      {playerName && (
        <>
          <div className="xpbar" title={`${xp} XP`}>
            <div className="level-chip">
              <b>{lv.level.name}</b>
              <span>{lv.level.title}</span>
            </div>
            <div className="track" role="progressbar" aria-label="Progresso para o próximo nível" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(lv.progress * 100)}>
              <motion.div className="fill" initial={false} animate={{ width: `${Math.round(lv.progress * 100)}%` }} transition={{ type: "spring", stiffness: 80, damping: 20 }} />
            </div>
            <span className="small muted mono">
              {xp}
              {lv.next ? `/${lv.next.min}` : ""} XP
            </span>
          </div>
          <nav className="row" style={{ gap: 4 }} aria-label="Principal">
            <button className={`btn btn-ghost btn-sm ${view === "map" ? "active" : ""}`} onClick={() => go("map")} title="Trilha" aria-current={view === "map" ? "page" : undefined}>
              <Map size={15} aria-hidden="true" /> <span className="nav-label">Trilha</span>
            </button>
            <button className="btn btn-ghost btn-sm" onClick={startPlayground} title="Playground">
              <FlaskConical size={15} aria-hidden="true" /> <span className="nav-label">Playground</span>
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => go("badges")} title="Conquistas" aria-current={view === "badges" ? "page" : undefined}>
              <Award size={15} aria-hidden="true" /> <span className="nav-label">Conquistas</span> {badges.length > 0 && <span className="pill" style={{ padding: "0 6px" }}>{badges.length}</span>}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => go("cheatsheet")} title="Cola de comandos" aria-current={view === "cheatsheet" ? "page" : undefined}>
              <BookOpen size={15} aria-hidden="true" /> <span className="nav-label">Cola</span>
            </button>
            <button className="btn btn-ghost btn-sm" onClick={toggleSound} aria-label={sound ? "Desligar som" : "Ligar som"} aria-pressed={sound} title={sound ? "Desligar som" : "Ligar som"}>
              {sound ? <Volume2 size={15} aria-hidden="true" /> : <VolumeX size={15} aria-hidden="true" />}
            </button>
          </nav>
        </>
      )}
    </header>
  );
}
