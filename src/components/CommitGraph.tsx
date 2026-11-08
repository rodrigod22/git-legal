import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { layoutGraph } from "@/engine/graph";
import type { Repo } from "@/engine/types";
import { short } from "@/engine/hash";
import { useStore } from "@/state/store";

const LANE_COLORS = ["#f05032", "#22c55e", "#8b5cf6", "#22d3ee", "#f59e0b", "#e879f9", "#3b82f6", "#f43f5e"];
const ROW_H = 58;
const LANE_W = 38;
const PAD_X = 34;
const PAD_Y = 40;
const R = 9;

export function CommitGraph({ repo }: { repo: Repo }) {
  const insertInTerminal = useStore((s) => s.insertInTerminal);
  const layout = useMemo(() => layoutGraph(repo), [repo]);
  const width = Math.max(520, PAD_X * 2 + layout.lanes * LANE_W + 420);
  const height = Math.max(240, PAD_Y * 2 + layout.rows * ROW_H);
  const x = (lane: number) => PAD_X + lane * LANE_W;
  const y = (row: number) => PAD_Y + row * ROW_H;
  const labelX = PAD_X + layout.lanes * LANE_W + 10;

  const state = repo.rebase ? "rebase" : repo.inProgress ? repo.inProgress.kind : repo.head.type === "detached" ? "detached" : null;

  if (!repo.initialized || layout.nodes.length === 0) {
    return (
      <div className="graph-wrap center" style={{ height: "100%" }}>
        <div style={{ textAlign: "center", color: "var(--muted)" }}>
          <div style={{ fontSize: 42, marginBottom: 8 }} aria-hidden="true">🌱</div>
          <b>{repo.initialized ? "Nenhum commit ainda" : "Pasta sem repositório"}</b>
          <div className="small">{repo.initialized ? "Faça o primeiro commit e ele aparece aqui." : "Rode git init para começar."}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="graph-wrap" style={{ height: "100%" }} tabIndex={0} role="region" aria-label="Grafo de commits">
      <div className="graph-head">
        <span className="pill"><span aria-hidden="true">🕸 </span>grafo de commits</span>
        <span>mais novo em cima</span>
        {state && (
          <span className="pill" style={{ borderColor: state === "detached" ? "var(--cyan)" : "var(--yellow)", color: state === "detached" ? "var(--cyan)" : "var(--yellow)" }}>
            <span aria-hidden="true">{state === "rebase" ? "⟳ " : state === "detached" ? "⚠ " : "⚡ "}</span>
            {state === "rebase" ? "rebase em andamento" : state === "detached" ? "HEAD desanexado" : `${state} em andamento`}
          </span>
        )}
        {repo.conflicts.length > 0 && (
          <span className="pill" style={{ borderColor: "var(--red)", color: "#fb7185" }}>
            <span aria-hidden="true">✖ </span>{repo.conflicts.length} conflito(s)
          </span>
        )}
      </div>
      <svg width={width} height={height} style={{ display: "block" }} role="group" aria-label={`${layout.nodes.length} commit(s), do mais novo para o mais antigo; cada hash é um botão que o coloca no terminal`}>
        <title>Grafo de commits do repositório</title>
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <AnimatePresence>
          {layout.edges.map((e) => {
            const x1 = x(e.fromLane);
            const y1 = y(e.fromRow);
            const x2 = x(e.toLane);
            const y2 = y(e.toRow);
            const color = LANE_COLORS[(e.fromLane === e.toLane ? e.toLane : Math.max(e.fromLane, e.toLane)) % LANE_COLORS.length];
            const d = x1 === x2 ? `M ${x1} ${y1} L ${x2} ${y2}` : `M ${x1} ${y1} C ${x1} ${y1 + ROW_H * 0.6}, ${x2} ${y2 - ROW_H * 0.6}, ${x2} ${y2}`;
            return (
              <motion.path
                key={`${e.from}-${e.to}`}
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={2.2}
                strokeOpacity={0.75}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              />
            );
          })}
        </AnimatePresence>
        <AnimatePresence>
          {layout.nodes.map((n) => {
            const cx = x(n.lane);
            const cy = y(n.row);
            const color = LANE_COLORS[n.lane % LANE_COLORS.length];
            return (
              <motion.g
                key={n.sha}
                initial={{ opacity: 0, scale: 0.4, x: cx, y: cy }}
                animate={{ opacity: 1, scale: 1, x: cx, y: cy }}
                exit={{ opacity: 0, scale: 0.4 }}
                transition={{ type: "spring", stiffness: 260, damping: 22 }}
              >
                {n.isHead && <circle r={R + 7} fill={color} fillOpacity={0.18} filter="url(#glow)" />}
                {n.isMerge ? (
                  <rect x={-R} y={-R} width={R * 2} height={R * 2} rx={4} fill="#0a0e16" stroke={color} strokeWidth={2.5} transform="rotate(45)" />
                ) : (
                  <circle r={R} fill="#0a0e16" stroke={color} strokeWidth={2.5} />
                )}
                <circle r={3.2} fill={color} />
                <text
                  x={labelX - cx}
                  y={4}
                  className="graph-sha"
                  fill="#fbbf24"
                  fontFamily="var(--mono)"
                  fontSize={11}
                  tabIndex={0}
                  role="button"
                  aria-label={`Usar o hash ${short(n.sha)} no terminal`}
                  onClick={() => insertInTerminal(short(n.sha))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      insertInTerminal(short(n.sha));
                    }
                  }}
                >
                  <title>Clique ou Enter para usar este hash no terminal</title>
                  {short(n.sha)}
                </text>
                <text x={labelX - cx + 62} y={4} fill="#e6eaf2" fontFamily="var(--font)" fontSize={12.5}>
                  {truncate(n.message, 38)}
                </text>
                <text x={labelX - cx + 62} y={19} fill="#64748b" fontFamily="var(--font)" fontSize={10.5}>
                  {n.author}
                </text>
                {n.labels.map((l, i) => {
                  const w = l.name.length * 6.6 + 16;
                  const prevW = n.labels.slice(0, i).reduce((s, p) => s + p.name.length * 6.6 + 22, 0);
                  const lx = labelX - cx + 62 + 240 + prevW;
                  const fill = l.kind === "head" ? "#22d3ee" : l.kind === "remote" ? "#f97316" : "#22c55e";
                  return (
                    <motion.g key={l.name} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}>
                      <rect x={lx} y={-11} width={w} height={22} rx={6} fill={fill} fillOpacity={0.14} stroke={fill} strokeOpacity={0.7} />
                      <text x={lx + 8} y={4} fill={fill} fontFamily="var(--mono)" fontSize={10.5} fontWeight={700}>
                        {l.name}
                      </text>
                    </motion.g>
                  );
                })}
              </motion.g>
            );
          })}
        </AnimatePresence>
      </svg>
    </div>
  );
}

function truncate(s: string, n: number) {
  const first = s.split("\n")[0];
  return first.length > n ? first.slice(0, n - 1) + "…" : first;
}
