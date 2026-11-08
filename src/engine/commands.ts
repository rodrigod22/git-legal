/**
 * Interpretador de linha de comando do Dojo: shell mínimo + comandos git.
 * A saída usa marcação leve para cores: <r>vermelho</r> <g>verde</g> <y>amarelo</y>
 * <c>ciano</c> <m>magenta</m> <b>negrito</b> <d>apagado</d>.
 */
import * as G from "./repo";
import { GitError } from "./types";
import type { Repo } from "./types";

export type TerminalEvent =
  | "init"
  | "commit"
  | "branch"
  | "checkout"
  | "merge"
  | "fast-forward"
  | "conflict"
  | "resolved"
  | "rebase"
  | "push"
  | "pull"
  | "reset"
  | "stash"
  | "error"
  /** o Dojo não executou o comando: é válido no Git real, então não conta como erro do aluno */
  | "unsupported";

export interface CommandResult {
  repo: Repo;
  lines: string[];
  ok: boolean;
  event?: TerminalEvent;
  action?: { type: "edit"; path: string } | { type: "clear" } | { type: "help" };
  /** commit exibido por git show, já resolvido: HEAD~1 muda de sentido depois de um novo commit */
  shown?: string;
}

export function esc(s: string): string {
  return s.replace(/</g, "&lt;");
}

export function tokenize(input: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let has = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      has = true;
      continue;
    }
    if (ch === " " || ch === "\t") {
      if (cur || has) out.push(cur);
      cur = "";
      has = false;
      continue;
    }
    if (ch === ">" ) {
      if (cur || has) out.push(cur);
      cur = "";
      has = false;
      if (input[i + 1] === ">") {
        out.push(">>");
        i++;
      } else out.push(">");
      continue;
    }
    cur += ch;
  }
  if (cur || has) out.push(cur);
  return out;
}

/** Primeiro operador de shell fora de aspas (&&, ||, | ou ;), se houver. */
export function shellOperator(input: string): string | null {
  let quote: string | null = null;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (input.startsWith("&&", i) || input.startsWith("||", i)) {
      return input.slice(i, i + 2);
    } else if (ch === "|" || ch === ";") {
      return ch;
    }
  }
  return null;
}

function fmtDate(ts: number): string {
  const base = new Date(2026, 0, 5, 9, 0, 0).getTime() + ts * 7 * 60 * 1000;
  const d = new Date(base);
  const dias = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dias[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function decor(refs: string[]): string {
  if (!refs.length) return "";
  const parts = refs.map((r) => {
    if (r.startsWith("HEAD")) return `<c>${esc(r)}</c>`;
    if (r.includes("/")) return `<r>${esc(r)}</r>`;
    return `<g>${esc(r)}</g>`;
  });
  return ` <y>(</y>${parts.join("<y>, </y>")}<y>)</y>`;
}

const HELP = [
  "<b>Comandos do shell</b>",
  "  <c>ls</c>                      lista os arquivos",
  "  <c>cat</c> <arquivo>           mostra o conteúdo",
  "  <c>echo</c> \"texto\" > arquivo  cria/sobrescreve (>> adiciona ao final)",
  "  <c>edit</c> <arquivo>          abre o editor",
  "  <c>touch</c> / <c>rm</c> <arquivo>  cria vazio / apaga",
  "  <c>clear</c>                   limpa o terminal",
  "",
  "<b>Comandos git suportados</b>",
  "  init, status, add, commit -m, log [--oneline --graph --all], diff [--staged] [arquivo]",
  "  branch [-d -D -m], checkout [-b], switch [-c], merge [--abort --no-ff]",
  "  rebase [--continue --abort], reset [--soft --hard | arquivo], revert, cherry-pick",
  "  stash [pop list apply drop], restore [--staged], rm, show, reflog",
  "  fetch, pull [--rebase], push [-u origin <branch>], remote -v",
  "",
  "<d>Um comando por vez: &&, ||, | e ; funcionam no seu terminal, mas não aqui.</d>",
];

function failure(repo: Repo, message: string): CommandResult {
  return { repo, lines: message.split("\n").map((l) => `<r>${esc(l)}</r>`), ok: false, event: "error" };
}

export function execute(repo: Repo, input: string): CommandResult {
  const raw = input.trim();
  if (!raw) return { repo, lines: [], ok: true };
  const op = shellOperator(raw);
  if (op) {
    return {
      repo,
      lines: [`<y>aviso: o terminal do Dojo roda um comando por vez e não entende '${esc(op)}'. Nada foi executado.</y>`, "<d>dica: digite um comando, aperte Enter e depois digite o próximo. No seu terminal esse operador funciona.</d>"],
      ok: true,
      event: "unsupported",
    };
  }
  const argv = tokenize(raw);
  const cmd = argv[0];
  try {
    switch (cmd) {
      case "git":
        return git(repo, argv.slice(1));
      case "ls": {
        const files = Object.keys(repo.workdir).sort();
        return { repo, lines: files.length ? [files.map((f) => `<c>${esc(f)}</c>`).join("   ")] : ["<d>(pasta vazia)</d>"], ok: true };
      }
      case "pwd":
        return { repo, lines: ["/home/dev/projeto-rpa"], ok: true };
      case "cat": {
        if (!argv[1]) throw new GitError("cat: informe o arquivo");
        const content = G.readFile(repo, argv[1]);
        return { repo, lines: content ? content.replace(/\n$/, "").split("\n").map(esc) : ["<d>(arquivo vazio)</d>"], ok: true };
      }
      case "echo": {
        const op = argv.findIndex((t) => t === ">" || t === ">>");
        if (op === -1) return { repo, lines: [esc(argv.slice(1).join(" "))], ok: true };
        const text = argv.slice(1, op).join(" ");
        const path = argv[op + 1];
        if (!path) throw new GitError("echo: informe o arquivo depois de " + argv[op]);
        const r = argv[op] === ">" ? G.writeFile(repo, path, text + "\n") : G.appendFile(repo, path, text + "\n");
        return { repo: r, lines: [], ok: true };
      }
      case "touch": {
        if (!argv[1]) throw new GitError("touch: informe o arquivo");
        let r = repo;
        for (const p of argv.slice(1)) if (!(p in r.workdir)) r = G.writeFile(r, p, "");
        return { repo: r, lines: [], ok: true };
      }
      case "rm": {
        if (!argv[1]) throw new GitError("rm: informe o arquivo");
        return { repo: G.deleteFile(repo, argv[argv.length - 1]), lines: [], ok: true };
      }
      case "edit":
      case "nano":
      case "vim":
      case "code": {
        if (!argv[1]) throw new GitError(`${cmd}: informe o arquivo`);
        return { repo, lines: [`<d>abrindo ${esc(argv[1])} no editor…</d>`], ok: true, action: { type: "edit", path: argv[1] } };
      }
      case "clear":
      case "cls":
        return { repo, lines: [], ok: true, action: { type: "clear" } };
      case "help":
      case "?":
        return { repo, lines: HELP, ok: true, action: { type: "help" } };
      default:
        throw new GitError(`${cmd}: comando não encontrado. Digite <c>help</c> para ver os comandos disponíveis.`);
    }
  } catch (e) {
    if (e instanceof GitError) return failure(repo, e.message);
    throw e;
  }
}

/** Separa opções de posicionais. O argumento depois de uma opção de `values` é o valor dela, mesmo que comece com hífen. */
function flags(args: string[], values: string[] = []) {
  const f = new Set<string>();
  const pos: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (values.includes(a)) i++;
    else if (a.startsWith("-") && a !== "-") f.add(a);
    else pos.push(a);
  }
  return { f, pos };
}

/** Como flags(), mas o que vem depois de `--` é sempre arquivo, mesmo com cara de opção. Sem `--`, paths é null. */
function flagsAndPaths(args: string[]) {
  const dashes = args.indexOf("--");
  if (dashes === -1) return { ...flags(args), paths: null };
  return { ...flags(args.slice(0, dashes)), paths: args.slice(dashes + 1) };
}

/** Sem `--`, um nome precisa ser só referência ou só arquivo da pasta, como no Git. */
function isRevision(repo: Repo, name: string, sub: string): boolean {
  const onDisk = G.existsInWorkdir(repo, name);
  let unknown: GitError | null = null;
  try {
    G.resolve(repo, name);
  } catch (e) {
    if (!(e instanceof GitError)) throw e;
    unknown = e;
  }
  if (!unknown && onDisk) {
    throw new GitError(`fatal: '${name}' é ao mesmo tempo uma referência e um arquivo.\ndica: use '--' para separar. Referência: git ${sub} ${name} --   Arquivo: git ${sub} -- ${name}`);
  }
  if (unknown && !onDisk) throw new GitError(`${unknown.message}\ndica: se é um arquivo, ele não está na pasta. Use '--' antes do nome: git ${sub} -- ${name}`);
  return !unknown;
}

interface OptionSpec {
  flags: string[];
  /** opções seguidas de um valor */
  values?: string[];
  /** opções com o valor colado, como -5 ou -m"mensagem" */
  pattern?: RegExp;
  /** consulta: dá para ignorar a opção e mostrar a saída padrão */
  readOnly?: boolean;
}

/** Opções que o Dojo realmente implementa. As demais geram aviso em vez de serem ignoradas. */
const OPTIONS: Record<string, OptionSpec> = {
  init: { flags: [] },
  status: { flags: [], readOnly: true },
  add: { flags: ["-A", "--all"] },
  commit: { flags: ["-a"], values: ["-m", "-am"], pattern: /^-a?m./ },
  log: { flags: ["--oneline", "--graph", "--all", "--decorate"], values: ["-n"], pattern: /^-n?\d+$/, readOnly: true },
  branch: { flags: ["-a", "-r", "--list", "-d", "-D", "--delete", "-m", "-M", "--show-current"] },
  checkout: { flags: ["-b", "-f", "--force", "--"] },
  switch: { flags: ["-c", "--create", "-f", "--force", "--detach"] },
  merge: { flags: ["--abort", "--continue", "--no-ff", "--no-edit"] },
  rebase: { flags: ["--abort", "--continue"] },
  reset: { flags: ["--soft", "--mixed", "--hard", "--"] },
  revert: { flags: ["--abort", "--no-edit"] },
  "cherry-pick": { flags: ["--abort"] },
  stash: { flags: [], values: ["-m"] },
  diff: { flags: ["--staged", "--cached", "--"], readOnly: true },
  show: { flags: [], readOnly: true },
  reflog: { flags: [], readOnly: true },
  restore: { flags: ["--staged", "--"] },
  rm: { flags: ["--cached", "-f", "--force", "-r"] },
  remote: { flags: ["-v", "--verbose"] },
  fetch: { flags: ["--all"] },
  pull: { flags: ["--rebase", "-r"] },
  push: { flags: ["-u", "--set-upstream", "-f", "--force"] },
};

function unsupportedOptions(args: string[], spec: OptionSpec): string[] {
  const bad: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--" && spec.flags.includes(a)) break;
    if (spec.values?.includes(a)) i++;
    else if (a.startsWith("-") && a !== "-" && !spec.flags.includes(a) && !spec.pattern?.test(a)) bad.push(a);
  }
  return bad;
}

/** Recusa algo que existe no Git real, mas não no Dojo: nada muda e não conta como erro do aluno. */
function refuse(repo: Repo, what: string): CommandResult {
  return {
    repo,
    lines: [`<y>aviso: o Dojo não suporta ${esc(what)}. Nada foi alterado.</y>`, "<d>dica: isso existe no Git real, mas não neste simulador. Digite 'git help' para ver o que funciona aqui.</d>"],
    ok: true,
    event: "unsupported",
  };
}

function git(repo: Repo, args: string[]): CommandResult {
  const [sub, ...rest] = args;
  const spec = sub ? OPTIONS[sub] : undefined;
  const bad = spec ? unsupportedOptions(rest, spec) : [];
  if (!spec || !bad.length) return runGit(repo, args);
  const names = bad.map((a) => `'${a.split("=")[0]}'`).join(", ");
  const what = bad.length > 1 ? `as opções ${names}` : `a opção ${names}`;
  if (!spec.readOnly) return refuse(repo, what);
  const res = runGit(
    repo,
    args.filter((a) => !bad.includes(a)),
  );
  return { ...res, lines: [`<y>aviso: o Dojo não suporta ${esc(what)} e mostra a saída padrão.</y>`, ...res.lines] };
}

function runGit(repo: Repo, args: string[]): CommandResult {
  const sub = args[0];
  const rest = args.slice(1);
  if (!sub || sub === "help" || sub === "--help") return { repo, lines: HELP, ok: true, action: { type: "help" } };

  switch (sub) {
    case "init": {
      const r = G.init(repo);
      return { repo: r, lines: ["<g>Repositório Git vazio inicializado em /home/dev/projeto-rpa/.git/</g>"], ok: true, event: "init" };
    }
    case "status":
      return { repo, lines: statusLines(repo), ok: true };
    case "add": {
      if (!rest.length) throw new GitError("Nada especificado, nada adicionado.\ndica: use 'git add <arquivo>' ou 'git add .' para adicionar tudo");
      const had = repo.conflicts.length;
      const r = G.add(repo, rest);
      const resolved = had && !r.conflicts.length;
      return { repo: r, lines: resolved ? ["<g>Conflito marcado como resolvido. Agora finalize com 'git commit' (ou 'git rebase --continue').</g>"] : [], ok: true, event: resolved ? "resolved" : undefined };
    }
    case "commit": {
      const { f, pos } = flags(rest, ["-m", "-am"]);
      const mi = rest.findIndex((a) => a === "-m" || a === "-am");
      const glued = mi === -1 ? rest.find((a) => /^-a?m./.test(a)) : undefined;
      let r = repo;
      if (f.has("-a") || rest[mi] === "-am" || glued?.startsWith("-am")) r = G.add(r, Object.keys(r.index).filter((p) => p in r.workdir));
      let message = "";
      if (mi !== -1) message = rest[mi + 1] ?? "";
      else if (glued) message = glued.replace(/^-a?m/, "");
      else if (pos.length) message = pos.join(" ");
      if (!message) throw new GitError("Abortando commit: mensagem vazia.\ndica: git commit -m \"descreva o que mudou\"");
      const wasMerge = r.inProgress;
      const before = G.headSha(r);
      r = G.commit(r, message);
      const sha = G.headSha(r)!;
      const branch = G.currentBranch(r) ?? "HEAD desanexado";
      const st = G.status(repo);
      const changed = st.staged.length;
      const root = !before ? " (commit-raiz)" : "";
      const lines = [
        `[<g>${esc(branch)}</g>${root} <y>${G.short(sha)}</y>] ${esc(message)}`,
        wasMerge ? `<d> ${wasMerge.kind} concluído</d>` : `<d> ${changed} arquivo(s) alterado(s)</d>`,
      ];
      return { repo: r, lines, ok: true, event: wasMerge ? "merge" : "commit" };
    }
    case "log":
      return { repo, lines: logLines(repo, rest), ok: true };
    case "branch": {
      const { f, pos } = flags(rest);
      if (f.has("--show-current")) return { repo, lines: [G.currentBranch(repo) ?? ""], ok: true };
      if (f.has("-d") || f.has("-D") || f.has("--delete")) {
        if (!pos[0]) throw new GitError("fatal: nome da branch obrigatório");
        const r = G.branchDelete(repo, pos[0], f.has("-D"));
        return { repo: r, lines: [`Branch <g>${esc(pos[0])}</g> apagada (era ${G.short(repo.branches[pos[0]])}).`], ok: true, event: "branch" };
      }
      if (f.has("-m") || f.has("-M")) {
        const [from, to] = pos.length === 2 ? pos : [G.currentBranch(repo)!, pos[0]];
        return { repo: G.branchRename(repo, from, to), lines: [], ok: true, event: "branch" };
      }
      if (!pos.length) {
        const cur = G.currentBranch(repo);
        const lines = G.allBranches(repo).map((b) => (b === cur ? `* <g>${esc(b)}</g>` : `  ${esc(b)}`));
        if (f.has("-a") || f.has("-r")) for (const r of Object.keys(repo.remoteRefs).sort()) lines.push(`  <r>remotes/${esc(r)}</r>`);
        if (!lines.length) lines.push("<d>(nenhuma branch ainda — faça o primeiro commit)</d>");
        return { repo, lines, ok: true };
      }
      const r = G.branchCreate(repo, pos[0], pos[1]);
      return { repo: r, lines: [], ok: true, event: "branch" };
    }
    case "checkout":
    case "switch": {
      const { f, pos } = flags(rest);
      const create = f.has("-b") || f.has("-c") || f.has("--create");
      const detach = f.has("--detach");
      const fromRemote = pos[0] && !create && !detach ? G.remoteBranchFor(repo, pos[0]) : null;
      if (sub === "checkout" && pos.length && !f.has("--") && !create && fromRemote && pos[0] in repo.workdir) {
        throw new GitError(`fatal: '${pos[0]}' pode ser tanto um arquivo da pasta quanto a branch remota '${fromRemote}'.\ndica: use '--' para separar. Arquivo: git checkout -- ${pos[0]}   Branch: git switch ${pos[0]}`);
      }
      if (sub === "checkout" && pos.length && (f.has("--") || (!create && !(pos[0] in repo.branches) && pos[0] in repo.workdir))) {
        // git checkout -- arquivo  (restaura arquivo)
        const file = pos[pos.length - 1];
        return { repo: G.restoreFile(repo, file), lines: [`<d>Alterações em ${esc(file)} descartadas.</d>`], ok: true };
      }
      if (pos[0] === "-") throw new GitError("dica: 'git switch -' não é suportado no treinamento; informe o nome da branch.");
      if (!pos[0]) throw new GitError(`fatal: informe a branch. Ex.: git ${sub} ${create ? "-b " : ""}nome-da-branch`);
      if (sub === "switch" && !create && !detach && !(pos[0] in repo.branches) && !fromRemote) {
        G.resolve(repo, pos[0]); // nome desconhecido tem o erro próprio
        const kind = pos[0] in repo.remoteRefs ? "uma branch remota" : "um commit";
        throw new GitError(`fatal: o git switch espera uma branch, mas '${pos[0]}' é ${kind}.\ndica: para desanexar o HEAD nesse ponto, use 'git switch --detach ${pos[0]}'.`);
      }
      const already = !create && !detach && G.currentBranch(repo) === pos[0];
      const r = G.checkout(repo, pos[0], { create, force: f.has("-f") || f.has("--force"), startPoint: create ? pos[1] : undefined, detach });
      if (already) return { repo: r, lines: [`Already on '<g>${esc(pos[0])}</g>' <d>(você já está nessa branch)</d>`], ok: true };
      const lines = create
        ? [`Trocado para a nova branch '<g>${esc(pos[0])}</g>'`]
        : fromRemote
          ? [`branch '<g>${esc(pos[0])}</g>' criada para acompanhar '<r>${esc(fromRemote)}</r>'.`, `Trocado para a nova branch '<g>${esc(pos[0])}</g>'`]
          : r.head.type === "branch"
            ? [`Trocado para a branch '<g>${esc(pos[0])}</g>'`]
            : [`<y>Nota: você está em 'detached HEAD' no commit ${G.short(r.head.sha)}.</y>`, "<d>Você pode olhar, experimentar e commitar sem afetar nenhuma branch.</d>", "<d>Para voltar: git switch main</d>"];
      return { repo: r, lines, ok: true, event: create ? "branch" : "checkout" };
    }
    case "merge": {
      const { f, pos } = flags(rest);
      if (f.has("--abort")) return { repo: G.abortInProgress(repo, "merge"), lines: ["<d>Merge abortado. Árvore restaurada ao estado anterior.</d>"], ok: true, event: "reset" };
      if (f.has("--continue")) {
        if (!repo.inProgress) throw new GitError("fatal: não há merge em andamento");
        const r = G.commit(repo, repo.inProgress.message);
        return { repo: r, lines: [`[<g>${esc(G.currentBranch(r) ?? "HEAD")}</g> <y>${G.short(G.headSha(r)!)}</y>] ${esc(repo.inProgress.message)}`], ok: true, event: "merge" };
      }
      if (!pos[0]) throw new GitError("fatal: informe a branch para mesclar. Ex.: git merge feature/login");
      const res = G.merge(repo, pos[0], { noFf: f.has("--no-ff") });
      if (res.kind === "up-to-date") return { repo: res.repo, lines: ["Already up to date. <d>(já está tudo mesclado)</d>"], ok: true };
      if (res.kind === "fast-forward") {
        return { repo: res.repo, lines: [`Updating ${G.short(res.from)}..${G.short(res.to)}`, "<g>Fast-forward</g> <d>— a branch atual apenas avançou; nenhum commit de merge foi necessário</d>"], ok: true, event: "fast-forward" };
      }
      if (res.kind === "conflict") {
        const lines = [
          "Auto-merging…",
          ...res.conflicts.map((c) => `<r>CONFLICT (content): Merge conflict in ${esc(c)}</r>`),
          "<y>Automatic merge failed; fix conflicts and then commit the result.</y>",
          "<d>dica: abra o arquivo (edit), escolha o conteúdo final, remova os marcadores, 'git add' e 'git commit'.</d>",
        ];
        return { repo: res.repo, lines, ok: true, event: "conflict" };
      }
      return { repo: res.repo, lines: [`Merge made by the 'ort' strategy.`, `[<g>${esc(G.currentBranch(res.repo) ?? "HEAD")}</g> <y>${G.short(G.headSha(res.repo)!)}</y>] Merge branch '${esc(pos[0])}'`], ok: true, event: "merge" };
    }
    case "rebase": {
      const { f, pos } = flags(rest);
      let res: G.RebaseResult;
      if (f.has("--abort")) return { repo: G.rebaseAbort(repo), lines: ["<d>Rebase abortado. Branch restaurada.</d>"], ok: true, event: "reset" };
      if (f.has("--continue")) res = G.rebaseContinue(repo);
      else {
        if (!pos[0]) throw new GitError("fatal: informe a base. Ex.: git rebase main");
        res = G.rebase(repo, pos[0]);
      }
      if (res.kind === "blocked") return failure(res.repo, res.message!);
      if (res.kind === "up-to-date") return { repo: res.repo, lines: ["Current branch is up to date. <d>(nada a reaplicar)</d>"], ok: true };
      if (res.kind === "fast-forward") return { repo: res.repo, lines: ["<g>Fast-forward</g> <d>— sua branch apenas avançou para a base.</d>"], ok: true, event: "fast-forward" };
      const avisos = skippedLines(res.skipped);
      if (res.kind === "conflict") {
        const cur = res.repo.rebase!.current!;
        return {
          repo: res.repo,
          lines: [
            ...avisos,
            ...res.conflicts.map((c) => `<r>CONFLICT (content): Merge conflict in ${esc(c)}</r>`),
            `<y>error: could not apply ${G.short(cur)}... ${esc(res.repo.commits[cur].message)}</y>`,
            "<d>Resolva o conflito, 'git add <arquivo>' e então 'git rebase --continue' (ou 'git rebase --abort').</d>",
          ],
          ok: true,
          event: "conflict",
        };
      }
      return { repo: res.repo, lines: [...avisos, `<g>Successfully rebased and updated ${esc(G.currentBranch(res.repo) ?? "HEAD")}.</g>`], ok: true, event: "rebase" };
    }
    case "reset": {
      const { f, pos, paths: afterDashes } = flagsAndPaths(rest);
      const mode = f.has("--hard") ? "hard" : f.has("--soft") ? "soft" : "mixed";
      const rev = afterDashes || (pos[0] && isRevision(repo, pos[0], "reset")) ? pos[0] : undefined;
      const paths = [...(rev ? pos.slice(1) : pos), ...(afterDashes ?? [])];
      if (paths.length) {
        if (mode !== "mixed") throw new GitError(`fatal: não é possível usar --${mode} com arquivos.\ndica: 'git reset ${rev ?? "HEAD"} -- <arquivo>' tira o arquivo da staging, e 'git restore <arquivo>' descarta a alteração na pasta.`);
        const lines = f.has("--mixed") ? ["<y>aviso: --mixed com arquivo está obsoleto. Use 'git reset -- <arquivo>'.</y>"] : [];
        return { repo: G.unstage(repo, paths, rev), lines, ok: true };
      }
      if (!rev && mode === "mixed" && !G.headSha(repo)) return { repo: G.unstage(repo, []), lines: ["<d>Index restaurado (arquivos removidos da área de staging).</d>"], ok: true };
      const r = G.reset(repo, rev ?? "HEAD", mode);
      const lines = mode === "hard" ? [`HEAD is now at <y>${G.short(G.headSha(r)!)}</y> ${esc(r.commits[G.headSha(r)!].message)}`] : rev ? [] : ["<d>Index restaurado (arquivos removidos da área de staging).</d>"];
      // como no Git real: o reset encerra merge, revert e cherry-pick, mas um rebase parado continua
      const encerrado = repo.inProgress && !r.inProgress;
      if (mode !== "hard" && repo.conflicts.length && repo.rebase) {
        lines.push("<y>Conflito tirado da staging; o rebase continua parado.</y>", "<d>dica: os marcadores ficaram no arquivo. Edite, 'git add <arquivo>' e 'git rebase --continue' (ou 'git rebase --abort').</d>");
      } else if (encerrado && mode !== "hard") {
        lines.push(`<y>${esc(repo.inProgress!.kind)} encerrado pelo reset.</y>`);
        if (repo.conflicts.length) lines.push("<d>dica: os marcadores de conflito ficaram nos arquivos. Edite-os e faça um commit comum, ou use 'git restore <arquivo>' para voltar ao HEAD.</d>");
      }
      return { repo: r, lines, ok: true, event: rev || mode !== "mixed" || encerrado ? "reset" : undefined };
    }
    case "revert": {
      const { f, pos } = flags(rest);
      if (f.has("--abort")) return { repo: G.abortInProgress(repo, "revert"), lines: [`<d>${repo.inProgress?.kind === "cherry-pick" ? "Cherry-pick" : "Revert"} abortado.</d>`], ok: true };
      if (!pos[0]) throw new GitError("fatal: informe o commit a reverter. Ex.: git revert HEAD");
      const res = G.revert(repo, pos[0]);
      if (res.kind === "empty") {
        return failure(res.repo, `erro: nada para reverter: o HEAD já não tem a mudança do commit ${G.short(res.to)} (${repo.commits[res.to].message.split("\n")[0]}).\nNada foi alterado, e nenhum revert ficou em andamento.`);
      }
      if (res.kind === "conflict") return { repo: res.repo, lines: res.conflicts.map((c) => `<r>CONFLICT (content): conflict in ${esc(c)}</r>`), ok: true, event: "conflict" };
      return { repo: res.repo, lines: [`[<g>${esc(G.currentBranch(res.repo) ?? "HEAD")}</g> <y>${G.short(G.headSha(res.repo)!)}</y>] Revert "${esc(repo.commits[res.to].message)}"`], ok: true, event: "commit" };
    }
    case "cherry-pick": {
      const { f, pos } = flags(rest);
      if (f.has("--abort")) return { repo: G.abortInProgress(repo, "cherry-pick"), lines: [`<d>${repo.inProgress?.kind === "revert" ? "Revert" : "Cherry-pick"} abortado.</d>`], ok: true };
      if (!pos[0]) throw new GitError("fatal: informe o commit. Ex.: git cherry-pick a1b2c3d");
      const res = G.cherryPick(repo, pos[0]);
      if (res.kind === "empty") {
        return {
          repo: res.repo,
          lines: [
            `<r>erro: o cherry-pick de ${G.short(res.to)} (${esc(repo.commits[res.to].message.split("\n")[0])}) ficou vazio: a branch atual já tem essa mudança.</r>`,
            "<r>Nada foi commitado, e o cherry-pick continua em andamento, como no Git real.</r>",
            "<d>dica: 'git cherry-pick --abort' encerra. No Git real, 'git cherry-pick --skip' faz o mesmo neste caso.</d>",
          ],
          ok: false,
          event: "error",
        };
      }
      if (res.kind === "conflict") return { repo: res.repo, lines: res.conflicts.map((c) => `<r>CONFLICT (content): conflict in ${esc(c)}</r>`), ok: true, event: "conflict" };
      return { repo: res.repo, lines: [`[<g>${esc(G.currentBranch(res.repo) ?? "HEAD")}</g> <y>${G.short(G.headSha(res.repo)!)}</y>] ${esc(repo.commits[res.to].message)}`], ok: true, event: "commit" };
    }
    case "stash": {
      const { pos } = flags(rest, ["-m"]);
      const op = pos[0] ?? "push";
      if (!["push", "list", "pop", "apply", "drop"].includes(op)) return refuse(repo, `'git stash ${op}'`);
      if (pos[1] && pos[1] !== "stash@{0}") return refuse(repo, `'git stash ${op} ${pos[1]}': aqui só a entrada mais recente pode ser usada`);
      if (op === "list") return { repo, lines: repo.stash.length ? repo.stash.map((s, i) => `stash@{${i}}: ${esc(s.message)}`) : ["<d>(stash vazio)</d>"], ok: true };
      if (op === "pop" || op === "apply") {
        const r = G.stashPop(repo, op === "apply");
        return { repo: r, lines: r.conflicts.length ? r.conflicts.map((c) => `<r>CONFLICT (content): conflict in ${esc(c)}</r>`) : ["<g>Alterações restauradas do stash.</g>"], ok: true, event: r.conflicts.length ? "conflict" : "stash" };
      }
      if (op === "drop") {
        if (!repo.stash.length) throw new GitError("Nenhuma entrada de stash.");
        const r = G.clone(repo);
        r.stash.shift();
        return { repo: r, lines: ["<d>stash@{0} descartado.</d>"], ok: true };
      }
      const mi = rest.indexOf("-m");
      const r = G.stashPush(repo, mi !== -1 ? rest[mi + 1] : undefined);
      return { repo: r, lines: [`Saved working directory and index state ${esc(r.stash[0].message)}`], ok: true, event: "stash" };
    }
    case "diff": {
      const { f, pos, paths: afterDashes } = flagsAndPaths(rest);
      let revs = pos;
      let paths = afterDashes ?? [];
      if (!afterDashes) {
        const first = pos.findIndex((name) => !isRevision(repo, name, "diff"));
        if (first !== -1) [revs, paths] = [pos.slice(0, first), pos.slice(first)];
        const missing = paths.find((p) => !G.existsInWorkdir(repo, p));
        if (missing) throw new GitError(`fatal: '${missing}' não está na pasta.\ndica: para nomes que não existem na pasta, use '--': git diff -- ${missing}`);
      }
      const lines = G.diffText(repo, { staged: f.has("--staged") || f.has("--cached"), from: revs[0], to: revs[1], paths }).map((l) =>
        l.startsWith("+") ? `<g>${esc(l)}</g>` : l.startsWith("-") ? `<r>${esc(l)}</r>` : l.startsWith("diff") ? `<b>${esc(l)}</b>` : esc(l),
      );
      return { repo, lines: lines.length || paths.length ? lines : ["<d>(sem diferenças)</d>"], ok: true };
    }
    case "show": {
      const sha = G.resolve(repo, rest[0] ?? "HEAD");
      const c = repo.commits[sha];
      const lines = [`<y>commit ${c.sha}</y>${decor(G.refsAt(repo, sha))}`, `Author: ${esc(c.author)}`, `Date:   ${fmtDate(c.timestamp)}`, "", `    ${esc(c.message)}`, ""];
      lines.push(...G.commitDiff(repo, sha).map((l) => (l.startsWith("+") ? `<g>${esc(l)}</g>` : l.startsWith("-") ? `<r>${esc(l)}</r>` : esc(l))));
      return { repo, lines, ok: true, shown: sha };
    }
    case "reflog":
      return { repo, lines: repo.reflog.length ? repo.reflog.map((e, i) => `<y>${G.short(e.sha)}</y> HEAD@{${i}}: ${esc(e.action)}`) : ["<d>(reflog vazio)</d>"], ok: true };
    case "restore": {
      const { f, pos } = flags(rest);
      if (!pos[0]) throw new GitError("fatal: informe o arquivo. Ex.: git restore --staged arquivo.txt");
      let r = repo;
      for (const p of pos) r = G.restoreFile(r, p, { staged: f.has("--staged") });
      return { repo: r, lines: [], ok: true };
    }
    case "rm": {
      const { f, pos } = flags(rest);
      let r = repo;
      for (const p of pos) {
        if (!(p in r.index)) throw new GitError(`fatal: pathspec '${p}' não corresponde a nenhum arquivo rastreado`);
        if (!f.has("--cached")) r = G.deleteFile(r, p);
        const rr = G.clone(r);
        delete rr.index[p];
        r = rr;
      }
      return { repo: r, lines: pos.map((p) => `rm '${esc(p)}'`), ok: true };
    }
    case "remote": {
      const { pos } = flags(rest);
      if (pos[0]) return refuse(repo, `'git remote ${pos[0]}': o remoto do treinamento é fixo`);
      if (!repo.remote) return { repo, lines: ["<d>(nenhum remoto configurado)</d>"], ok: true };
      return { repo, lines: [`origin\thttps://git.rpa.com.br/rpa/projeto-rpa.git (fetch)`, `origin\thttps://git.rpa.com.br/rpa/projeto-rpa.git (push)`], ok: true };
    }
    case "fetch": {
      const before = { ...repo.remoteRefs };
      const r = G.fetch(repo);
      const lines = Object.entries(r.remoteRefs)
        .filter(([k, v]) => before[k] !== v)
        .map(([k, v]) => `   ${before[k] ? G.short(before[k]) + ".." : "[new]      "}${G.short(v)}  ${esc(k.split("/")[1])} -> <r>${esc(k)}</r>`);
      return { repo: r, lines: lines.length ? ["From origin", ...lines] : ["<d>(nada novo no remoto)</d>"], ok: true, event: "pull" };
    }
    case "pull": {
      const { f } = flags(rest);
      const res = G.pull(repo, { rebase: f.has("--rebase") || f.has("-r") });
      if (res.kind === "blocked") return failure(res.repo, res.message!);
      if (res.kind === "up-to-date") return { repo: res.repo, lines: ["Already up to date."], ok: true, event: "pull" };
      if (res.kind === "fast-forward") return { repo: res.repo, lines: ["From origin", "<g>Fast-forward</g> <d>— sua branch avançou para o estado do remoto.</d>"], ok: true, event: "pull" };
      if (res.kind === "rebased") return { repo: res.repo, lines: ["From origin", ...skippedLines(res.skipped), `<g>Successfully rebased and updated ${esc(G.currentBranch(res.repo)!)}.</g>`], ok: true, event: "rebase" };
      if (res.kind === "conflict") {
        return {
          repo: res.repo,
          lines: ["From origin", ...skippedLines(res.skipped), ...res.conflicts.map((c) => `<r>CONFLICT (content): Merge conflict in ${esc(c)}</r>`), "<y>Resolva o conflito antes de continuar.</y>"],
          ok: true,
          event: "conflict",
        };
      }
      return { repo: res.repo, lines: ["From origin", "Merge made by the 'ort' strategy."], ok: true, event: "merge" };
    }
    case "push": {
      const { f, pos } = flags(rest);
      const branch = pos[1] ?? (pos[0] && pos[0] !== "origin" ? pos[0] : undefined);
      const res = G.push(repo, { setUpstream: f.has("-u") || f.has("--set-upstream"), force: f.has("-f") || f.has("--force"), branch });
      void f;
      const lines = [
        "To origin",
        res.newBranch ? ` * [new branch]      ${esc(res.branch)} -> ${esc(res.branch)}` : `   ${G.short(res.from!)}..${G.short(res.to)}  ${esc(res.branch)} -> ${esc(res.branch)}`,
      ];
      return { repo: res.repo, lines, ok: true, event: "push" };
    }
    case "config":
      return {
        repo,
        lines: [`<y>aviso: 'git config' não tem efeito no Dojo. Nada foi alterado.</y>`, `<d>Aqui a identidade é fixa (${esc(repo.user.name)}). No seu computador, configure uma vez com git config --global user.name e user.email.</d>`],
        ok: true,
        event: "unsupported",
      };
    default:
      throw new GitError(`git: '${sub}' não é um comando git (ou não é suportado no Dojo). Digite 'git help'.`);
  }
}

/** Avisos do rebase sobre commits não reaplicados, como o "skipped previously applied commit" do Git. */
function skippedLines(skipped: G.SkippedCommit[] = []): string[] {
  return skipped.map((s) =>
    s.reason === "na-base"
      ? `<y>aviso: o commit ${G.short(s.sha)} (${esc(s.message)}) foi pulado: a base já tem essa mesma mudança.</y>`
      : `<y>aviso: o commit ${G.short(s.sha)} (${esc(s.message)}) foi descartado: ficou vazio, porque a base já tem essa mudança.</y>`,
  );
}

function statusLines(repo: Repo): string[] {
  const s = G.status(repo);
  const lines: string[] = [];
  if (s.rebase) {
    lines.push(`<y>rebase em andamento; onto ${G.short(s.rebase.onto)}</y>`);
    if (s.rebase.current) lines.push(`<d>Parado no commit ${G.short(s.rebase.current)}: ${esc(repo.commits[s.rebase.current].message)}</d>`);
    lines.push("<d>  (resolva os conflitos e rode 'git rebase --continue')</d>", "<d>  (use 'git rebase --abort' para desistir)</d>", "");
  } else if (s.branch) {
    lines.push(`On branch <g>${esc(s.branch)}</g>`);
  } else {
    lines.push(`<y>HEAD detached at ${G.short(s.detachedSha!)}</y>`);
  }
  if (s.hasUpstream) {
    if (s.ahead && s.behind) lines.push(`<y>Your branch and 'origin/${esc(s.branch!)}' have diverged,</y>`, `<y>and have ${s.ahead} and ${s.behind} different commits each, respectively.</y>`);
    else if (s.ahead) lines.push(`Your branch is ahead of 'origin/${esc(s.branch!)}' by ${s.ahead} commit(s). <d>(use "git push")</d>`);
    else if (s.behind) lines.push(`<y>Your branch is behind 'origin/${esc(s.branch!)}' by ${s.behind} commit(s).</y> <d>(use "git pull")</d>`);
    else lines.push(`Your branch is up to date with 'origin/${esc(s.branch!)}'.`);
  }
  if (s.inProgress && s.conflicts.length) {
    lines.push("", `<y>You have unmerged paths — ${s.inProgress.kind} em andamento.</y>`, "<d>  (fix conflicts and run \"git commit\")</d>", `<d>  (use "git ${s.inProgress.kind} --abort" to abort)</d>`);
  } else if (s.inProgress) {
    lines.push("", `<y>${s.inProgress.kind} em andamento, sem conflito pendente.</y>`, "<d>  (all conflicts fixed: run \"git commit\")</d>", `<d>  (use "git ${s.inProgress.kind} --abort" to abort)</d>`);
  }
  if (s.conflicts.length) {
    lines.push("", "Unmerged paths:", '<d>  (use "git add <file>..." to mark resolution)</d>');
    for (const c of s.conflicts) lines.push(`\t<r>both modified:   ${esc(c)}</r>`);
  }
  if (s.staged.length) {
    lines.push("", "Changes to be committed:", '<d>  (use "git restore --staged <file>..." to unstage)</d>');
    for (const f of s.staged) lines.push(`\t<g>${label(f.kind)}${esc(f.path)}</g>`);
  }
  if (s.unstaged.length) {
    lines.push("", "Changes not staged for commit:", '<d>  (use "git add <file>..." to update what will be committed)</d>');
    for (const f of s.unstaged) lines.push(`\t<r>${label(f.kind)}${esc(f.path)}</r>`);
  }
  if (s.untracked.length) {
    lines.push("", "Untracked files:", '<d>  (use "git add <file>..." to include in what will be committed)</d>');
    for (const f of s.untracked) lines.push(`\t<r>${esc(f)}</r>`);
  }
  if (!s.staged.length && !s.unstaged.length && !s.untracked.length && !s.conflicts.length) {
    const hasCommit = G.headSha(repo);
    lines.push("", hasCommit ? "nothing to commit, working tree clean" : "<d>No commits yet</d>", "");
  }
  return lines;
}

function label(kind: "new" | "modified" | "deleted"): string {
  return { new: "new file:   ", modified: "modified:   ", deleted: "deleted:    " }[kind];
}

function logLines(repo: Repo, rest: string[]): string[] {
  const { f, pos } = flags(rest, ["-n"]);
  const oneline = f.has("--oneline");
  const graph = f.has("--graph");
  let limit: number | undefined;
  for (const x of f) if (/^-n?\d+$/.test(x)) limit = parseInt(x.replace(/\D/g, ""), 10);
  const ni = rest.indexOf("-n");
  if (ni !== -1) limit = parseInt(rest[ni + 1], 10);
  const entries = G.log(repo, { all: f.has("--all"), from: pos[0], limit });
  if (!entries.length) return ["<d>(nenhum commit ainda)</d>"];
  const lines: string[] = [];
  for (const { commit, refs } of entries) {
    const prefix = graph ? (commit.parents.length > 1 ? "*   " : "* ") : "";
    if (oneline) {
      lines.push(`${prefix}<y>${G.short(commit.sha)}</y>${decor(refs)} ${esc(commit.message)}`);
      if (graph && commit.parents.length > 1) lines.push("|\\  ");
    } else {
      lines.push(`${prefix}<y>commit ${commit.sha}</y>${decor(refs)}`);
      if (commit.parents.length > 1) lines.push(`${graph ? "| " : ""}Merge: ${commit.parents.map(G.short).join(" ")}`);
      lines.push(`${graph ? "| " : ""}Author: ${esc(commit.author)}`, `${graph ? "| " : ""}Date:   ${fmtDate(commit.timestamp)}`, graph ? "| " : "", `${graph ? "| " : ""}    ${esc(commit.message)}`, graph ? "| " : "");
    }
  }
  return lines;
}
