/**
 * Layout do grafo de commits para o SVG animado.
 * Linhas = commits (mais novo em cima). Colunas = "lanes".
 */
import type { Repo, Sha } from "./types";
import { headSha } from "./repo";

export interface GraphNode {
  sha: Sha;
  row: number;
  lane: number;
  message: string;
  author: string;
  parents: Sha[];
  isMerge: boolean;
  labels: { name: string; kind: "head" | "branch" | "remote" | "tag" }[];
  isHead: boolean;
}

export interface GraphEdge {
  from: Sha;
  to: Sha;
  fromLane: number;
  toLane: number;
  fromRow: number;
  toRow: number;
  lane: number;
}

export interface GraphLayout {
  nodes: GraphNode[];
  edges: GraphEdge[];
  lanes: number;
  rows: number;
}

export function layoutGraph(repo: Repo): GraphLayout {
  const starts = new Set<Sha>();
  for (const s of Object.values(repo.branches)) starts.add(s);
  for (const s of Object.values(repo.remoteRefs)) starts.add(s);
  const head = headSha(repo);
  if (head) starts.add(head);
  if (repo.rebase) {
    starts.add(repo.rebase.head);
    starts.add(repo.rebase.originalTip);
  }
  if (repo.inProgress?.other) starts.add(repo.inProgress.other);

  const seen = new Set<Sha>();
  const stack = [...starts];
  while (stack.length) {
    const s = stack.pop()!;
    if (seen.has(s) || !repo.commits[s]) continue;
    seen.add(s);
    stack.push(...repo.commits[s].parents);
  }
  const commits = [...seen].map((s) => repo.commits[s]).sort((a, b) => b.timestamp - a.timestamp);

  // Atribuição de lanes: cada lane "espera" por um commit (o pai que ainda não foi desenhado).
  const laneWaiting: (Sha | null)[] = [];
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeBySha = new Map<Sha, GraphNode>();

  commits.forEach((c, row) => {
    let lane = laneWaiting.indexOf(c.sha);
    if (lane === -1) {
      lane = laneWaiting.indexOf(null);
      if (lane === -1) {
        lane = laneWaiting.length;
        laneWaiting.push(null);
      }
    }
    // outras lanes também esperando este commit colapsam nesta
    for (let i = 0; i < laneWaiting.length; i++) if (i !== lane && laneWaiting[i] === c.sha) laneWaiting[i] = null;
    laneWaiting[lane] = null;

    const node: GraphNode = {
      sha: c.sha,
      row,
      lane,
      message: c.message,
      author: c.author,
      parents: c.parents,
      isMerge: c.parents.length > 1,
      labels: [],
      isHead: c.sha === head,
    };
    nodes.push(node);
    nodeBySha.set(c.sha, node);

    c.parents.forEach((p, idx) => {
      if (!repo.commits[p]) return;
      const already = laneWaiting.indexOf(p);
      if (idx === 0 && laneWaiting[lane] === null) laneWaiting[lane] = p;
      else if (already === -1) {
        let free = laneWaiting.indexOf(null, idx === 0 ? 0 : lane + 1);
        if (free === -1) {
          free = laneWaiting.length;
          laneWaiting.push(null);
        }
        laneWaiting[free] = p;
      }
    });
  });

  // arestas (precisam das lanes finais dos pais)
  for (const n of nodes) {
    for (const p of n.parents) {
      const pn = nodeBySha.get(p);
      if (!pn) continue;
      edges.push({ from: n.sha, to: p, fromLane: n.lane, toLane: pn.lane, fromRow: n.row, toRow: pn.row, lane: n.lane });
    }
  }

  // rótulos
  const add = (sha: Sha, name: string, kind: GraphNode["labels"][number]["kind"]) => nodeBySha.get(sha)?.labels.push({ name, kind });
  if (head) add(head, "HEAD", "head");
  for (const [b, s] of Object.entries(repo.branches)) add(s, b, "branch");
  for (const [b, s] of Object.entries(repo.remoteRefs)) add(s, b, "remote");

  return { nodes, edges, lanes: laneWaiting.length || 1, rows: nodes.length };
}
