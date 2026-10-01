import { useMemo } from "react";
import { SEGMENTS } from "../../core/segments";
import { exportWorkbook } from "../../lib/excel";
import { download, slug, today } from "../../lib/file";
import type { Nav } from "../App";
import { AccountTable } from "../AccountTable";
import { Icon } from "../icons";
import { useStore } from "../store";
import { fmt, memberVar, pct, Who, w } from "../ui";

export function Portfolio({ id, go, openClient }: { id: string; go: Nav; openClient: (id: string) => void }) {
  const { state, d, owner, isAdmin, session } = useStore();
  const team = state.team;
  const m = team.find((t) => t.id === id);
  const s = d.stats.find((x) => x.id === id);
  const accounts = useMemo(() => [...d.accounts.values()].filter((a) => a.clientIds.some((cid) => owner(cid) === id)), [d.accounts, owner, id]);
  const pending = state.ajouts.filter((a) => a.par === id && a.statut === "en-attente");
  if (!m || !s) return <div className="empty">Personne inconnue.</div>;

  const total = d.active.length;
  const segs = SEGMENTS.map((g) => ({ g, ...s.parSegment[g.id] }))
    .filter((x) => x.clients > 0)
    .sort((a, b) => b.clients - a.clients);
  const maxSeg = Math.max(1, ...segs.map((x) => x.clients));
  const canExport = isAdmin || id === session.me;

  const exportXlsx = () => {
    const bytes = exportWorkbook(d.active, team, (c) => owner(c.id), (code) => (code ? `${code}${state.settings.libellesCodes[code] ? " – " + state.settings.libellesCodes[code] : ""}` : ""), id);
    download(`Portefeuille-${slug(m.nom)}-${today()}.xlsx`, bytes, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  };

  return (
    <>
      <div className="page-head">
        <div className="grow col" style={{ gap: 8 }}>
          <Who team={team} id={id} big label={`Portefeuille de ${m.nom}`} />
          <p>
            {m.responsable ? "Responsable · garde ses clients et les grands comptes" : m.codes.length ? `Codes ERP : ${m.codes.join(", ")}` : "Commercial"}
            {id === session.me && !isAdmin ? " · c'est toi" : ""}
          </p>
        </div>
        <button className="btn" onClick={() => go({ view: "carte", owner: id })}>
          <Icon name="map" size={16} /> Sur la carte
        </button>
        {canExport && (
          <button className="btn" onClick={exportXlsx}>
            <Icon name="download" size={16} /> Excel
          </button>
        )}
      </div>

      <div className="grid g4">
        <div className="card stat">
          <span className="stat-label">Clients</span>
          <span className="hero-num" style={{ fontSize: 44 }}>
            {fmt(s.clients)}
          </span>
          <span className="stat-sub">{pct(s.clients / Math.max(1, total))} du fichier</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Comptes</span>
          <span className="stat-value">{fmt(s.comptes)}</span>
          <span className="stat-sub">payeurs et leurs sites</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Contrats d'entretien</span>
          <span className="stat-value">{fmt(s.contrats)}</span>
          <span className="stat-sub">{pct(s.contrats / Math.max(1, s.clients))} de ses clients</span>
        </div>
        <div className="card stat">
          <span className="stat-label">Poids du portefeuille</span>
          <span className="stat-value">{fmt(s.score)}</span>
          <span className="stat-sub">{pct(s.score / Math.max(1, d.stats.reduce((x, y) => x + y.score, 0)))} du total réparti</span>
        </div>
      </div>

      <div className="grid g3" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-head">
            <h3 className="grow">Typologies</h3>
          </div>
          {segs.map((x) => (
            <div className="hbar" key={x.g.id} style={{ gridTemplateColumns: "minmax(90px,130px) 1fr auto" }}>
              <span className="hbar-label ellipsis">{x.g.court}</span>
              <span className="hbar-track">
                <span style={{ width: w(x.clients / maxSeg), background: memberVar(team, id), borderRadius: "0 4px 4px 0" }} />
              </span>
              <span className="hbar-value">{fmt(x.clients)}</span>
            </div>
          ))}
          {!segs.length && <p className="muted">Aucun client pour l'instant.</p>}
        </div>
        <div className="col span2" style={{ gap: 16 }}>
          {pending.length > 0 && (
            <div className="card">
              <div className="card-head">
                <h3 className="grow">En attente de validation</h3>
                <span className="badge warn">{pending.length}</span>
              </div>
              {pending.map((a) => (
                <div key={a.client.id} className="row small" style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                  <b className="grow ellipsis">{a.client.nom}</b>
                  <span className="muted">
                    {a.client.cp} {a.client.ville}
                  </span>
                </div>
              ))}
            </div>
          )}
          <AccountTable accounts={accounts} openClient={openClient} emptyText={`${m.nom} n'a pas encore de clients.`} />
        </div>
      </div>
    </>
  );
}
