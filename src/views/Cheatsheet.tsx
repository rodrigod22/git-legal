const SECTIONS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Começando",
    rows: [
      ["git init", "transforma a pasta em repositório"],
      ["git status", "o que está modificado, preparado ou sem rastreio"],
      ["git add <arq> / git add .", "coloca na staging (bandeja do commit)"],
      ['git commit -m "msg"', "grava a staging como um commit"],
      ["git log --oneline --graph --all", "histórico compacto com desenho das branches"],
      ["git diff / git diff --staged", "diferenças pendentes / já preparadas"],
      ["git show <sha>", "o que um commit mudou"],
    ],
  },
  {
    title: "Branches",
    rows: [
      ["git branch", "lista (a atual tem *)"],
      ["git switch -c nome", "cria e troca (= checkout -b)"],
      ["git switch nome", "troca de branch"],
      ["git branch -d nome", "apaga branch já mesclada"],
      ["git branch -D nome", "apaga à força"],
      ["git branch -m antigo novo", "renomeia"],
      ["git checkout <sha>", "visita um commit (HEAD desanexado)"],
    ],
  },
  {
    title: "Integrando",
    rows: [
      ["git merge branch", "traz a branch para a atual (ff ou commit de merge)"],
      ["git merge --no-ff branch", "força commit de merge"],
      ["git rebase main", "reaplica seus commits em cima da main (linear)"],
      ["git rebase --continue", "segue depois de resolver conflito"],
      ["git merge --abort / git rebase --abort", "desiste e volta ao estado anterior"],
      ["git cherry-pick <sha>", "copia um commit específico"],
    ],
  },
  {
    title: "Conflitos",
    rows: [
      ["<<<<<<< HEAD", "início do SEU lado"],
      ["=======", "separador"],
      [">>>>>>> outra", "fim do lado que CHEGA"],
      ["edit <arquivo>", "abre o editor para resolver"],
      ["git add <arquivo>", "marca como resolvido"],
      ["git commit", "fecha o merge (ou rebase --continue)"],
    ],
  },
  {
    title: "Remoto (trunk-based RPA)",
    rows: [
      ["git fetch", "baixa o que há no origin, sem mexer nos seus arquivos"],
      ["git pull --rebase", "fetch + reaplica seus commits por cima"],
      ["git push", "envia; rejeitado se o remoto tiver commits novos"],
      ["git status", "mostra ahead/behind em relação a origin/main"],
      ["Ritual", "commit pequeno → pull --rebase → push, várias vezes por dia"],
      ["Proibido", "push --force e reset na main compartilhada"],
    ],
  },
  {
    title: "Desfazendo",
    rows: [
      ["git restore <arq>", "descarta alterações locais do arquivo"],
      ["git restore --staged <arq>", "tira da staging"],
      ["git stash / git stash pop", "guarda / devolve trabalho em andamento"],
      ["git reset --soft HEAD~n", "volta n commits mantendo tudo na staging"],
      ["git reset --hard <ref>", "descarta tudo (só em commits locais!)"],
      ["git revert <sha>", "cria commit inverso (seguro no remoto)"],
      ["git reflog", "diário do HEAD — para resgatar commits perdidos"],
    ],
  },
];

export function Cheatsheet() {
  return (
    <div className="cheatsheet">
      <div className="map-head">
        <div>
          <h1>Cola de Git</h1>
          <div className="muted" style={{ marginTop: 6 }}>
            Os comandos do treinamento, resumidos. Imprima e deixe ao lado do teclado.
          </div>
        </div>
        <button className="btn btn-sm no-print" onClick={() => window.print()}>
          <span aria-hidden="true">🖨 </span>Imprimir
        </button>
      </div>
      <div className="cheat-grid">
        {SECTIONS.map((s) => (
          <div key={s.title} className="card cheat-card">
            <h2>{s.title}</h2>
            <table>
              <tbody>
                {s.rows.map(([c, d]) => (
                  <tr key={c}>
                    <td>{c}</td>
                    <td>{d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
