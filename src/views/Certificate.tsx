import { useStore } from "@/state/store";
import { ALL_MISSIONS } from "@/content";
import { levelFor } from "@/content/gamification";

export function Certificate() {
  const { playerName, progress, xp, badges, go } = useStore();
  const done = ALL_MISSIONS.filter((m) => progress[m.id]).length;
  const complete = done === ALL_MISSIONS.length;
  const lv = levelFor(xp);
  const stars = Object.values(progress).reduce((s, e) => s + e.stars, 0);
  const date = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <div style={{ padding: "20px" }}>
      <div className="row no-print" style={{ maxWidth: 900, margin: "0 auto 10px" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => go("map")}>
          <span aria-hidden="true">← </span>Trilha
        </button>
        <span className="grow" />
        {complete && (
          <button className="btn btn-primary btn-sm" onClick={() => window.print()}>
            <span aria-hidden="true">🖨 </span>Imprimir / salvar PDF
          </button>
        )}
      </div>
      {!complete ? (
        <div className="card" style={{ maxWidth: 600, margin: "40px auto", padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 40 }} aria-hidden="true">🔒</div>
          <h1 style={{ margin: "10px 0", fontSize: 20 }}>Certificado bloqueado</h1>
          <p className="muted">
            Conclua todas as {ALL_MISSIONS.length} missões para liberar. Você já fez {done}.
          </p>
        </div>
      ) : (
        <div className="certificate">
          <div style={{ fontSize: 13, letterSpacing: "0.3em", color: "#6b7280" }}>IRON SYSTEMS · GIT DOJO</div>
          <h1 style={{ marginTop: 10 }}>CERTIFICADO</h1>
          <p style={{ marginTop: 14, color: "#4b5563" }}>Certificamos que</p>
          <div className="name">{playerName}</div>
          <p style={{ color: "#374151", maxWidth: 620, margin: "0 auto", lineHeight: 1.6 }}>
            concluiu o treinamento interativo <b>Git Dojo</b>, demonstrando domínio prático de controle de versão com Git: fundamentos, branches, merges, resolução de conflitos, rebase e o fluxo trunk-based adotado pela Iron Systems.
          </p>
          <div className="meta">
            <div>
              <b>{ALL_MISSIONS.length}</b>
              <br />
              missões
            </div>
            <div>
              <b>{stars}/{ALL_MISSIONS.length * 3}</b>
              <br />
              estrelas
            </div>
            <div>
              <b>{xp} XP</b>
              <br />
              {lv.level.name}
            </div>
            <div>
              <b>{badges.length}</b>
              <br />
              conquistas
            </div>
          </div>
          <div style={{ marginTop: 36, color: "#6b7280", fontSize: 13 }}>{date}</div>
        </div>
      )}
    </div>
  );
}
