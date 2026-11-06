/**
 * Algoritmos de diff usados pelo motor Git do Dojo.
 *
 * - `lcsMap`: alinhamento de linhas (LCS) entre duas sequências.
 * - `diffLines`: diff simples (linhas adicionadas/removidas/iguais).
 * - `merge3`: merge de três vias (base, ours, theirs) no estilo diff3,
 *   produzindo marcadores de conflito idênticos aos do Git real.
 */

export type DiffOp = { kind: "same" | "add" | "del"; text: string };

/** Retorna, para cada linha de `a`, o índice da linha correspondente em `b` (ou -1). */
export function lcsMap(a: string[], b: string[]): number[] {
  const n = a.length;
  const m = b.length;
  // tabela (n+1)x(m+1) — tamanhos de arquivo no treinamento são pequenos
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const map = new Array(n).fill(-1);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      map[i] = j;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return map;
}

export function diffLines(a: string[], b: string[]): DiffOp[] {
  const map = lcsMap(a, b);
  const ops: DiffOp[] = [];
  let j = 0;
  for (let i = 0; i < a.length; i++) {
    if (map[i] === -1) {
      ops.push({ kind: "del", text: a[i] });
    } else {
      while (j < map[i]) ops.push({ kind: "add", text: b[j++] });
      ops.push({ kind: "same", text: a[i] });
      j = map[i] + 1;
    }
  }
  while (j < b.length) ops.push({ kind: "add", text: b[j++] });
  return ops;
}

export function splitLines(s: string): string[] {
  if (s === "") return [];
  const lines = s.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export function joinLines(lines: string[]): string {
  return lines.length ? lines.join("\n") + "\n" : "";
}

export interface Merge3Result {
  text: string;
  conflict: boolean;
  /** Quantidade de blocos em conflito */
  hunks: number;
}

type Chunk = { base: string[]; ours: string[]; theirs: string[] };

/**
 * Merge de três vias no estilo diff3: alinha `ours` e `theirs` com `base`,
 * identifica regiões estáveis (linha da base presente nos dois lados) e
 * resolve cada bloco entre regiões estáveis. Blocos alterados nos dois
 * lados de forma diferente viram conflito com marcadores do Git.
 */
export function merge3(
  baseText: string,
  oursText: string,
  theirsText: string,
  labels: { ours: string; theirs: string } = { ours: "HEAD", theirs: "theirs" },
): Merge3Result {
  if (oursText === theirsText) return { text: oursText, conflict: false, hunks: 0 };
  if (oursText === baseText) return { text: theirsText, conflict: false, hunks: 0 };
  if (theirsText === baseText) return { text: oursText, conflict: false, hunks: 0 };

  const base = splitLines(baseText);
  const ours = splitLines(oursText);
  const theirs = splitLines(theirsText);
  const mapO = lcsMap(base, ours);
  const mapT = lcsMap(base, theirs);

  const chunks: Chunk[] = [];
  const out: string[] = [];
  let hunks = 0;

  // "cursores" do último ponto estável consumido em cada sequência
  let bi = 0;
  let oi = 0;
  let ti = 0;

  const flushChunk = (c: Chunk) => {
    const same = (x: string[], y: string[]) => x.length === y.length && x.every((l, k) => l === y[k]);
    if (same(c.ours, c.theirs)) out.push(...c.ours);
    else if (same(c.ours, c.base)) out.push(...c.theirs);
    else if (same(c.theirs, c.base)) out.push(...c.ours);
    else {
      hunks++;
      out.push(`<<<<<<< ${labels.ours}`, ...c.ours, "=======", ...c.theirs, `>>>>>>> ${labels.theirs}`);
    }
  };

  for (let i = 0; i < base.length; i++) {
    const stable = mapO[i] !== -1 && mapT[i] !== -1;
    if (!stable) continue;
    const chunk: Chunk = {
      base: base.slice(bi, i),
      ours: ours.slice(oi, mapO[i]),
      theirs: theirs.slice(ti, mapT[i]),
    };
    if (chunk.base.length || chunk.ours.length || chunk.theirs.length) {
      chunks.push(chunk);
      flushChunk(chunk);
    }
    out.push(base[i]);
    bi = i + 1;
    oi = mapO[i] + 1;
    ti = mapT[i] + 1;
  }
  const tail: Chunk = { base: base.slice(bi), ours: ours.slice(oi), theirs: theirs.slice(ti) };
  if (tail.base.length || tail.ours.length || tail.theirs.length) flushChunk(tail);

  return { text: joinLines(out), conflict: hunks > 0, hunks };
}

/** Verifica se um conteúdo ainda tem marcadores de conflito. */
export function hasConflictMarkers(text: string): boolean {
  return /^(<<<<<<< |=======$|>>>>>>> )/m.test(text);
}
