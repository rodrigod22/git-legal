import { AnimatePresence, motion } from "framer-motion";
import { useStore } from "@/state/store";

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div key={t.id} className={`toast ${t.kind}`} initial={{ opacity: 0, x: 40, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }} onClick={() => dismiss(t.id)}>
            {t.kind === "colleague" && <span className="avatar">{(t.actor ?? "?").slice(0, 1).toUpperCase()}</span>}
            {t.kind === "badge" && <span style={{ fontSize: 22 }}>🏆</span>}
            {t.kind === "xp" && <span style={{ fontSize: 22 }}>✨</span>}
            <div>
              <b>{t.title}</b>
              {t.text && <div className="small muted">{t.text}</div>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
