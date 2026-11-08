import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Check, Lightbulb, RotateCcw, ChevronDown, ChevronUp, ScrollText } from "lucide-react";
import { useStore } from "@/state/store";
import { Terminal } from "@/components/Terminal";
import { CommitGraph } from "@/components/CommitGraph";
import { FilePanel } from "@/components/FilePanel";
import { Editor } from "@/components/Editor";
import { Rich } from "@/components/Rich";
import { Diagram } from "@/components/Diagrams";
import { findMission, PLAYGROUND } from "@/content";
import { playSound } from "@/lib/sound";

export function MissionView() {
  const { currentMission: m, session, objectives, hintsRevealed, revealHint, restartMission, go, sound } = useStore();
  const [showConcept, setShowConcept] = useState(true);
  const [showCheat, setShowCheat] = useState(false);
  const prevDone = useRef(0);

  useEffect(() => {
    const n = objectives.filter(Boolean).length;
    if (n > prevDone.current) playSound("objective", sound);
    prevDone.current = n;
  }, [objectives, sound]);

  useEffect(() => {
    setShowConcept(true);
    setShowCheat(false);
    prevDone.current = 0;
  }, [m?.id]);

  if (!m || !session) return null;
  const found = findMission(m.id);
  const isPlayground = m.id === PLAYGROUND.id;
  const repo = session.repo;
  const banner = repo.rebase
    ? { cls: "rebase", text: repo.conflicts.length ? "Rebase parado em conflito. Resolva, git add e git rebase --continue." : "Rebase em andamento." }
    : repo.conflicts.length
      ? { cls: "conflict", text: `Conflito em ${repo.conflicts.join(", ")}. Abra o arquivo, resolva, git add e git commit.` }
      : repo.inProgress
        ? { cls: "conflict", text: `${repo.inProgress.kind} em andamento — finalize com git commit.` }
        : repo.head.type === "detached"
          ? { cls: "detached", text: "HEAD desanexado: commits aqui não pertencem a nenhuma branch." }
          : null;

  return (
    <div className="mission-view">
      <aside className="panel">
        <div className="row" style={{ marginBottom: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => go("map")}>
            <ArrowLeft size={14} /> Trilha
          </button>
          <span className="grow" />
          {found && (
            <span className="pill" style={{ borderColor: found.module.color, color: found.module.color }}>
              {found.module.title} · {found.index + 1}/{found.module.missions.length}
            </span>
          )}
          {isPlayground && <span className="pill">modo livre</span>}
        </div>
        <h2 className="mission-title">
          {m.boss && "👑 "}
          {m.title}
        </h2>
        <div className="mission-tag">{m.tagline}</div>

        <div className="story">
          {m.story.map((p, i) => (
            <p key={i}>
              <Rich text={p} />
            </p>
          ))}
        </div>

        {m.concept && (
          <div className="card concept" style={{ marginTop: 14 }}>
            <button className="row" style={{ width: "100%", textAlign: "left" }} onClick={() => setShowConcept((v) => !v)}>
              <h4 style={{ margin: 0 }}>💡 {m.concept.title}</h4>
              <span className="grow" />
              {showConcept ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            <AnimatePresence initial={false}>
              {showConcept && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: "hidden" }}>
                  {m.concept.diagram && <Diagram id={m.concept.diagram} />}
                  <ul>
                    {m.concept.points.map((p, i) => (
                      <li key={i}>
                        <Rich text={p} />
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {!isPlayground && (
          <>
            <div className="section-title">
              Objetivos · {objectives.filter(Boolean).length}/{m.objectives.length}
            </div>
            <div className="objectives">
              {m.objectives.map((o, i) => (
                <motion.div key={o.id} className={`objective ${objectives[i] ? "done" : ""}`} layout>
                  <span className="check">{objectives[i] && <Check size={13} strokeWidth={3} />}</span>
                  <span>
                    <Rich text={o.text} />
                  </span>
                </motion.div>
              ))}
            </div>

            <div className="section-title">Dicas</div>
            <div className="hints">
              {m.hints.slice(0, hintsRevealed).map((h, i) => (
                <motion.div key={i} className="hint" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <Rich text={h} />
                </motion.div>
              ))}
              {hintsRevealed < m.hints.length ? (
                <button className="btn btn-sm" onClick={revealHint}>
                  <Lightbulb size={14} /> Pedir dica ({hintsRevealed}/{m.hints.length}) <span className="muted small">· custa estrelas</span>
                </button>
              ) : (
                <div className="small muted">Todas as dicas reveladas.</div>
              )}
            </div>
          </>
        )}

        {m.cheatsheet && (
          <>
            <div className="section-title">
              <button className="row" style={{ gap: 6, textTransform: "inherit", letterSpacing: "inherit", color: "inherit", fontWeight: "inherit", fontSize: "inherit" }} onClick={() => { if (!showCheat && !isPlayground && hintsRevealed < m.hints.length) revealHint(); setShowCheat((v) => !v); }}>
                <ScrollText size={12} /> Cola de comandos {showCheat ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>
            {showCheat && (
              <div className="cheat">
                {m.cheatsheet.map((c, i) => (
                  <button key={i} type="button" onClick={() => navigator.clipboard?.writeText(c.replace(/\s+\(.*\)$/, ""))} title="copiar">
                    {c}
                    <span className="sr-only"> (copiar)</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div className="row" style={{ marginTop: 20 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm("Reiniciar a missão do zero?")) restartMission(); }}>
            <RotateCcw size={14} /> Reiniciar missão
          </button>
          <span className="grow" />
          <span className="small muted mono">
            {session.commands.length} cmd · {session.errors} erro(s)
          </span>
        </div>
      </aside>

      <section className="center-col">
        <div style={{ minHeight: 0, display: "flex", flexDirection: "column" }}>
          <AnimatePresence>
            {banner && (
              <motion.div key={banner.cls + banner.text} className={`state-banner ${banner.cls}`} style={{ margin: "10px 14px 0", flexShrink: 0 }} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                {banner.text}
              </motion.div>
            )}
          </AnimatePresence>
          <div style={{ flex: 1, minHeight: 0 }}>
            <CommitGraph repo={repo} />
          </div>
        </div>
        <Terminal />
      </section>

      <aside className="panel panel-right">
        <FilePanel repo={repo} />
      </aside>

      <Editor />
    </div>
  );
}
