import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useStore, type Toast } from "@/state/store";

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Some sozinho depois de `duration`, mas o relógio para enquanto o mouse está em cima ou algo dentro tem foco (WCAG 2.2.1). */
function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(t.duration);
  const startedAt = useRef(0);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    const timer = setTimeout(() => dismissRef.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused]);

  return (
    <motion.div
      className={`toast ${t.kind}`}
      initial={{ opacity: 0, x: 40, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40 }}
      onClick={onDismiss}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false); }}
    >
      {t.kind === "colleague" && <span className="avatar">{(t.actor ?? "?").slice(0, 1).toUpperCase()}</span>}
      {t.kind === "badge" && <span style={{ fontSize: 22 }} aria-hidden="true">🏆</span>}
      {t.kind === "xp" && <span style={{ fontSize: 22 }} aria-hidden="true">✨</span>}
      <div>
        <b>{t.title}</b>
        {t.text && <div className="small muted">{t.text}</div>}
      </div>
      <button type="button" className="btn btn-ghost btn-sm toast-close" onClick={(e) => { e.stopPropagation(); onDismiss(); }} aria-label={`Fechar aviso: ${t.title}`} title="Fechar">
        <X size={14} aria-hidden="true" />
      </button>
    </motion.div>
  );
}
