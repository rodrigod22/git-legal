import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Play, SkipForward, X } from "lucide-react";
import { useStore } from "@/state/store";
import { useDialog } from "@/lib/useDialog";
import { MODULES } from "@/content";
import { videoFor } from "@/content/videos";

/**
 * Vídeo de abertura do módulo (Fase 2). Abre antes da primeira missão de cada módulo e pelo botão
 * "rever" na trilha. Nunca toca sozinho: a pessoa aperta "Assistir" (ou os controles do vídeo),
 * o que respeita quem prefere menos movimento e evita baixar 1,5 MB sem querer (preload="none").
 * Tem legendas (.vtt) e a transcrição em texto, para leitor de tela e para quem está sem som.
 */
export function ModuleIntro() {
  const intro = useStore((s) => s.intro);
  return intro ? <IntroDialog moduleId={intro} /> : null;
}

function IntroDialog({ moduleId }: { moduleId: string }) {
  const closeIntro = useStore((s) => s.closeIntro);
  const currentMission = useStore((s) => s.currentMission);
  const view = useStore((s) => s.view);
  const mod = MODULES.find((m) => m.id === moduleId)!;
  const video = videoFor(moduleId)!;
  const dialogRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  useDialog(dialogRef, { onClose: closeIntro, initialFocus: skipRef });
  const emMissao = view === "mission" && currentMission && mod.missions.some((m) => m.id === currentMission.id);
  const rotuloFechar = ended ? (emMissao ? "Começar a missão" : "Fechar") : emMissao ? "Pular vídeo e ir para a missão" : "Fechar";

  const play = () => {
    const v = videoRef.current;
    if (!v) return;
    void v.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  };

  return (
    <div className="overlay">
      <motion.div ref={dialogRef} className="card intro" role="dialog" aria-modal="true" aria-labelledby="intro-title" aria-describedby="intro-desc" style={{ ["--mc" as string]: mod.color }} initial={{ opacity: 0, scale: 0.94, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 220, damping: 22 }}>
        <div className="intro-head">
          <div>
            <div className="pill" style={{ borderColor: mod.color, color: mod.color }}>
              Vídeo de abertura · 1 min
            </div>
            <h2 id="intro-title">{mod.title}</h2>
            <p id="intro-desc" className="muted small">
              {mod.subtitle}. O vídeo não toca sozinho e pesa cerca de {video.sizeMb.toLocaleString("pt-BR")} MB; você pode pular e vê-lo depois pela trilha.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={closeIntro} aria-label={rotuloFechar} title={rotuloFechar}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="intro-video">
          <video
            ref={videoRef}
            controls
            preload="none"
            playsInline
            poster={video.poster}
            width={1280}
            height={720}
            aria-label={`Vídeo de abertura do módulo ${mod.title}`}
            onPlay={() => setPlaying(true)}
            onEnded={() => setEnded(true)}
          >
            <source src={video.file} type="video/mp4" />
            <track kind="captions" src={video.captions} srcLang="pt-BR" label="Português (legendas)" default />
            Seu navegador não reproduz este vídeo. A transcrição está logo abaixo.
          </video>
          {!playing && (
            <button className="btn btn-primary intro-play" onClick={play} aria-label={`Assistir ao vídeo de abertura do módulo ${mod.title}`}>
              <Play size={18} aria-hidden="true" /> Assistir
            </button>
          )}
        </div>

        <details className="intro-transcript">
          <summary>Transcrição do vídeo</summary>
          <ol>
            {video.cues.map((c) => (
              <li key={c.start}>
                <span className="mono muted small">{String(Math.floor(c.start / 60)).padStart(2, "0")}:{String(c.start % 60).padStart(2, "0")}</span> {c.text}
              </li>
            ))}
          </ol>
        </details>

        <div className="intro-foot">
          <span className="muted small">Legendas em português no próprio vídeo (botão CC).</span>
          <span className="grow" />
          <button ref={skipRef} className={`btn ${ended ? "btn-primary" : "btn-ghost"}`} onClick={closeIntro}>
            <SkipForward size={16} aria-hidden="true" /> {rotuloFechar}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
