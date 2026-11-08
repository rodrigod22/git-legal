import { FileCode2, FileText, Folder } from "lucide-react";
import { useStore } from "@/state/store";
import * as G from "@/engine/repo";
import type { Repo } from "@/engine/types";

function icon(path: string) {
  return /\.(php|css|js|ts)$/.test(path) ? <FileCode2 size={14} color="#94a3b8" aria-hidden="true" /> : <FileText size={14} color="#94a3b8" aria-hidden="true" />;
}

export function FilePanel({ repo }: { repo: Repo }) {
  const openEditor = useStore((s) => s.openEditor);
  const st = repo.initialized ? G.status(repo) : null;
  const files = Object.keys(repo.workdir).sort();
  const badge = (p: string): { k: string; t: string } | null => {
    if (!st) return null;
    if (st.conflicts.includes(p)) return { k: "C", t: "conflito" };
    if (st.untracked.includes(p)) return { k: "U", t: "novo (untracked)" };
    const s = st.staged.find((f) => f.path === p);
    const u = st.unstaged.find((f) => f.path === p);
    if (s && u) return { k: "M", t: "staged + modificado" };
    if (s) return { k: "S", t: s.kind === "new" ? "staged (novo)" : "staged" };
    if (u) return { k: "M", t: "modificado" };
    return null;
  };

  return (
    <div>
      <div className="section-title" style={{ marginTop: 0 }}>
        <span className="row" style={{ gap: 6 }}>
          <Folder size={13} aria-hidden="true" /> projeto-rpa
        </span>
      </div>
      <div className="files">
        {files.length === 0 && <div className="small muted">pasta vazia</div>}
        {files.map((f) => {
          const b = badge(f);
          return (
            <button key={f} className="file" onClick={() => openEditor(f)} title={`abrir ${f} no editor`}>
              {icon(f)}
              <span>{f}</span>
              {b && (
                <span className={`badge ${b.k}`} title={b.t}>
                  <span aria-hidden="true">{b.k}</span>
                  <span className="sr-only">, {b.t}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {st && (
        <>
          <div className="section-title">As três áreas</div>
          <div className="areas">
            <div className="area">
              <h2>working directory</h2>
              {st.unstaged.length + st.untracked.length === 0 ? <div className="empty">nada modificado</div> : null}
              {st.untracked.map((p) => (
                <div key={p} className="mono small" style={{ color: "#cbd5e1" }}>
                  ? {p}
                </div>
              ))}
              {st.unstaged.map((f) => (
                <div key={f.path} className="mono small" style={{ color: "#fbbf24" }}>
                  {f.kind === "deleted" ? "D" : "M"} {f.path}
                </div>
              ))}
            </div>
            <div className="area">
              <h2>staging (index)</h2>
              {st.staged.length === 0 ? <div className="empty">bandeja vazia</div> : null}
              {st.staged.map((f) => (
                <div key={f.path} className="mono small" style={{ color: "#4ade80" }}>
                  {f.kind === "new" ? "A" : f.kind === "deleted" ? "D" : "M"} {f.path}
                </div>
              ))}
            </div>
            <div className="area">
              <h2>repositório</h2>
              <div className="small" style={{ color: "#cbd5e1" }}>
                {Object.keys(repo.commits).length} commit(s) · {Object.keys(repo.branches).length} branch(es)
                {repo.remote && (
                  <div className="muted">
                    origin: {st.hasUpstream ? (st.ahead || st.behind ? `${st.ahead}↑ ${st.behind}↓` : "sincronizado") : "sem upstream"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
