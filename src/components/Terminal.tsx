import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/state/store";
import { promptFor } from "@/content/session";
import { TermText } from "./Rich";
import * as G from "@/engine/repo";

const BASE_SUGGESTIONS = [
  "git status",
  "git add .",
  'git commit -m ""',
  "git log --oneline --graph --all",
  "git branch",
  "git switch ",
  "git switch -c ",
  "git merge ",
  "git rebase ",
  "git pull --rebase",
  "git push",
  "git stash",
  "git stash pop",
  "git diff",
  "git merge --abort",
  "git rebase --continue",
  "git rebase --abort",
  "git reset --soft HEAD~1",
  "git revert HEAD",
  "git reflog",
  "git fetch",
  "ls",
  "cat ",
  "edit ",
  "echo \"\" > ",
  "clear",
  "help",
];

function Prompt({ text }: { text: string }) {
  const m = text.match(/^(.*?)(\(.*\))?(\*?)$/);
  return (
    <span className="prompt">
      {m?.[1]}
      <span className="b">{m?.[2]}</span>
      <span className="t-y">{m?.[3]}</span> $
    </span>
  );
}

export function Terminal() {
  const session = useStore((s) => s.session);
  const run = useStore((s) => s.run);
  const pendingInsert = useStore((s) => s.terminalInsert);
  const [value, setValue] = useState("");
  const [histIdx, setHistIdx] = useState(-1);
  const outRef = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLInputElement>(null);

  const history = useMemo(() => session?.commands ?? [], [session]);
  const prompt = session ? promptFor(session.repo) : "projeto-rpa";

  // Para leitores de tela: só a saída do último comando, anunciada uma vez, sem reler o histórico.
  const ultimaSaida = useMemo(() => {
    const lines = session?.lines ?? [];
    let i = lines.length - 1;
    while (i >= 0 && lines[i].kind !== "input") i--;
    const texto = lines
      .slice(i + 1)
      .map((l) => l.text.replace(/<\/?[rgycmbd]>/g, "").replace(/&lt;/g, "<"))
      .join("\n");
    // a chave troca a cada comando, para o leitor anunciar de novo mesmo quando a saída se repete
    return { key: lines[i]?.id ?? -1, texto: lines.length === 0 ? "" : texto || "comando executado, sem saída" };
  }, [session?.lines]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    outRef.current?.scrollTo({ top: outRef.current.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [session?.lines.length]);

  // no toque, o foco automático abriria o teclado e rolaria a página para longe do título da missão
  useEffect(() => {
    if (window.matchMedia("(hover: hover)").matches) inRef.current?.focus();
  }, [session?.missionId]);

  // hash clicado no grafo: entra na linha de comando (com linha vazia, sugere git show)
  useEffect(() => {
    if (!pendingInsert) return;
    setValue((v) => {
      const base = v.trim() ? v : "git show ";
      return base + (base.endsWith(" ") ? "" : " ") + pendingInsert;
    });
    useStore.setState({ terminalInsert: null });
    inRef.current?.focus();
  }, [pendingInsert]);

  const suggestions = useMemo(() => {
    if (!session) return [];
    const v = value.trim();
    const names = [...G.allBranches(session.repo), ...Object.keys(session.repo.remoteRefs)];
    const files = Object.keys(session.repo.workdir);
    const pool = [...BASE_SUGGESTIONS];
    if (/^git (switch|checkout|merge|rebase|branch -[dD]|branch -m)\s+\S*$/.test(v) || /^git (switch|checkout|merge|rebase)\s*$/.test(v)) {
      const head = v.replace(/\s+\S*$/, "") + " ";
      pool.unshift(...names.map((n) => head + n));
    }
    if (/^(cat|edit|rm|git add|git restore|git restore --staged)\s*\S*$/.test(v)) {
      const head = v.replace(/\s+\S*$/, "").replace(/\s*$/, "") + " ";
      pool.unshift(...files.map((n) => head + n));
    }
    if (!v) return [];
    return pool.filter((p) => p.startsWith(v) && p !== v).slice(0, 6);
  }, [value, session]);

  const submit = () => {
    if (!value.trim()) return;
    run(value);
    setValue("");
    setHistIdx(-1);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") submit();
    else if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1);
      if (history[idx] !== undefined) {
        setHistIdx(idx);
        setValue(history[idx]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx === -1) return;
      const idx = histIdx + 1;
      if (idx >= history.length) {
        setHistIdx(-1);
        setValue("");
      } else {
        setHistIdx(idx);
        setValue(history[idx]);
      }
    } else if (e.key === "Tab" && !e.shiftKey && suggestions[0]) {
      // Tab só completa quando há sugestão; sem sugestão (ou com Shift), o foco segue para o próximo controle
      e.preventDefault();
      setValue(suggestions[0]);
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      run("clear");
    }
  };

  const ghost = suggestions[0] && suggestions[0].startsWith(value) && value ? suggestions[0].slice(value.length) : "";

  return (
    <div
      className="terminal"
      onClick={() => {
        // não rouba o foco de quem está selecionando texto para copiar
        if (!window.getSelection()?.toString()) inRef.current?.focus();
      }}
    >
      <div className="terminal-bar">
        <span className="dots">
          <i style={{ background: "#ef4444" }} />
          <i style={{ background: "#f59e0b" }} />
          <i style={{ background: "#22c55e" }} />
        </span>
        <span>bash — projeto-rpa</span>
        <span className="grow" />
        <span className="muted small">clique ou Enter no hash do grafo para usar · ↑↓ histórico · Tab completa · Ctrl+L limpa</span>
      </div>
      <div className="terminal-out" ref={outRef} tabIndex={0} role="region" aria-label="Histórico do terminal">
        {session?.lines.map((l) => (
          <div key={l.id} className={`line ${l.kind}`}>
            {l.kind === "input" ? (
              <>
                <Prompt text={l.prompt ?? ""} /> {l.text}
              </>
            ) : (
              <TermText text={l.text} />
            )}
          </div>
        ))}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true" data-testid="saida-leitor">
        <div key={ultimaSaida.key}>{ultimaSaida.texto}</div>
      </div>
      {suggestions.length > 0 && (
        <div className="suggest">
          {suggestions.map((s) => (
            <button key={s} onClick={() => { setValue(s); inRef.current?.focus(); }}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="terminal-in">
        <Prompt text={prompt} />
        <div style={{ position: "relative", flex: "1 1 140px", minWidth: 0, display: "flex" }}>
          <input
            ref={inRef}
            value={value}
            onChange={(e) => { setValue(e.target.value); setHistIdx(-1); }}
            onKeyDown={onKey}
            spellCheck={false}
            autoComplete="off"
            aria-label="Linha de comando"
            placeholder={session?.commands.length ? "" : "digite um comando… (ex.: git status)"}
          />
          {ghost && (
            <span className="ghost" style={{ left: 0, top: 0 }}>
              <span style={{ visibility: "hidden" }}>{value}</span>
              {ghost}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
