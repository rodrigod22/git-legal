import type { DiagramId } from "@/content/types";

const C = { main: "#f05032", feat: "#22c55e", head: "#22d3ee", remote: "#f97316", violet: "#8b5cf6", muted: "#475569", text: "#cbd5e1", red: "#ef4444", yellow: "#f59e0b" };

function Node({ x, y, color, label, r = 9, square = false }: { x: number; y: number; color: string; label?: string; r?: number; square?: boolean }) {
  return (
    <g>
      {square ? <rect x={x - r} y={y - r} width={r * 2} height={r * 2} rx={3} transform={`rotate(45 ${x} ${y})`} fill="#0a0e16" stroke={color} strokeWidth={2} /> : <circle cx={x} cy={y} r={r} fill="#0a0e16" stroke={color} strokeWidth={2} />}
      <circle cx={x} cy={y} r={3} fill={color} />
      {label && (
        <text x={x} y={y + r + 12} textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
}

function Tag({ x, y, text, color }: { x: number; y: number; text: string; color: string }) {
  const w = text.length * 6.4 + 12;
  return (
    <g>
      <rect x={x - w / 2} y={y - 9} width={w} height={18} rx={5} fill={color} fillOpacity={0.15} stroke={color} />
      <text x={x} y={y + 3.5} textAnchor="middle" fill={color} fontWeight={700}>
        {text}
      </text>
    </g>
  );
}

function Line({ x1, y1, x2, y2, color, dashed = false }: { x1: number; y1: number; x2: number; y2: number; color: string; dashed?: boolean }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={2} strokeOpacity={0.8} strokeDasharray={dashed ? "4 4" : undefined} />;
}

function Curve({ x1, y1, x2, y2, color, dashed = false }: { x1: number; y1: number; x2: number; y2: number; color: string; dashed?: boolean }) {
  const mx = (x1 + x2) / 2;
  return <path d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} fill="none" stroke={color} strokeWidth={2} strokeOpacity={0.8} strokeDasharray={dashed ? "4 4" : undefined} />;
}

function Arrow({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const hx = x2 - 8 * Math.cos(a);
  const hy = y2 - 8 * Math.sin(a);
  return (
    <g>
      <line x1={x1} y1={y1} x2={hx} y2={hy} stroke={color} strokeWidth={2} />
      <polygon points={`${x2},${y2} ${hx - 5 * Math.sin(a)},${hy + 5 * Math.cos(a)} ${hx + 5 * Math.sin(a)},${hy - 5 * Math.cos(a)}`} fill={color} />
    </g>
  );
}

function Box({ x, y, w, h, title, color, children }: { x: number; y: number; w: number; h: number; title: string; color: string; children?: React.ReactNode }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={10} fill={color} fillOpacity={0.08} stroke={color} strokeOpacity={0.6} />
      <text x={x + w / 2} y={y + 16} textAnchor="middle" className="lbl" fill={color} fontWeight={700}>
        {title}
      </text>
      {children}
    </g>
  );
}

export function Diagram({ id }: { id: DiagramId }) {
  switch (id) {
    case "three-areas":
      return (
        <svg className="diagram" viewBox="0 0 320 130">
          <Box x={8} y={14} w={92} h={100} title="working dir" color={C.yellow}>
            <text x={54} y={50} textAnchor="middle">README.md</text>
            <text x={54} y={66} textAnchor="middle">index.php</text>
          </Box>
          <Box x={114} y={14} w={92} h={100} title="staging" color={C.feat}>
            <text x={160} y={50} textAnchor="middle">README.md</text>
          </Box>
          <Box x={220} y={14} w={92} h={100} title="repositório" color={C.main}>
            <Node x={266} y={56} color={C.main} />
            <Node x={266} y={86} color={C.main} />
            <Line x1={266} y1={65} x2={266} y2={77} color={C.main} />
          </Box>
          <Arrow x1={100} y1={95} x2={114} y2={95} color={C.text} />
          <text x={107} y={124} textAnchor="middle" className="lbl">git add</text>
          <Arrow x1={206} y1={95} x2={220} y2={95} color={C.text} />
          <text x={213} y={124} textAnchor="middle" className="lbl">git commit</text>
        </svg>
      );
    case "branch":
      return (
        <svg className="diagram" viewBox="0 0 320 120">
          <Line x1={40} y1={70} x2={160} y2={70} color={C.main} />
          <Curve x1={160} y1={70} x2={230} y2={35} color={C.feat} />
          <Node x={40} y={70} color={C.main} label="c1" />
          <Node x={100} y={70} color={C.main} label="c2" />
          <Node x={160} y={70} color={C.main} label="c3" />
          <Node x={230} y={35} color={C.feat} label="c4" />
          <Tag x={160} y={100} text="main" color={C.main} />
          <Tag x={275} y={35} text="feature/login" color={C.feat} />
          <Tag x={230} y={12} text="HEAD" color={C.head} />
        </svg>
      );
    case "fast-forward":
      return (
        <svg className="diagram" viewBox="0 0 320 130">
          <text x={10} y={20} className="lbl">antes</text>
          <Line x1={40} y1={40} x2={100} y2={40} color={C.main} />
          <Line x1={100} y1={40} x2={220} y2={40} color={C.feat} />
          <Node x={40} y={40} color={C.main} />
          <Node x={100} y={40} color={C.main} />
          <Node x={160} y={40} color={C.feat} />
          <Node x={220} y={40} color={C.feat} />
          <Tag x={100} y={18} text="main" color={C.main} />
          <Tag x={220} y={18} text="feature" color={C.feat} />
          <text x={10} y={90} className="lbl">depois do merge (fast-forward)</text>
          <Line x1={40} y1={110} x2={220} y2={110} color={C.main} />
          <Node x={40} y={110} color={C.main} />
          <Node x={100} y={110} color={C.main} />
          <Node x={160} y={110} color={C.main} />
          <Node x={220} y={110} color={C.main} />
          <Tag x={250} y={88} text="main" color={C.main} />
          <Tag x={296} y={88} text="feature" color={C.feat} />
          <Arrow x1={110} y1={62} x2={200} y2={88} color={C.muted} />
        </svg>
      );
    case "three-way":
      return (
        <svg className="diagram" viewBox="0 0 320 130">
          <Line x1={40} y1={70} x2={100} y2={70} color={C.main} />
          <Line x1={100} y1={70} x2={180} y2={70} color={C.main} />
          <Curve x1={100} y1={70} x2={180} y2={30} color={C.feat} />
          <Curve x1={180} y1={70} x2={250} y2={50} color={C.main} />
          <Curve x1={180} y1={30} x2={250} y2={50} color={C.feat} />
          <Node x={40} y={70} color={C.main} />
          <Node x={100} y={70} color={C.violet} label="base" />
          <Node x={180} y={70} color={C.main} label="main" />
          <Node x={180} y={30} color={C.feat} label="feature" />
          <Node x={250} y={50} color={C.main} square label="merge" />
          <text x={290} y={55} fill={C.text} className="lbl">2 pais</text>
          <text x={18} y={118} className="lbl">O Git compara base × main × feature e combina o que mudou de cada lado.</text>
        </svg>
      );
    case "conflict":
      return (
        <svg className="diagram" viewBox="0 0 320 128">
          <rect x={8} y={8} width={304} height={112} rx={8} fill="#0a0e16" stroke={C.muted} />
          <text x={18} y={28} fill={C.head} fontWeight={700}>{"<<<<<<< HEAD"}</text>
          <text x={18} y={44} fill="#a5f3fc">{"# Portal RPA v2"}</text>
          <text x={18} y={60} fill={C.yellow} fontWeight={700}>{"======="}</text>
          <text x={18} y={76} fill="#f5d0fe">{"# Portal RPA — Intranet"}</text>
          <text x={18} y={92} fill={C.violet} fontWeight={700}>{">>>>>>> feature/titulo"}</text>
          <text x={200} y={44} className="lbl" fill={C.head}>← seu lado (onde você está)</text>
          <text x={200} y={76} className="lbl" fill={C.violet}>← lado que chega</text>
          <text x={18} y={112} className="lbl">Resolver = escrever a versão final e apagar as 3 linhas de marcador.</text>
        </svg>
      );
    case "rebase":
      return (
        <svg className="diagram" viewBox="0 0 320 130">
          <text x={10} y={18} className="lbl">antes</text>
          <Line x1={30} y1={40} x2={130} y2={40} color={C.main} />
          <Curve x1={80} y1={40} x2={130} y2={20} color={C.feat} />
          <Node x={30} y={40} color={C.main} r={7} />
          <Node x={80} y={40} color={C.main} r={7} />
          <Node x={130} y={40} color={C.main} r={7} />
          <Node x={130} y={20} color={C.feat} r={7} />
          <Tag x={165} y={40} text="main" color={C.main} />
          <Tag x={172} y={18} text="feature" color={C.feat} />
          <text x={10} y={80} className="lbl">depois de git rebase main</text>
          <Line x1={30} y1={105} x2={180} y2={105} color={C.main} />
          <Node x={30} y={105} color={C.main} r={7} />
          <Node x={80} y={105} color={C.main} r={7} />
          <Node x={130} y={105} color={C.main} r={7} />
          <Node x={180} y={105} color={C.feat} r={7} label="c4'" />
          <Tag x={130} y={125} text="main" color={C.main} />
          <Tag x={222} y={105} text="feature" color={C.feat} />
          <text x={210} y={70} className="lbl" fill={C.feat}>commit reaplicado</text>
          <text x={210} y={82} className="lbl" fill={C.feat}>(hash novo)</text>
        </svg>
      );
    case "trunk":
      return (
        <svg className="diagram" viewBox="0 0 320 120">
          <Line x1={20} y1={60} x2={300} y2={60} color={C.main} />
          {[40, 90, 140, 190, 240, 290].map((x, i) => (
            <Node key={x} x={x} y={60} color={i % 3 === 1 ? C.violet : i % 3 === 2 ? C.feat : C.main} r={7} />
          ))}
          <text x={40} y={40} textAnchor="middle" className="lbl">você</text>
          <text x={90} y={40} textAnchor="middle" className="lbl" fill={C.violet}>ana</text>
          <text x={140} y={40} textAnchor="middle" className="lbl" fill={C.feat}>carlos</text>
          <text x={190} y={40} textAnchor="middle" className="lbl">você</text>
          <text x={240} y={40} textAnchor="middle" className="lbl" fill={C.violet}>ana</text>
          <Tag x={290} y={88} text="origin/main" color={C.remote} />
          <text x={18} y={110} className="lbl">commit pequeno → git pull --rebase → git push · várias vezes por dia</text>
        </svg>
      );
    case "stash":
      return (
        <svg className="diagram" viewBox="0 0 320 110">
          <Box x={10} y={14} w={120} h={80} title="working dir" color={C.yellow}>
            <text x={70} y={55} textAnchor="middle">relatorio.php *</text>
          </Box>
          <Box x={190} y={14} w={120} h={80} title="stash (gaveta)" color={C.violet}>
            <text x={250} y={55} textAnchor="middle">stash@{"{0}"}</text>
          </Box>
          <Arrow x1={132} y1={44} x2={188} y2={44} color={C.text} />
          <text x={160} y={38} textAnchor="middle" className="lbl">git stash</text>
          <Arrow x1={188} y1={70} x2={132} y2={70} color={C.text} />
          <text x={160} y={84} textAnchor="middle" className="lbl">git stash pop</text>
        </svg>
      );
    case "detached":
      return (
        <svg className="diagram" viewBox="0 0 320 100">
          <Line x1={40} y1={55} x2={220} y2={55} color={C.main} />
          <Node x={40} y={55} color={C.main} label="c1" />
          <Node x={100} y={55} color={C.main} label="c2" />
          <Node x={160} y={55} color={C.main} label="c3" />
          <Node x={220} y={55} color={C.main} label="c4" />
          <Tag x={220} y={22} text="main" color={C.main} />
          <Tag x={100} y={22} text="HEAD" color={C.head} />
          <text x={240} y={60} className="lbl" fill={C.head}>HEAD fora da branch</text>
          <text x={240} y={72} className="lbl" fill={C.head}>= "desanexado"</text>
        </svg>
      );
    case "revert":
      return (
        <svg className="diagram" viewBox="0 0 320 120">
          <text x={10} y={18} className="lbl">reset: apaga (só local)</text>
          <Line x1={30} y1={40} x2={90} y2={40} color={C.main} />
          <Line x1={90} y1={40} x2={150} y2={40} color={C.muted} dashed />
          <Node x={30} y={40} color={C.main} r={7} />
          <Node x={90} y={40} color={C.main} r={7} />
          <Node x={150} y={40} color={C.muted} r={7} label="apagado" />
          <Tag x={90} y={18} text="main" color={C.main} />
          <text x={10} y={78} className="lbl">revert: adiciona o inverso (seguro no remoto)</text>
          <Line x1={30} y1={100} x2={210} y2={100} color={C.main} />
          <Node x={30} y={100} color={C.main} r={7} />
          <Node x={90} y={100} color={C.main} r={7} />
          <Node x={150} y={100} color={C.red} r={7} label="bug" />
          <Node x={210} y={100} color={C.feat} r={7} label="revert" />
          <Tag x={250} y={100} text="main" color={C.main} />
        </svg>
      );
    default:
      return null;
  }
}
