import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { X, Save, Check } from "lucide-react";
import { useStore } from "@/state/store";

interface Hunk {
  index: number;
  start: number;
  end: number;
  oursLabel: string;
  theirsLabel: string;
  ours: string[];
  theirs: string[];
}

function parseHunks(text: string): Hunk[] {
  const lines = text.split("\n");
  const hunks: Hunk[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].startsWith("<<<<<<< ")) {
      const start = i;
      const oursLabel = lines[i].slice(8);
      const ours: string[] = [];
      const theirs: string[] = [];
      i++;
      while (i < lines.length && lines[i] !== "=======") ours.push(lines[i++]);
      i++;
      let theirsLabel = "";
      while (i < lines.length && !lines[i].startsWith(">>>>>>> ")) theirs.push(lines[i++]);
      if (i < lines.length) theirsLabel = lines[i].slice(8);
      hunks.push({ index: hunks.length, start, end: i, oursLabel, theirsLabel, ours, theirs });
    }
    i++;
  }
  return hunks;
}

function resolveHunk(text: string, h: Hunk, choice: "ours" | "theirs" | "both"): string {
  const lines = text.split("\n");
  const replacement = choice === "ours" ? h.ours : choice === "theirs" ? h.theirs : [...h.ours, ...h.theirs];
  lines.splice(h.start, h.end - h.start + 1, ...replacement);
  return lines.join("\n");
}

export function Editor() {
  const path = useStore((s) => s.editorPath);
  const session = useStore((s) => s.session);
  const openEditor = useStore((s) => s.openEditor);
  const saveFile = useStore((s) => s.saveFile);
  const original = path ? session?.repo.workdir[path] ?? "" : "";
  const [text, setText] = useState(original);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setText(original);
    setSaved(false);
  }, [path, original]);

  const hunks = useMemo(() => parseHunks(text), [text]);
  const isConflict = !!path && (session?.repo.conflicts.includes(path) ?? false);

  if (!path) return null;

  const save = (close = false) => {
    saveFile(path, text);
    setSaved(true);
    if (close) openEditor(null);
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && openEditor(null)}>
      <motion.div className="card editor" initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}>
        <div className="editor-head">
          <span className="pill">✎ editor</span>
          <span className="name">{path}</span>
          {isConflict && <span className="pill" style={{ borderColor: "var(--red)", color: "#fb7185" }}>em conflito</span>}
          {hunks.length > 0 && <span className="pill" style={{ borderColor: "var(--yellow)", color: "#fbbf24" }}>{hunks.length} bloco(s) com marcadores</span>}
          {hunks.length === 0 && isConflict && <span className="pill" style={{ borderColor: "var(--green)", color: "#4ade80" }}>sem marcadores ✓</span>}
          <span className="grow" />
          <button className="btn btn-ghost btn-sm" onClick={() => openEditor(null)} aria-label="Fechar">
            <X size={16} />
          </button>
        </div>
        <div className="editor-body">
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setSaved(false); }}
            spellCheck={false}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();
                save(false);
              }
            }}
          />
          {hunks.length > 0 && (
            <div className="hunks">
              <div className="small muted">
                Cada bloco abaixo é um conflito. Escolha o que deve ficar — o editor reescreve o texto e remove os marcadores. Você também pode editar à mão em cima.
              </div>
              {hunks.map((h) => (
                <div className="hunk" key={h.index}>
                  <div className="side ours">
                    <b>⬆ atual (HEAD · {h.oursLabel})</b>
                    {h.ours.join("\n") || <i className="muted">(vazio)</i>}
                  </div>
                  <div className="side theirs">
                    <b>⬇ entrada ({h.theirsLabel})</b>
                    {h.theirs.join("\n") || <i className="muted">(vazio)</i>}
                  </div>
                  <div className="actions">
                    <button className="btn btn-sm" onClick={() => setText(resolveHunk(text, h, "ours"))}>Manter atual</button>
                    <button className="btn btn-sm" onClick={() => setText(resolveHunk(text, h, "theirs"))}>Manter entrada</button>
                    <button className="btn btn-sm" onClick={() => setText(resolveHunk(text, h, "both"))}>Manter ambos</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="editor-foot">
          <span className="small muted">Ctrl+S salva · depois rode <code>git add {path}</code> no terminal</span>
          <span className="grow" />
          {saved && (
            <span className="small" style={{ color: "var(--green)", display: "inline-flex", gap: 4, alignItems: "center" }}>
              <Check size={14} /> salvo
            </span>
          )}
          <button className="btn btn-sm" onClick={() => save(false)}>
            <Save size={14} /> Salvar
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => save(true)}>
            Salvar e fechar
          </button>
        </div>
      </motion.div>
    </div>
  );
}
